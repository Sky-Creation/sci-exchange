const fs = require('fs');
const Jimp = require('jimp');
const jsQR = require('jsqr');
const crc = require('node-crc');

class SlipService {
    
    /**
     * Main function to verify a slip image
     * @param {Buffer} imageBuffer - The uploaded image file buffer
     * @returns {Promise<Object>} - Verification result
     */
    async verifySlip(imageBuffer) {
        try {
            // 1. Load image using Jimp
            const image = await Jimp.read(imageBuffer);
            const { data, width, height } = image.bitmap;

            // 2. Decode QR Code
            const code = jsQR(data, width, height);
            
            if (!code) {
                return { valid: false, message: 'No QR code found in slip image.' };
            }

            const payload = code.data;

            // 3. Verify Thai QR Payload Structure & CRC
            // Valid Thai Bank QR payloads typically start with '00' (Payload Format Indicator)
            // and end with the CRC checksum ID '6304'.
            if (!this.isValidPayloadFormat(payload)) {
                return { valid: false, message: 'Invalid QR payload format. Not a standard Thai bank slip.' };
            }

            if (!this.verifyCRC(payload)) {
                return { valid: false, message: 'CRC Checksum failed. Slip data may be corrupted or fake.' };
            }

            // 4. Extract Key Data (Optional parsing)
            const extractedData = this.parsePayload(payload);

            return {
                valid: true,
                message: 'Slip format verified successfully.',
                data: {
                    raw: payload,
                    senderBankId: extractedData.sendingBank,
                    transRef: extractedData.transRef,
                    amount: extractedData.amount // Note: Amount is not always present in the mini-QR on slips
                }
            };

        } catch (error) {
            console.error('Slip verification error:', error);
            return { valid: false, message: 'Internal verification error.' };
        }
    }

    // Helper: Check basic structure
    isValidPayloadFormat(payload) {
        return payload.startsWith('00') && payload.includes('6304');
    }

    // Helper: Verify CRC16 Checksum (CCITT-FALSE)
    verifyCRC(payload) {
        // The CRC is the last 4 characters
        const dataWithoutCRC = payload.slice(0, -4);
        const targetCRC = payload.slice(-4).toUpperCase();
        
        // Calculate CRC16 of the data
        const calculatedCRC = crc.crc16ccitt(dataWithoutCRC).toString('hex').toUpperCase();
        
        // Pad with leading zeros if needed to ensure 4 chars
        const paddedCRC = calculatedCRC.padStart(4, '0');

        return paddedCRC === targetCRC;
    }

    // Helper: Basic Parsing (EMVCo TLV Standard)
    parsePayload(payload) {
        // This is a simplified parser. 
        // Real Thai slips store specific bank tags usually under Tag 29 or similar.
        // For full verification, you would typically send 'transRef' to a Bank Open API (like KBank or SCB).
        
        return {
            sendingBank: 'Unknown', // Requires deep TLV parsing
            transRef: payload,        // In a real app, parse specific tags for Ref ID
            amount: null              // Amount is often not in the slip QR (privacy), only in the scanning app
        };
    }
}

module.exports = new SlipService();