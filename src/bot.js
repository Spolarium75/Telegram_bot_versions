require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const db = require('../db');
const { startCountdown, getMainMenu } = require('./handlers');
const { formatTime } = require('./utils');

const bot = new TelegramBot(config.token, { polling: true });

bot.setMyCommands([
    { command: "start", description: "Show main menu" },
    { command: "current", description: "Show current timer" },
    { command: "history", description: "Show timer history" },
    { command: "help", description: "Show bot help / shortcuts" },
    { command: "stop", description: "Stop the active timer" },
    { command: "add", description: "Add a new timer" }
]);

const timers = {};

function calculateTransactionTimer(txDigits) {
    const [D6, D7, D8] = txDigits.split('').map(Number);

    if (D6 === 8 || D6 === 9) return { wait: true };

    const remainingD6 = 8 - D6;
    const remainingD7 = 8 - D7;
    const remainingD8 = 8 - D8;

    const totalSeconds = remainingD6 * 623 + remainingD7 * 62 + remainingD8 * 6.3;
    const { h, m, s } = formatTime(totalSeconds);
    return { totalSeconds, hours: h, minutes: m, seconds: s, wait: false };
}


db.all(`SELECT * FROM timers WHERE finished = 0`, [], (err, rows) => {
    if (rows) {
        rows.forEach(row => {
            const { chat_id, label, total_seconds, start_time, id } = row;
            const elapsed = Math.floor(Date.now()/1000) - start_time;
            const remaining = total_seconds - elapsed;
            if (remaining > 0) {
                timers[chat_id] = { interval: startCountdown(bot, chat_id, remaining, label, [1800,1200,600,300,60,10], db, id) };
            } else {
                db.run(`UPDATE timers SET finished = 1 WHERE id = ?`, [id]);
            }
        });
    }
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const { first_name, last_name, username } = msg.from;

    db.run(
        `INSERT OR REPLACE INTO users (chat_id, first_name, last_name, username) VALUES (?, ?, ?, ?)`,
        [chatId, first_name || '', last_name || '', username || '']
    );

    const startText = `
    👋 *Welcome!* \nChoose an option below or use shortcuts:\n
    /start | /current | /history | /help | /stop | /add
    `;

    bot.sendMessage(chatId, startText, {
        parse_mode: "Markdown",
        ...getMainMenu()
    });
});

// ----------- /help handler ----------
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;

    const helpText = `
    📌 *Bot Shortcuts:*
    /start - Show main menu
    /current - Show current timer
    /history - Show timer history
    /help - Show this message
    /stop - Stop the active timer
    /add m (<time>) - Add a new manual timer
    /add t (<digits>) - Add a new transaction timer
    `;

    bot.sendMessage(chatId, helpText, { parse_mode: "Markdown", ...getMainMenu() });
});

// ----------- /current handler ----------
bot.onText(/\/current/, (msg) => {
    const chatId = msg.chat.id;
    const timer = timers[chatId];

    if (!timer || !timer.interval) {
        bot.sendMessage(chatId, "❌ No active timer.", { ...getMainMenu() });
        return;
    }

    const elapsed = Math.floor(Date.now() / 1000) - timer.startedAt;
    const remainingSeconds = Math.max(0, timer.totalSeconds - elapsed);
    const { h, m, s } = formatTime(remainingSeconds);

    bot.sendMessage(
        chatId,
        `🕒 *${timer.label}*\nTime Remaining: ${h}h ${m}m ${s}s\nStatus: ⏳ Active`,
        { parse_mode: "Markdown", ...getMainMenu() }
    );
});

// ----------- /history handler ----------
bot.onText(/\/history/, (msg) => {
    const chatId = msg.chat.id;

    db.all(
        `SELECT * FROM timers WHERE chat_id = ? ORDER BY created_at DESC LIMIT 10`,
        [chatId],
        (err, rows) => {
            if (err) return console.error(err);

            if (rows.length === 0) {
                bot.sendMessage(chatId, "📜 No timer history found.", { ...getMainMenu() });
            } else {
                let historyText = "📜 *Last 10 timers:*\n";
                rows.forEach((row) => {
                    historyText += `- ${row.label} | ${row.finished ? "Finished ✅" : "Running ⏳"}\n`;
                });
                bot.sendMessage(chatId, historyText, { parse_mode: "Markdown", ...getMainMenu() });
            }
        }
    );
});

