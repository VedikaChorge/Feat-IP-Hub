const test = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { sha256, makeReferenceId, watermarkPng, detectWatermarkPng } = require('./core');

test('SHA-256 is deterministic and changes when bytes change', () => {
  assert.equal(sha256(Buffer.from('abc')), sha256(Buffer.from('abc')));
  assert.notEqual(sha256(Buffer.from('abc')), sha256(Buffer.from('abd')));
  assert.equal(sha256(Buffer.from('abc')).length, 64);
});
test('reference IDs are generated in expected format', () => {
  assert.match(makeReferenceId(), /^IP-[A-Z0-9]+-[A-F0-9]{6}$/);
});
test('PNG watermark can be embedded and detected', () => {
  const png = new PNG({ width: 64, height: 64 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 100; png.data[i+1] = 150; png.data[i+2] = 200; png.data[i+3] = 255; }
  const original = PNG.sync.write(png);
  const marked = watermarkPng(original, 'IP-TEST-123');
  assert.equal(detectWatermarkPng(marked), 'IP-TEST-123');
  assert.notEqual(sha256(original), sha256(marked));
});
test('watermark detector safely returns null for ordinary PNG', () => {
  const png = new PNG({ width: 64, height: 64 });
  png.data.fill(128);
  assert.equal(detectWatermarkPng(PNG.sync.write(png)), null);
});
