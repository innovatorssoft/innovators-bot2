const figlet = require('figlet');

function showBanner() {
    process.title = 'INNOVATORS Soft WhatsApp Server +447498792682';
    console.log(figlet.textSync('WELCOME To'));
    console.log(figlet.textSync('INNOVATORS'));
    console.log(figlet.textSync('SOFT'));
}

module.exports = {
    showBanner
};
