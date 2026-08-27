const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Convert audio Buffer or file to OGG format with Opus codec for WhatsApp PTT (Voice Note)
 * @param {Buffer|string} input - Audio Buffer or path to audio file
 * @returns {Promise<Buffer>} - Converted OGG Opus audio buffer
 */
async function convertAudioToOgg(input) {
    return new Promise((resolve, reject) => {
        const tempId = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const tempIn = path.join(os.tmpdir(), `input_${tempId}.tmp`);
        const tempOut = path.join(os.tmpdir(), `output_${tempId}.ogg`);

        const cleanup = () => {
            try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch (_) {}
            try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch (_) {}
        };

        try {
            if (Buffer.isBuffer(input)) {
                fs.writeFileSync(tempIn, input);
            } else if (typeof input === 'string') {
                if (fs.existsSync(input)) {
                    fs.copyFileSync(input, tempIn);
                } else {
                    return reject(new Error('Input file not found: ' + input));
                }
            } else {
                return reject(new Error('Input must be a Buffer or file path string'));
            }

            ffmpeg(tempIn)
                .audioCodec('libopus')
                .audioChannels(1)
                .audioFrequency(48000)
                .audioBitrate('128k')
                .outputOptions([
                    '-avoid_negative_ts', 'make_zero',
                    '-vbr', 'on',
                    '-compression_level', '10'
                ])
                .format('ogg')
                .on('error', (err) => {
                    cleanup();
                    reject(new Error(`Failed to convert audio to OGG for PTT: ${err.message}`));
                })
                .on('end', () => {
                    try {
                        const outBuffer = fs.readFileSync(tempOut);
                        cleanup();
                        resolve(outBuffer);
                    } catch (err) {
                        cleanup();
                        reject(err);
                    }
                })
                .save(tempOut);
        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}

module.exports = {
    convertAudioToOgg,
    toPTT: convertAudioToOgg
};
