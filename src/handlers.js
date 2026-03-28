// src/handlers.js

function getMainMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⏰ Add Timer", callback_data: "add_timer" }],
                [{ text: "🕒 Current Timer", callback_data: "current_timer" }],
                [{ text: "📜 Timer History", callback_data: "timer_history" }],
                [{ text: "❓ Help", callback_data: "help" }]
            ]
        }
    };
}

function startCountdown(bot, chatId, totalSeconds, timerLabel, notifications = [1800,1200,600,300,60,10], db, timerId) {
    const sentCheckpoints = new Set();
    let elapsed = 0;

    const interval = setInterval(() => {
        const remaining = totalSeconds - elapsed;

        // Send checkpoint reminders
        for (let cp of notifications) {
            if (remaining <= cp && !sentCheckpoints.has(cp)) {
                let msg =
                    cp >= 60
                        ? `⏳ *${timerLabel}*: ${Math.floor(cp / 60)} minute${Math.floor(cp / 60) !== 1 ? "s" : ""} remaining!`
                        : `⏳ *${timerLabel}*: ${cp} second${cp !== 1 ? "s" : ""} remaining!`;

                bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
                sentCheckpoints.add(cp);
            }
        }

        // Final countdown
        if (remaining <= 0) {
            clearInterval(interval);

            let count = 10;
            const finalInterval = setInterval(() => {
                if (count > 0) {
                    bot.sendMessage(
                        chatId,
                        `⏱ *${timerLabel}*: ${count} second${count !== 1 ? "s" : ""} remaining!`,
                        { parse_mode: "Markdown" }
                    );
                } else {
                    bot.sendMessage(
                        chatId,
                        `🎉 *${timerLabel}* has reached the target time!\n\nWhat would you like to do next?`,
                        {
                            parse_mode: "Markdown",
                            ...getMainMenu()
                        }
                    );

                    if (db && timerId) {
                        db.run(`UPDATE timers SET finished = 1 WHERE id = ?`, [timerId]);
                    }

                    clearInterval(finalInterval);
                }

                count--;
            }, 1000);
        }

        elapsed++;
    }, 1000);

    return interval;
}

module.exports = { startCountdown, getMainMenu };