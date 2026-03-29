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
    { command: "stop", description: "Stop the active timer" }
]);

const timers = {};

function calculateTransactionTimer(txDigits) {
    const [D6, D7, D8] = txDigits.split('').map(Number);

    if (D6 === 8 || D6 === 9) return { wait: true };

    const remainingD6 = 8 - D6;
    const remainingD7 = 8 - D7;
    const remainingD8 = 8 - D8;

    const totalSeconds = remainingD6 * 620 + remainingD7 * 60 + remainingD8 * 6;
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
    👋 *Welcome!* Choose an option below or use shortcuts:
    /start, /current, /history, /help, /stop
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
    `;

    bot.sendMessage(chatId, helpText, { parse_mode: "Markdown", ...getMainMenu() });
});

// ----------- /current handler ----------
bot.onText(/\/current/, (msg) => {
    const chatId = msg.chat.id;
    const timer = timers[chatId];

    const remainingSeconds = Math.max(0, Math.floor((timer.totalSeconds) / 1000));

    if (timer[chatId]) {
        bot.sendMessage(chatId, "⏱ You have a timer running!", { ...getMainMenu() });
        bot.sendMessage(chatId, `🕒 ${timer.label} - ${formatTime(remainingSeconds)} (⏳ Active)`);
    }
    else {
        bot.sendMessage(chatId, "❌ No active timer.", { ...getMainMenu() });
    }
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
bot.onText(/\/add (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const minutes = parseInt(match[1]);
    const totalSeconds = minutes * 60;
    const timerLabel = `Manual Timer (${minutes} min)`;
    const timer = timers[chatId];

    if (timer) {
        bot.sendMessage(chatId, "❌ You already have an active timer. Use /stop first.", { ...getMainMenu() });
        return;
    }

    const intervalId = startCountdown(bot, chatId, totalSeconds, timerLabel, undefined, db, null);
    timer[chatId] = intervalId;

    bot.sendMessage(chatId, `⏱ Timer started for ${minutes} minute(s)!`, { ...getMainMenu() });
});

// /stop
bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    const timer = timers[chatId];
    if (timer && timer.interval) {
        clearInterval(timer.interval);
        delete timers[chatId];
        bot.sendMessage(chatId, "🛑 Timer stopped.");
    } else bot.sendMessage(chatId, "No active timer to stop.");
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
                "⏰ Add Timer - Create a new timer (Manual or Transaction Order)\n" +
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
                timerInfo.interval = startCountdown(bot, chatId, totalSeconds, label, timerInfo.notifications, db, this.lastID);
            });
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
                timerInfo.interval = startCountdown(bot, chatId, totalSeconds, label, timerInfo.notifications, db, this.lastID);
            });
    }
});

console.log("✅ Telegram Timer Bot is running!");