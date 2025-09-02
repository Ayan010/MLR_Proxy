const Tesseract = require('tesseract.js');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

// Function to read OCR from an image
async function readOCRFromImage(imagePathOrUrl, callback) {
    try {
        let localImagePath = imagePathOrUrl;

        // Check if the input is a URL
        if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
            const response = await axios({
                url: imagePathOrUrl,
                method: 'GET',
                responseType: 'arraybuffer',
            });

            // Save the image to a temporary file
            const tempFilePath = path.join(__dirname, 'temp-image.jpg');
            fs.writeFileSync(tempFilePath, response.data);
            localImagePath = tempFilePath;
        }

        // Perform OCR
        Tesseract.recognize(
            localImagePath, // Path to the image
            'eng', // Language code
            {
                logger: info => console.log(info), // Log progress
            }
        ).then(({ data: { text } }) => {
            callback(null, text);

            // Clean up temporary file if it was downloaded
            if (localImagePath !== imagePathOrUrl) {
                fs.unlinkSync(localImagePath);
            }
        }).catch(error => {
            callback(error);
        });
    } catch (error) {
        callback(error);
    }
}

module.exports = { readOCRFromImage };
