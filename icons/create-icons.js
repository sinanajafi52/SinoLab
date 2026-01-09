/**
 * Icon Generator Script
 * Run with: node create-icons.js
 *
 * This script creates PNG icons for the Frog Pump PWA.
 * If canvas is not available, it creates placeholder files.
 */

const fs = require('fs');
const path = require('path');

// Simple 1x1 green PNG as base64 (minimal valid PNG)
const GREEN_PIXEL_PNG = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  // 1x1 dimensions
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  // IDAT chunk
    0x54, 0x08, 0xD7, 0x63, 0x90, 0xE1, 0x9D, 0x18,  // Green pixel data
    0x00, 0x00, 0x03, 0x8D, 0x00, 0xFE, 0x90, 0x63,
    0x59, 0x2E, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,  // IEND chunk
    0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

// Create a simple placeholder PNG file
function createPlaceholderIcon(filename) {
    const filepath = path.join(__dirname, filename);
    fs.writeFileSync(filepath, GREEN_PIXEL_PNG);
    console.log(`Created placeholder: ${filename}`);
}

// Try to use canvas if available, otherwise create placeholders
try {
    const { createCanvas } = require('canvas');

    function drawFrogIcon(size) {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        const scale = size / 192;

        // Background
        ctx.fillStyle = '#0f172a';
        roundRect(ctx, 0, 0, size, size, 24 * scale);
        ctx.fill();

        // Frog face base
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(96 * scale, 100 * scale, 50 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (outer green)
        ctx.beginPath();
        ctx.ellipse(72 * scale, 75 * scale, 18 * scale, 20 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(120 * scale, 75 * scale, 18 * scale, 20 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye whites
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.ellipse(72 * scale, 72 * scale, 12 * scale, 14 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(120 * scale, 72 * scale, 12 * scale, 14 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(74 * scale, 72 * scale, 6 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(122 * scale, 72 * scale, 6 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(76 * scale, 69 * scale, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(124 * scale, 69 * scale, 2 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Mouth
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 4 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(66 * scale, 115 * scale);
        ctx.quadraticCurveTo(96 * scale, 135 * scale, 126 * scale, 115 * scale);
        ctx.stroke();

        // Nostrils
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(86 * scale, 100 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(106 * scale, 100 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.fill();

        return canvas.toBuffer('image/png');
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // Generate icons
    fs.writeFileSync(path.join(__dirname, 'icon-192.png'), drawFrogIcon(192));
    console.log('Created icon-192.png');

    fs.writeFileSync(path.join(__dirname, 'icon-512.png'), drawFrogIcon(512));
    console.log('Created icon-512.png');

    console.log('Icons generated successfully!');

} catch (error) {
    console.log('Canvas not available, creating placeholder icons...');
    console.log('For proper icons, open generate-icons.html in a browser');

    createPlaceholderIcon('icon-192.png');
    createPlaceholderIcon('icon-512.png');
}
