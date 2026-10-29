const $ = (s) => document.querySelector(s);
async function request(url, options) { const r = await fetch(url, options); const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`); return data; }
function show(id, data) { const el = $(id); el.hidden = false; el.textContent = JSON.stringify(data, null, 2); }
function formData(form) { return new FormData(form); }
async function refreshRecords() {
  const host = $('#records');
  try {
    const rows = await request('/api/evidence');
    if (!rows.length) { host.innerHTML = '<p class="muted">No evidence registered yet.</p>'; return; }
    host.replaceChildren();
    for (const r of rows) {
      const card = document.createElement('article'); card.className = 'record';
      const h = document.createElement('h3'); h.textContent = r.title || r.referenceId; card.append(h);
      const p = document.createElement('p'); p.textContent = `${r.referenceId} · ${r.status} · ${r.registeredAt}`; card.append(p);
      const hash = document.createElement('code'); hash.textContent = r.sha256; card.append(hash);
      const links = document.createElement('p');
      const pdf = document.createElement('a'); pdf.href = `/api/evidence/${encodeURIComponent(r.referenceId)}/report.pdf`; pdf.textContent = 'Download PDF report'; links.append(pdf);
      links.append(document.createTextNode(' · '));
      const qr = document.createElement('a'); qr.href = `/api/evidence/${encodeURIComponent(r.referenceId)}/qr`; qr.textContent = 'Open QR code'; qr.target = '_blank'; qr.rel = 'noopener'; links.append(qr);
      if (r.watermarkedDownload) { links.append(document.createTextNode(' · ')); const dl = document.createElement('a'); dl.href = r.watermarkedDownload; dl.textContent = 'Download watermarked PNG'; links.append(dl); }
      card.append(links); host.append(card);
    }
  } catch (e) { host.textContent = e.message; }
}
$('#registerForm').addEventListener('submit', async (e) => { e.preventDefault(); try { show('#registerResult', await request('/api/evidence', { method: 'POST', body: formData(e.currentTarget) })); e.currentTarget.reset(); await refreshRecords(); } catch (err) { show('#registerResult', { error: err.message }); } });
$('#verifyForm').addEventListener('submit', async (e) => { e.preventDefault(); try { show('#verifyResult', await request('/api/verify', { method: 'POST', body: formData(e.currentTarget) })); } catch (err) { show('#verifyResult', { error: err.message }); } });
$('#watermarkForm').addEventListener('submit', async (e) => { e.preventDefault(); try { const result = await request('/api/watermark', { method: 'POST', body: formData(e.currentTarget) }); show('#watermarkResult', result); if (result.downloadUrl) { const a = document.createElement('a'); a.href = result.downloadUrl; a.textContent = 'Download watermarked PNG'; a.className = 'download'; $('#watermarkResult').after(a); } e.currentTarget.reset(); await refreshRecords(); } catch (err) { show('#watermarkResult', { error: err.message }); } });
$('#traceForm').addEventListener('submit', async (e) => { e.preventDefault(); try { show('#traceResult', await request('/api/trace', { method: 'POST', body: formData(e.currentTarget) })); } catch (err) { show('#traceResult', { error: err.message }); } });
$('#refresh').addEventListener('click', refreshRecords);
request('/api/health').then(x => { $('#health').textContent = x.blockchainConfigured ? 'API online · blockchain configured' : 'API online · blockchain not configured'; }).catch(() => { $('#health').textContent = 'API unavailable'; });
refreshRecords();
