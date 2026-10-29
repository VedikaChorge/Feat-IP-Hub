const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function makeReferenceId() {
  return `IP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// PNG-only LSB watermark. This is a prototype tracing aid, not a robust or secure ownership proof.
function watermarkPng(inputBuffer, referenceId) {
  const png = PNG.sync.read(inputBuffer);
  const payload = Buffer.from(`IP-EVIDENCE:${referenceId}`, 'utf8');
  const lengthPrefix = Buffer.alloc(2);
  if (payload.length > 65535) throw new Error('Watermark payload too long');
  lengthPrefix.writeUInt16BE(payload.length);
  const bits = [];
  for (const byte of Buffer.concat([lengthPrefix, payload])) {
    for (let bit = 7; bit >= 0; bit--) bits.push((byte >> bit) & 1);
  }
  if (bits.length > png.width * png.height * 3) throw new Error('Image is too small to contain this watermark');
  let bitIndex = 0;
  for (let i = 0; i < png.data.length && bitIndex < bits.length; i += 4) {
    for (let c = 0; c < 3 && bitIndex < bits.length; c++) {
      png.data[i + c] = (png.data[i + c] & 0xFE) | bits[bitIndex++];
    }
  }
  return PNG.sync.write(png);
}
function detectWatermarkPng(inputBuffer) {
  const png = PNG.sync.read(inputBuffer);
  const bits = [];
  for (let i = 0; i < png.data.length; i += 4) for (let c = 0; c < 3; c++) bits.push(png.data[i + c] & 1);
  function readBytes(startBit, count) {
    const out = Buffer.alloc(count);
    for (let b = 0; b < count; b++) {
      let value = 0;
      for (let k = 0; k < 8; k++) value = (value << 1) | (bits[startBit + b * 8 + k] || 0);
      out[b] = value;
    }
    return out;
  }
  if (bits.length < 16) return null;
  const length = readBytes(0, 2).readUInt16BE(0);
  if (length === 0 || 16 + length * 8 > bits.length) return null;
  const text = readBytes(16, length).toString('utf8');
  const prefix = 'IP-EVIDENCE:';
  return text.startsWith(prefix) ? text.slice(prefix.length) : null;
}
function readStore(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
}
function writeStore(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, filePath);
}
module.exports = { sha256, makeReferenceId, watermarkPng, detectWatermarkPng, readStore, writeStore };
