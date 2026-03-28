const config = require('../config/config');
const { formatDuration } = require('./utils');

function startCountdown(bot, chatId, totalSeconds, label, timers, historyStore) {
    const reminders = config.reminders || [1800, 1200, 600, 300, 60, 10];
    const sent = new Set();

    const startedAt = Date.now();
    const endsAt = startedAt + totalSeconds * 1000;

    timers[chatId] = {
        ...(timers[chatId] || {}),
        label,
        totalSeconds,
        startedAt,
        endsAt,
        status: "active"
    };

    const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));

        for (const cp of reminders) {
            if (remaining === cp && !sent.has(cp)) {
                if (cp >= 60) {
                    bot.sendMessage(
                        chatId,
                        `⏳ ${label}: ${Math.floor(cp / 60)} minute${Math.floor(cp / 60) !== 1 ? "s" : ""} remaining!`
                    );
                } else {
                    bot.sendMessage(chatId, `⏳ ${label}: ${cp} seconds remaining!`);
                }
                sent.add(cp);
            }
        }

        if (remaining <= 10 && remaining > 0 && !sent.has(`final-${remaining}`)) {
            bot.sendMessage(
                chatId,
                `⏱ ${label}: ${remaining} second${remaining !== 1 ? "s" : ""} remaining!`
            );
            sent.add(`final-${remaining}`);
        }

        if (remaining <= 0) {
            clearInterval(interval);

            bot.sendMessage(chatId, `🎉 ${label} has reached the target time!`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Add Timer", callback_data: "add_timer" }],
                        [{ text: "Status", callback_data: "status" }],
                        [{ text: "Stop", callback_data: "stop" }]
                    ]
                }
            });

            if (historyStore && Array.isArray(historyStore[chatId])) {
                historyStore[chatId].unshift({
                    label,
                    totalSeconds,
                    status: "finished",
                    createdAt: new Date().toISOString()
                });
                historyStore[chatId] = historyStore[chatId].slice(0, 10);
            }

            delete timers[chatId];
        }
    }, 1000);

    timers[chatId].interval = interval;
    return interval;
}

function getCurrentTimerText(timerInfo) {
    if (!timerInfo || !timerInfo.endsAt) return "No active timer.";

    const remainingSeconds = Math.max(0, Math.floor((timerInfo.endsAt - Date.now()) / 1000));
    return `${timerInfo.label} - ${formatDuration(remainingSeconds)} (⏳ Active)`;
}

module.exports = { startCountdown, getCurrentTimerText };