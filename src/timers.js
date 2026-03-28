const { formatDuration } = require('./utils');

function calculateTransactionTimerDigits(D6, D7, D8) {
    if ([D6, D7, D8].some(d => Number.isNaN(d) || d < 0 || d > 9)) {
        throw new Error("Invalid transaction digits.");
    }

    if (D6 === 8) {
        return {
            wait: true,
            message: "⚠️ 6th digit is 8 — wait a few minutes until it changes, then try again."
        };
    }

    const current = Number(`${D6}${D7}${D8}`);
    const diff = 888 - current;
    const diffStr = String(diff).padStart(3, "0");
    const [a, b, c] = diffStr.split("").map(Number);

    const baseSeconds =
        (a * 10 * 60) +
        (b * 60) +
        (c * 3);

    const extraGapSeconds = 2 * 60; // +2 minutes
    const totalSeconds = baseSeconds + extraGapSeconds;

    return {
        wait: false,
        diff: diffStr,
        baseSeconds,
        extraGapSeconds,
        totalSeconds,
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
        formatted: formatDuration(totalSeconds)
    };
}

module.exports = { calculateTransactionTimerDigits };