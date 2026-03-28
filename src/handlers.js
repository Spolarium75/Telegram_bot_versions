function startCountdown(bot, chatId, totalSeconds, timerLabel, notifications = [1800,1200,600,300,60,10], db, timerId) {
    const sentCheckpoints = new Set();
    let elapsed = 0;

    const interval = setInterval(() => {
        const remaining = totalSeconds - elapsed;

        for (let cp of notifications) {
            if (remaining <= cp && !sentCheckpoints.has(cp)) {
                let msg = cp >= 60 ? `⏳ ${timerLabel}: ${Math.floor(cp/60)} minutes remaining!` : `⏳ ${timerLabel}: ${cp} seconds remaining!`;
                bot.sendMessage(chatId, msg);
                sentCheckpoints.add(cp);
            }
        }

        if (remaining <= 0) {
            clearInterval(interval);
            let count = 10;
            const finalInterval = setInterval(() => {
                bot.sendMessage(chatId, `⏱ ${timerLabel}: ${count} second${count !== 1 ? 's' : ''} remaining!`);
                count--;
                if (count < 0) {
                    clearInterval(finalInterval);
                    db.run(`UPDATE timers SET finished = 1 WHERE id = ?`, [timerId]);
                }
            }, 1000);
        }

        elapsed++;
    }, 1000);

    return interval;
}

module.exports = { startCountdown };