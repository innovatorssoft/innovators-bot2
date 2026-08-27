function formatCode(code) {
    if (typeof code === 'string' && code.length === 8) {
        return code.slice(0, 4) + ' - ' + code.slice(4);
    }
    return code;
}

module.exports = {
    formatCode
};
