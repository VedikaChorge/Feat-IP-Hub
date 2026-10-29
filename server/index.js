require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ethers } = require('ethers');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { sha256, makeReferenceId, watermarkPng, detectWatermarkPng, readStore, writeStore } = require('./core');

const ROOT = path.join(__dirname, '..');
const UPLOADS = path.join(ROOT, 'uploads');
const WATERMARKED = path.join(ROOT, 'watermarked');
const DATA_FILE = path.join(ROOT, 'data', 'evidence.json');
for (const dir of [UPLOADS, WATERMARKED, path.dirname(DATA_FILE)]) fs.mkdirSync(dir, { recursive: true });
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));
const upload = multer({ dest: UPLOADS, limits: { fileSize: 15 * 1024 * 1024 } });

const ABI = [
  'function registerEvidence(bytes32 fileHash, string referenceId) external',
  'function getEvidence(bytes32 fileHash) view returns (address registrant, uint64 registeredAt, bool exists)',
  'event EvidenceRegistered(bytes32 indexed fileHash, string referenceId, address indexed registrant, uint64 registeredAt)'
];
function blockchain() {
  if (!process.env.RPC_URL || !process.env.CONTRACT_ADDRESS || !process.env.PRIVATE_KEY) return null;
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  return { provider, contract: new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet) };
}
function safeError(res, err) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Request failed. Check server logs and configuration.' : err.message });
}
app.get('/api/health', (_req, res) => res.json({ ok: true, blockchainConfigured: Boolean(blockchain()), message: 'IP Evidence Hub prototype API' }));
app.get('/api/evidence', (_req, res) => {
  const rows = readStore(DATA_FILE).map(({ originalPath, watermarkedPath, ...publicRow }) => publicRow);
  res.json(rows);
});
app.post('/api/evidence', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to register.' });
    const title = String(req.body.title || '').trim();
    const category = String(req.body.category || 'Other').trim();
    if (!title) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Title is required.' }); }
    const bytes = fs.readFileSync(req.file.path);
    const hash = sha256(bytes);
    const referenceId = makeReferenceId();
    const ext = path.extname(req.file.originalname).slice(0, 12);
    const originalPath = path.join(UPLOADS, `${referenceId}${ext}`);
    fs.renameSync(req.file.path, originalPath);
    const row = {
      referenceId, title, category, originalName: path.basename(req.file.originalname),
      sha256: hash, registeredAt: new Date().toISOString(), status: 'registered-off-chain',
      watermarkStatus: 'not-applicable', originalPath, watermarkedPath: null,
      blockchain: null
    };
    const chain = blockchain();
    if (chain) {
      try {
        const tx = await chain.contract.registerEvidence(`0x${hash}`, referenceId);
        const receipt = await tx.wait();
        row.blockchain = { network: process.env.RPC_URL, transactionHash: receipt.hash, blockNumber: receipt.blockNumber, contractAddress: process.env.CONTRACT_ADDRESS };
        row.status = 'registered-on-chain';
      } catch (e) {
        row.blockchainError = e.shortMessage || e.message;
        row.status = 'registered-off-chain';
      }
    }
    const rows = readStore(DATA_FILE);
    rows.unshift(row); writeStore(DATA_FILE, rows);
    const { originalPath: _originalPath, watermarkedPath: _watermarkedPath, ...publicRow } = row;
    res.status(201).json(publicRow);
  } catch (err) { safeError(res, err); }
});
app.post('/api/verify', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to verify.' });
    const hash = sha256(fs.readFileSync(req.file.path)); fs.unlinkSync(req.file.path);
    const row = readStore(DATA_FILE).find(item => item.sha256 === hash);
    let chainRecord = null;
    const chain = blockchain();
    if (chain) {
      try {
        const record = await chain.contract.getEvidence(`0x${hash}`);
        chainRecord = { registrant: record.registrant, registeredAt: Number(record.registeredAt), exists: record.exists };
      } catch (e) { chainRecord = { error: e.shortMessage || e.message }; }
    }
    res.json({ sha256: hash, matchesRegisteredFile: Boolean(row), evidence: row ? { referenceId: row.referenceId, title: row.title, registeredAt: row.registeredAt, status: row.status } : null, blockchain: chainRecord });
  } catch (err) { safeError(res, err); }
});
app.post('/api/watermark', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a PNG image.' });
    if (path.extname(req.file.originalname).toLowerCase() !== '.png') { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Invisible watermark prototype currently supports PNG files only.' }); }
    const title = String(req.body.title || '').trim();
    if (!title) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Title is required.' }); }
    const bytes = fs.readFileSync(req.file.path); fs.unlinkSync(req.file.path);
    const referenceId = makeReferenceId();
    const marked = watermarkPng(bytes, referenceId);
    const outName = `${referenceId}.png`; const outPath = path.join(WATERMARKED, outName);
    fs.writeFileSync(outPath, marked);
    const row = { referenceId, title, category: 'Image', originalName: path.basename(req.file.originalname), sha256: sha256(bytes), watermarkedSha256: sha256(marked), registeredAt: new Date().toISOString(), status: 'watermarked-off-chain', watermarkStatus: 'embedded', originalPath: null, watermarkedPath: outPath, watermarkedDownload: `/watermarked/${outName}`, blockchain: null };
    const chain = blockchain();
    if (chain) {
      chain.contract.registerEvidence(`0x${row.sha256}`, referenceId).then(tx => tx.wait()).then(receipt => {
        row.blockchain = { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, contractAddress: process.env.CONTRACT_ADDRESS };
        row.status = 'watermarked-and-registered-on-chain';
        const rows = readStore(DATA_FILE); const idx = rows.findIndex(r => r.referenceId === referenceId); if (idx >= 0) { rows[idx] = row; writeStore(DATA_FILE, rows); }
      }).catch(e => { row.blockchainError = e.shortMessage || e.message; });
    }
    const rows = readStore(DATA_FILE); rows.unshift(row); writeStore(DATA_FILE, rows);
    res.status(201).json({ referenceId, title, originalSha256: row.sha256, watermarkedSha256: row.watermarkedSha256, downloadUrl: row.watermarkedDownload, watermarkStatus: row.watermarkStatus, note: 'Prototype LSB watermark: resizing, recompression, editing, or format conversion may destroy it.' });
  } catch (err) { safeError(res, err); }
});
app.post('/api/trace', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a PNG image to trace.' });
    if (path.extname(req.file.originalname).toLowerCase() !== '.png') { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Trace detection currently supports PNG files only.' }); }
    const bytes = fs.readFileSync(req.file.path); fs.unlinkSync(req.file.path);
    const referenceId = detectWatermarkPng(bytes);
    const row = referenceId ? readStore(DATA_FILE).find(item => item.referenceId === referenceId) : null;
    res.json({ detected: Boolean(referenceId), referenceId, matchedRecord: row ? { title: row.title, referenceId: row.referenceId, registeredAt: row.registeredAt, sha256: row.sha256, status: row.status } : null, note: referenceId ? 'A watermark identifier was recovered; this is a tracing aid, not proof of ownership.' : 'No supported watermark identifier was detected.' });
  } catch (err) { safeError(res, err); }
});
app.get('/watermarked/:file', (req, res) => {
  const name = path.basename(req.params.file);
  const file = path.join(WATERMARKED, name);
  if (!fs.existsSync(file)) return res.status(404).send('File not found');
  res.download(file);
});
app.get('/api/evidence/:id/qr', async (req, res) => {
  const row = readStore(DATA_FILE).find(item => item.referenceId === req.params.id);
  if (!row) return res.status(404).json({ error: 'Evidence record not found.' });
  try { const url = `${req.protocol}://${req.get('host')}/verify.html?id=${encodeURIComponent(row.referenceId)}`; res.type('png').send(await QRCode.toBuffer(url)); }
  catch (err) { safeError(res, err); }
});
app.get('/api/evidence/:id/report.pdf', (req, res) => {
  const row = readStore(DATA_FILE).find(item => item.referenceId === req.params.id);
  if (!row) return res.status(404).json({ error: 'Evidence record not found.' });
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${row.referenceId}-evidence-report.pdf"`);
  const doc = new PDFDocument({ margin: 50 }); doc.pipe(res);
  doc.fontSize(20).text('IP Evidence Hub — Evidence Report'); doc.moveDown();
  for (const [label, value] of [['Reference ID', row.referenceId], ['Title', row.title], ['Category', row.category || 'Image'], ['Original filename', row.originalName], ['SHA-256', row.sha256], ['Registered at (application time)', row.registeredAt], ['Status', row.status], ['Watermark status', row.watermarkStatus || 'not applicable'], ['Blockchain transaction', row.blockchain?.transactionHash || 'Not available'], ['Blockchain block', row.blockchain?.blockNumber ?? 'Not available']]) {
    doc.font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true }).font('Helvetica').text(` ${String(value)}`); doc.moveDown(0.4);
  }
  doc.moveDown().fontSize(9).text('Important: This report organizes technical evidence. A hash or blockchain timestamp does not by itself establish legal ownership, truth, or court admissibility.'); doc.end();
});
app.get('/verify.html', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'verify.html')));
const port = Number(process.env.PORT || 3000);
if (require.main === module) app.listen(port, () => console.log(`IP Evidence Hub running at http://localhost:${port}`));
module.exports = app;