// ----------- Example: manual /add timer ----------
bot.onText(/\/add(?:\s+([mt]))(?:\s+(.+))?/i, (msg, match) => {
    const chatId = msg.chat.id;
    const mode = (match[1] || "").toLowerCase();
    const value = (match[2] || "").trim();

    if (!mode || !value) {
        bot.sendMessage(
            chatId,
            "❌ Usage:\n/add m 90  -> manual timer (90 minutes)\n/add t 012 -> transaction timer (3 digits)",
            { ...getMainMenu() }
        );
        return;
    }

    if (timers[chatId] && timers[chatId].interval) {
        bot.sendMessage(
            chatId,
            "❌ You already have an active timer.\nUse /stop first.",
            { ...getMainMenu() }
        );
        return;
    }

    // Manual timer
    if (mode === "m") {
        const minutes = parseInt(value, 10);

        if (isNaN(minutes) || minutes <= 0) {
            bot.sendMessage(chatId, "❌ Please enter a valid number of minutes.", { ...getMainMenu() });
            return;
        }

        const totalSeconds = minutes * 60;
        const label = `Manual Timer (${minutes} min)`;
        const startTime = Math.floor(Date.now() / 1000);

        db.run(
            `INSERT INTO timers (chat_id, type, label, total_seconds, start_time) VALUES (?, ?, ?, ?, ?)`,
            [chatId, 'manual', label, totalSeconds, startTime],
            function(err) {
                if (err) {
                    bot.sendMessage(chatId, "❌ Failed to create manual timer.");
                    return;
                }

                bot.sendMessage(chatId, `⏱ Manual timer started for ${minutes} minute(s)!`, {
                    ...getMainMenu()
                });

                const timerData = startCountdown(
                    bot,
                    chatId,
                    totalSeconds,
                    label,
                    [1800, 1200, 600, 300, 60],
                    db,
                    this.lastID
                );

                timerData.type = "manual";
                timerData.notifications = [1800, 1200, 600, 300, 60];
                timers[chatId] = timerData;
            }
        );

        return;
    }

    // Transaction timer
    if (mode === "t") {
        const txDigits = value;

        if (!/^\d{3}$/.test(txDigits)) {
            bot.sendMessage(chatId, "❌ Transaction timer needs exactly 3 digits, example: /add t 012", {
                ...getMainMenu()
            });
            return;
        }

        const { totalSeconds, hours, minutes, seconds, wait } = calculateTransactionTimer(txDigits);

        if (wait) {
            bot.sendMessage(chatId, "⚠️ 6th digit is 8 or 9 — wait a few minutes then try again.", {
                ...getMainMenu()
            });
            return;
        }

        const label = `Transaction ${txDigits}`;
        const startTime = Math.floor(Date.now() / 1000);

        db.run(
            `INSERT INTO timers (chat_id, type, label, total_seconds, start_time) VALUES (?, ?, ?, ?, ?)`,
            [chatId, 'transaction', label, totalSeconds, startTime],
            function(err) {
                if (err) {
                    bot.sendMessage(chatId, "❌ Failed to create transaction timer.");
                    return;
                }

                bot.sendMessage(
                    chatId,
                    `⏳ Transaction timer created!\nTime until next 888: ${hours}h ${minutes}m ${seconds}s`,
                    { ...getMainMenu() }
                );

                const timerData = startCountdown(
                    bot,
                    chatId,
                    totalSeconds,
                    label,
                    [1800, 1200, 600, 300, 60],
                    db,
                    this.lastID
                );

                timerData.type = "transaction";
                timerData.notifications = [1800, 1200, 600, 300, 60];
                timers[chatId] = timerData;
            }
        );

        return;
    }

    bot.sendMessage(
        chatId,
        "❌ Unknown timer type.\nUse /add m 90 or /add t 012",
        { ...getMainMenu() }
    );
});

// /stop
bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    const timer = timers[chatId];

    if (!timer || !timer.interval) {
        bot.sendMessage(chatId, "❌ No active timer to stop.", { ...getMainMenu() });
        return;
    }

    clearInterval(timer.interval);

    if (timer.timerId) {
        db.run(`UPDATE timers SET finished = 1 WHERE id = ?`, [timer.timerId]);
    }

    delete timers[chatId];

    bot.sendMessage(chatId, "🛑 Timer stopped.", { ...getMainMenu() });
});

