# IP Evidence Hub — runnable prototype

A small end-to-end prototype based on the supplied project brief. It includes a web dashboard, Express API, SHA-256 hashing, a Solidity evidence registry, local-chain deployment, exact-file verification, a PNG invisible-watermark demo, watermark tracing, PDF evidence reports, and QR-linked record lookup.

> **Important limitations:** this is a development/demo prototype, not production legal evidence software. A hash or blockchain transaction does not establish legal ownership, prove document truth, or guarantee court admissibility. The sample LSB watermark only supports PNG and is fragile: image editing, resizing, compression, or conversion can destroy it. Files are stored locally, and access control/authentication, encrypted storage, malware scanning, retention policy, audit hardening, and production deployment security are not implemented. Do not upload confidential or sensitive files.

## Requirements

- Node.js 20 or newer (tested target: Node 22)
- npm
- Terminal / command prompt

## Step-by-step setup (local development blockchain)

1. Extract the ZIP and open a terminal in the `ip-evidence-hub` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file:
   - macOS/Linux: `cp .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
4. In terminal window 1, start a local Hardhat blockchain:
   ```bash
   npm run node
   ```
   Keep this window open. It prints development accounts and private keys. These keys are for the local test chain only. Never fund or reuse them on a real network.
5. Copy the private key for the first Hardhat local account shown in terminal window 1 into `.env` as `PRIVATE_KEY=0x...`. This key is only for the local development chain. Keep it local and never commit `.env`.
6. In terminal window 2, compile and deploy the contract:
   ```bash
   npm run compile
   npm run deploy:local
   ```
   The deployment script writes the contract address into `.env`.
7. Confirm `.env` contains:
   ```dotenv
   PORT=3000
   RPC_URL=http://127.0.0.1:8545
   CONTRACT_ADDRESS=the-address-written-by-deploy-script
   PRIVATE_KEY=the-first-local-hardhat-account-private-key
   ```
8. In terminal window 2 (or a third terminal), start the web app:
   ```bash
   npm start
   ```
9. Open `http://localhost:3000` in your browser.

If `PRIVATE_KEY` or `CONTRACT_ADDRESS` is missing, the dashboard still runs with off-chain local registration and reports that blockchain integration is not configured. This is useful for UI-only testing.

## How to use

1. **Register evidence:** enter a title/category and select a file. The server computes SHA-256, generates a reference ID, saves the file under `uploads/`, and stores metadata in `data/evidence.json`. When the local chain is configured, it also submits the 32-byte SHA-256 fingerprint and reference ID to the contract.
2. **Verify a file:** upload the exact same file bytes. A matching SHA-256 identifies the registered version. If the bytes differ, the result is not a match; this does not automatically mean theft or fraud.
3. **Watermark an image:** upload a PNG and title. The prototype embeds the reference ID into least-significant color bits and saves a watermarked copy under `watermarked/`. It separately reports the original and watermarked hashes.
4. **Trace an image:** upload the unmodified watermarked PNG. The detector attempts to recover its reference ID and find the matching local metadata record.
5. **PDF report:** use “Download PDF report” from a record. The report contains reference metadata, hashes, status and any available transaction details.
6. **QR code:** open “Open QR code” from a record. The QR points to a local verification/metadata page. A QR code itself is not proof of authenticity.

## Tests

Run:
```bash
npm test
```
This runs the Hardhat contract tests and Node.js tests for SHA-256, reference IDs, and PNG watermark embed/detect behavior. Tests require dependencies installed with `npm install`. A clean local chain is created automatically for the Hardhat test suite.

Useful additional manual checks:
- Register the same exact file twice: contract-level duplicate hash registration is rejected; the app still retains an off-chain record if the chain call fails.
- Change one byte in a file and verify it: it should not match the original SHA-256.
- Watermark a sufficiently large PNG, download it, then upload it to Trace. The reference ID should be recovered.
- Resize/recompress the watermarked PNG and trace again: detection may fail, which is an expected limitation.
- Stop the local Hardhat node: the API should continue in off-chain mode for registration; blockchain calls may be unavailable.

## Project layout

```text
contracts/EvidenceRegistry.sol  Solidity registry contract
scripts/deploy.js               Deploys the contract to the local Hardhat node
 test/EvidenceRegistry.test.js   Smart-contract tests
server/index.js                 Express API and report/QR endpoints
server/core.js                  Hashing, reference IDs, PNG watermark functions
server/core.test.js             Core unit tests
public/                         Dashboard, QR lookup page, CSS and browser JS
uploads/                        Original uploaded files (local development only)
watermarked/                    Watermarked PNG copies
 data/evidence.json              Local metadata store (created on first write)
.env.example                    Local configuration template
```

## API endpoints

- `GET /api/health` — service status
- `GET /api/evidence` — evidence metadata list
- `POST /api/evidence` — multipart form fields `title`, `category`, `file`
- `POST /api/verify` — multipart field `file`
- `POST /api/watermark` — multipart fields `title`, `file` (PNG only)
- `POST /api/trace` — multipart field `file` (PNG only)
- `GET /api/evidence/:id/qr` — QR image
- `GET /api/evidence/:id/report.pdf` — PDF evidence report
- `GET /verify.html?id=REFERENCE_ID` — QR-linked metadata lookup

## Before production

Replace the JSON file store with a transactional database; add authentication, authorization and per-record sharing permissions; validate file types by content and scan uploads; use private object storage; protect API routes and rate-limit requests; define backup/deletion and privacy policies; use a properly reviewed watermarking method; add integration and security tests; and obtain legal review of evidence workflows. Do not store personal data or confidential document content on a public blockchain.
