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

function startCountdown(bot, chatId, totalSeconds, timerLabel, notifications = [1800,1200,600,300,60], db, timerId) {
    const sentCheckpoints = new Set();
    const startedAt = Math.floor(Date.now() / 1000);

    const interval = setInterval(() => {
        const elapsed = Math.floor(Date.now() / 1000) - startedAt;
        const remaining = Math.max(0, totalSeconds - elapsed);

        // checkpoint reminders
        for (const cp of notifications) {
            if (remaining <= cp && remaining > cp - 2 && !sentCheckpoints.has(cp)) {
                const msg =
                    cp >= 60
                        ? `⏳ *${timerLabel}*: ${Math.floor(cp / 60)} minute${Math.floor(cp / 60) !== 1 ? "s" : ""} remaining!`
                        : `⏳ *${timerLabel}*: ${cp} second${cp !== 1 ? "s" : ""} remaining!`;

                bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
                sentCheckpoints.add(cp);
            }
        }

        // last 10 seconds countdown during the same timer
        if (remaining <= 10 && remaining > 0 && !sentCheckpoints.has(`final-${remaining}`)) {
            sentCheckpoints.add(`final-${remaining}`);
            bot.sendMessage(
                chatId,
                `⏱ *${timerLabel}*: ${remaining} second${remaining !== 1 ? "s" : ""} remaining!`,
                { parse_mode: "Markdown" }
            );
        }

        // finish immediately at zero
        if (remaining <= 0) {
            clearInterval(interval);

            if (db && timerId) {
                db.run(`UPDATE timers SET finished = 1 WHERE id = ?`, [timerId]);
            }

            bot.sendMessage(
                chatId,
                `🎉 *${timerLabel}* has reached the target time!\n\nWhat would you like to do next?`,
                {
                    parse_mode: "Markdown",
                    ...getMainMenu()
                }
            );
        }
    }, 1000);

    return {
        interval,
        totalSeconds,
        startedAt,
        label: timerLabel,
        timerId
    };
}

module.exports = { startCountdown, getMainMenu };