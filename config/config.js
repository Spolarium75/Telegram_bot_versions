require('dotenv').config();
module.exports = {
    token: process.env.BOT_TOKEN,
    reminders: [1800, 1200, 600, 300, 60, 10]
};  