// Callback queries
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    switch(query.data){
        case 'add_timer':
            bot.sendMessage(chatId, "Choose Timer Type:", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Manual", callback_data: 'manual_timer' }],
                        [{ text: "Transaction Order", callback_data: 'transaction_timer' }]
                    ]
                }
            });
            break;
        case 'manual_timer':
            bot.sendMessage(chatId, "Send timer in minutes (e.g., 90 for 1h30m):");
            timers[chatId] = { type: 'manual', notifications: [1800,1200,600,300,60,10] };
            break;
        case 'transaction_timer':
            bot.sendMessage(chatId, "Send the 3 digits (6th–8th) of your transaction, e.g., `012`:");
            timers[chatId] = { type: 'transaction', notifications: [1800,1200,600,300,60,10] };
            break;
        case 'current_timer':
            db.get(`SELECT * FROM timers WHERE chat_id = ? AND finished = 0 ORDER BY id DESC LIMIT 1`, [chatId], (err, row) => {
                if (!row) return bot.sendMessage(chatId, "ℹ️ You have no active timers.");
                const { label, total_seconds, start_time } = row;
                const remaining = total_seconds - Math.floor(Date.now()/1000 - start_time);
                const { h, m, s } = formatTime(remaining);
                bot.sendMessage(chatId, `⏳ Current Timer: ${label}\nTime Remaining: ${h}h ${m}m ${s}s`);
            });
            break;
        case 'timer_history':
            db.all(`SELECT * FROM timers WHERE chat_id = ? ORDER BY id DESC LIMIT 10`, [chatId], (err, rows) => {
                if (!rows.length) return bot.sendMessage(chatId, "ℹ️ No timer history found.");
                let msg = "📜 Last 10 Timers:\n";
                rows.forEach(r => {
                    const { label, total_seconds, finished } = r;
                    const status = finished ? "✅ Finished" : "⏳ Active";
                    const { h, m, s } = formatTime(total_seconds);
                    msg += `${label} - ${h}h ${m}m ${s}s (${status})\n`;
                });
                bot.sendMessage(chatId, msg);
            });
            break;
        case 'help':
            bot.sendMessage(chatId, "❓ **Timer Bot Help**\n\n" +
                "⏰ Add Timer - Create a new timer (/add m (time) Manual or /add t (digits) Transaction Order)\n" +
                "🕒 Current Timer - See your active timer\n" +
                "📜 Timer History - Last 10 timers\n" +
                "❓ Help - This message\n\n" +
                "Manual Timer: Send minutes or hours/minutes\n" +
                "Transaction Timer: Send 3 digits (6th–8th) to calculate next 888 pattern",
                { parse_mode: "Markdown" });
            break;
    }
});

// Message handling
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.text.startsWith('/')) return;

    const timerInfo = timers[chatId];
    if (!timerInfo) return;

    if (timerInfo.type === 'manual') {
        const mins = parseInt(msg.text);
        if (isNaN(mins)) return bot.sendMessage(chatId, "❌ Please send a valid number in minutes.");
        const totalSeconds = mins * 60;
        const label = `Manual Timer`;
        const startTime = Math.floor(Date.now()/1000);
        db.run(`INSERT INTO timers (chat_id, type, label, total_seconds, start_time) VALUES (?, ?, ?, ?, ?)`,
            [chatId, 'manual', label, totalSeconds, startTime], function(err){
                bot.sendMessage(chatId, `⏰ Timer set for ${mins} minutes!`);
                timers[chatId] = startCountdown(bot, chatId, totalSeconds, label, timerInfo.notifications, db, this.lastID);
                timers[chatId].type = 'manual';
                timers[chatId].notifications = timerInfo.notifications;            });
    }

    if (timerInfo.type === 'transaction') {
        const txDigits = msg.text.trim();
        if (!/^\d{3}$/.test(txDigits)) return bot.sendMessage(chatId, "❌ Send exactly 3 digits (6th–8th).");
        const { totalSeconds, hours, minutes, seconds, wait } = calculateTransactionTimer(txDigits);
        if (wait) return bot.sendMessage(chatId, "⚠️ 6th digit is 8|9 — wait a few minutes then try again.");

        const label = `Transaction ${txDigits}`;
        const startTime = Math.floor(Date.now()/1000);
        db.run(`INSERT INTO timers (chat_id, type, label, total_seconds, start_time) VALUES (?, ?, ?, ?, ?)`,
            [chatId, 'transaction', label, totalSeconds, startTime], function(err){
                bot.sendMessage(chatId, `⏳ Timer created! Time until next 888: ${hours}h ${minutes}m ${seconds}s`);
                timers[chatId] = startCountdown(bot, chatId, totalSeconds, label, timerInfo.notifications, db, this.lastID);
                timers[chatId].type = 'transaction';
                timers[chatId].notifications = timerInfo.notifications;            });
    }
});

console.log("✅ Telegram Timer Bot is running!");