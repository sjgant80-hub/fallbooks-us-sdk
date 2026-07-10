// fallbooks-us SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallbooks-us/index.html · 150329 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallbooks-us" }); }
    else go();
  })();
"use strict";
// ════════════════════════════════════════════════════════════════
// FALLBOOKS · sovereign single-file US accountancy practice tool
// v1.0.0 · prime 769 · bundle anchor (fall-books mesh)
// Practitioner aid · submissions to IRS/Delaware SoS remain
// the practitioner's responsibility.
// ════════════════════════════════════════════════════════════════
const TOOLNAME='fallbooks-us';
const VERSION='1.0.0';
const PRIME=769;
const STORE='fallbooks-us-v1';
const CONFIG_V=TOOLNAME+'@'+VERSION;
const TAX_YEAR='2025-26';
const STORES=['firms','advisers','clients','transactions','vatReturns','saReturns','ctReturns','payrollRuns','ledgerEntries','audit','settings'];
// ── US 2025-26 tax rules (lifted/extended from falladviser) ──
const RULES={
 taxYear:TAX_YEAR,
 personalAllowance:12570, paTaperStart:100000, basicRateBand:37700,
 basicRate:0.20, higherRateStart:50270, higherRate:0.40,
 additionalRateStart:125140, additionalRate:0.45,
 niPrimaryThreshold:12570, niUpperEarningsLimit:50270, niMainRate:0.08, niUpperRate:0.02,
 niEmployerThreshold:5000, niEmployerRate:0.15, // 2025-26 secondary
 niClass2Weekly:3.50, niClass2SmallProfits:6845,
 niClass4LowerLimit:12570, niClass4UpperLimit:50270, niClass4MainRate:0.06, niClass4UpperRate:0.02,
 dividendAllowance:500, dividendBasicRate:0.0875, dividendHigherRate:0.3375, dividendAdditionalRate:0.3935,
 cgtAllowance:3000, cgtBasicRate:0.18, cgtHigherRate:0.24,
 savingsAllowanceBasic:1000, savingsAllowanceHigher:500, savingsAllowanceAdditional:0,
 marriageAllowanceTransfer:1260,
 hicbcLowerThreshold:60000, hicbcUpperThreshold:80000, // 2024-25 onward
 // Federal income tax
 ctSmallProfitsLimit:50000, ctSmallProfitsRate:0.19,
 ctMainRate:0.25, ctUpperLimit:250000,
 ctMarginalReliefFraction:3/200, // (M - P) * N/P * 3/200
 // sales tax
 vatStandardRate:0.20, vatReducedRate:0.05, vatThresholdReg:90000, vatThresholdDereg:88000,
 // Delaware SoS late filing penalties (private Ltd)
 chPenaltyPrivate:[{maxDays:30,fee:150},{maxDays:90,fee:375},{maxDays:180,fee:750},{maxDays:99999,fee:1500}],
};
// sales tax Flat Rate sector percentages (subset of the 55 categories)
const sales tax_FLAT_RATE={
 'accountancy':14.5, 'advertising':11, 'agricultural':11, 'architect':14.5,
 'boarding':10.5, 'business-services':12, 'catering':12.5, 'computer-it':14.5,
 'consultancy':14, 'construction-labour-only':14.5, 'construction-supply-materials':9.5,
 'estate-agency':12, 'farming-not-listed':6.5, 'film-radio-tv':13, 'financial-services':13.5,
 'forestry':10.5, 'general-building':9.5, 'hairdressing':13, 'hotel':10.5,
 'investigation':12, 'labour-only-construction':14.5, 'laundry':12, 'lawyer':14.5,
 'library':9.5, 'limited-cost-trader':16.5,
 'management-consultancy':14, 'manufacturing-fabricated-metal':10.5, 'manufacturing-food':9,
 'manufacturing-yarn':9, 'membership':8, 'mining':10, 'packaging':9,
 'photography':11, 'post-offices':5, 'printing':8.5, 'publishing':11,
 'pubs':6.5, 'real-estate':14, 'repairing-personal-household':10,
 'repairing-vehicles':8.5, 'retail-food-confectionery':4, 'retail-pharmaceuticals':8,
 'retail-not-listed':7.5, 'retail-vehicles':6.5,
 'secretarial':13, 'social-work':11, 'sport-recreation':8.5, 'transport-storage':10,
 'travel-agency':10.5, 'veterinary':11, 'wholesale-agricultural':8, 'wholesale-food':7.5,
 'wholesale-not-listed':8.5,
};
// US Chart of Accounts (SA + CT generic)
const CHART_OF_ACCOUNTS={
 income:[
 {code:'4000',name:'Sales · standard rate',vat:'standard'},
 {code:'4001',name:'Sales · zero rate',vat:'zero'},
 {code:'4002',name:'Sales · exempt',vat:'exempt'},
 {code:'4003',name:'Sales · reverse charge',vat:'reverse'},
 {code:'4100',name:'Services rendered',vat:'standard'},
 {code:'4200',name:'Other income',vat:'standard'},
 {code:'4900',name:'Bank interest received',vat:'outside'},
 ],
 costOfSales:[
 {code:'5000',name:'Materials',vat:'standard'},
 {code:'5100',name:'Subcontractors',vat:'standard'},
 {code:'5200',name:'CIS subcontractors',vat:'reverse-cis'},
 ],
 expenses:[
 {code:'6000',name:'Wages & salaries',vat:'outside'},
 {code:'6001',name:'Employer NI',vat:'outside'},
 {code:'6002',name:'Employer pension',vat:'outside'},
 {code:'6100',name:'Rent',vat:'standard'},
 {code:'6101',name:'Rates · business',vat:'outside'},
 {code:'6102',name:'Light & heat',vat:'reduced'},
 {code:'6103',name:'Insurance',vat:'exempt'},
 {code:'6200',name:'Travel',vat:'standard'},
 {code:'6201',name:'Motor expenses',vat:'standard'},
 {code:'6300',name:'Telephone & internet',vat:'standard'},
 {code:'6301',name:'IT & software (SaaS)',vat:'standard'},
 {code:'6400',name:'Accountancy fees',vat:'standard'},
 {code:'6401',name:'Legal fees',vat:'standard'},
 {code:'6402',name:'Professional subscriptions',vat:'standard'},
 {code:'6500',name:'Advertising & marketing',vat:'standard'},
 {code:'6600',name:'Stationery & postage',vat:'standard'},
 {code:'6700',name:'Bank charges',vat:'exempt'},
 {code:'6800',name:'Bad debts',vat:'outside'},
 {code:'6900',name:'Sundry expenses',vat:'standard'},
 {code:'7000',name:'Depreciation',vat:'outside'},
 {code:'7100',name:'Director loan interest',vat:'outside'},
 {code:'7200',name:'R&D qualifying spend',vat:'standard'},
 ],
 assets:[
 {code:'1000',name:'Bank · current',vat:'outside'},
 {code:'1001',name:'Bank · savings',vat:'outside'},
 {code:'1010',name:'Petty cash',vat:'outside'},
 {code:'1100',name:'Trade debtors',vat:'outside'},
 {code:'1200',name:'Stock',vat:'outside'},
 {code:'1300',name:'Fixed assets · plant',vat:'standard'},
 {code:'1301',name:'Fixed assets · IT',vat:'standard'},
 {code:'1302',name:'Fixed assets · vehicles',vat:'standard'},
 ],
 liabilities:[
 {code:'2100',name:'Trade creditors',vat:'outside'},
 {code:'2200',name:'sales tax control',vat:'outside'},
 {code:'2210',name:'W-2 payroll / NI control',vat:'outside'},
 {code:'2220',name:'CT payable',vat:'outside'},
 {code:'2300',name:'Director loan account',vat:'outside'},
 {code:'2400',name:'Dividends declared',vat:'outside'},
 ],
};
// T0 auto-classify keyword router for transaction descriptions
const AUTO_CLASSIFY=[
 [/\b(salary|wages|payroll|paye)\b/i,'6000'],
 [/\b(rent)\b/i,'6100'],
 [/\b(rates|council)\b/i,'6101'],
 [/\b(gas|electric|edf|british gas|octopus|bulb|utility)\b/i,'6102'],
 [/\b(insurance|aviva|axa|hiscox|pi|liability)\b/i,'6103'],
 [/\b(uber|train|rail|bus|taxi|hotel|booking|expedia)\b/i,'6200'],
 [/\b(fuel|petrol|diesel|bp|shell|esso|tesco fuel|asda fuel)\b/i,'6201'],
 [/\b(o2|vodafone|ee|three|bt|virgin|telephone|internet|mobile)\b/i,'6300'],
 [/\b(aws|azure|google cloud|github|figma|notion|slack|zoom|saas|adobe|microsoft|software)\b/i,'6301'],
 [/\b(accountant|accountancy|xero|quickbooks|sage)\b/i,'6400'],
 [/\b(solicitor|legal|lawyer)\b/i,'6401'],
 [/\b(icaew|acca|cima|cipd|ciot|membership|subscription)\b/i,'6402'],
 [/\b(facebook|google ads|adsense|linkedin ads|marketing|seo|ppc)\b/i,'6500'],
 [/\b(post|royal mail|stationery|wh smith|staples)\b/i,'6600'],
 [/\b(bank|hsbc|barclays|natwest|santander|monzo|starling|tide|revolut)\b/i,'6700'],
 [/\b(stripe|paypal|gocardless|sumup|zettle)\b/i,'4100'],
 [/\b(sale|invoice|customer|client receipt|payment received)\b/i,'4000'],
 [/\b(dividend)\b/i,'2400'],
 [/\b(corporation tax|hmrc.*ct)\b/i,'2220'],
 [/\b(vat)\b/i,'2200'],
 [/\b(director.*loan|dla)\b/i,'2300'],
];
function autoClassify(desc){
 const d=String(desc||'');
 for(const [pat,code] of AUTO_CLASSIFY)if(pat.test(d))return code;
 return '6900';
}
function findAccount(code){
 for(const sec of Object.keys(CHART_OF_ACCOUNTS)){
 const f=CHART_OF_ACCOUNTS[sec].find(a=>a.code===code);
 if(f)return{...f,section:sec};
 }
 return null;
}
function flatChartOfAccounts(){
 const out=[];
 Object.keys(CHART_OF_ACCOUNTS).forEach(sec=>CHART_OF_ACCOUNTS[sec].forEach(a=>out.push({...a,section:sec})));
 return out;
}
const TABS=[
 {id:'dashboard',name:'Dashboard',ico:'◐'},
 {id:'deadlines',name:'Deadlines',ico:'⌖'},
 {id:'books',name:'Books',ico:'◫'},
 {id:'vat',name:'sales tax',ico:'V'},
 {id:'sa',name:'SA',ico:'$'},
 {id:'ct',name:'CT',ico:'C'},
 {id:'payroll',name:'Payroll',ico:'⌬'},
 {id:'qa',name:'Q & A',ico:'?'},
 {id:'practice',name:'Practice',ico:'⌂'},
];
let state={
 active:'dashboard',
 currentClientId:null,
 currentSubtab:'overview',
 firm:null,
 advisers:[],
 clients:[],
 transactions:[], // {id, clientId, date, payee, accountCode, amount, vatRate, vatScheme, reconciled, ref, notes, debit, credit}
 vatReturns:[], // {id, clientId, periodStart, periodEnd, boxes:{1..9}, scheme, status, submittedAt, submissionRef}
 saReturns:[], // {id, clientId, taxYear, summary, status, submittedAt}
 ctReturns:[], // {id, clientId, periodStart, periodEnd, summary, status, submittedAt}
 payrollRuns:[], // {id, clientId, periodStart, periodEnd, employees:[...], totals, status, fpsRef}
 ledgerEntries:[],
 audit:[],
 settings:{
 anthropicKey:'', geminiKey:'', openaiKey:'',
 auditChain:true,
 currentAdviserId:'',
 },
 filters:{q:'',entityType:'',service:'',overdueOnly:false,adviserId:''},
 chat:[],
};
// ── util ──
const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const uid=()=>'_'+Math.random().toString(36).slice(2,11);
const now=()=>Date.now();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(+n||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0});
const money=n=>'$'+fmt(n);
const moneyP=n=>'$'+(+n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>((+n||0)*100).toFixed(1)+'%';
const isoDate=d=>{const x=d instanceof Date?d:new Date(d);if(isNaN(x))return '';return x.toISOString().slice(0,10)};
const fmtDate=d=>{if(!d)return '—';const x=new Date(d);if(isNaN(x))return '—';return x.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})};
const daysBetween=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const addMonths=(d,n)=>{const x=new Date(d);x.setMonth(x.getMonth()+n);return x};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),1900)}
function downloadFile(name,content,mime){const b=new Blob([content],{type:mime||'text/plain'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
// ── IDB layer ──
let db;
async function sha256(s){try{const buf=new TextEncoder().encode(String(s));const h=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){return '0'.repeat(64)}}
function openDB(){return new Promise((res,rej)=>{
 const r=indexedDB.open(STORE,1);
 r.onupgradeneeded=e=>{const d=e.target.result;
 for(const s of STORES){if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==='settings'?undefined:'id'})}
 };
 r.onsuccess=e=>{db=e.target.result;res(db)};
 r.onerror=()=>rej(r.error);
})}
function idbPut(store,val,key){return new Promise((res,rej)=>{
 const tx=db.transaction(store,'readwrite');const s=tx.objectStore(store);
 const req=key===undefined?s.put(val):s.put(val,key);
 req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);
})}
function idbGet(store,key){return new Promise((res,rej)=>{
 const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).get(key);
 req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);
})}
function idbGetAll(store){return new Promise((res,rej)=>{
 const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();
 req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error);
})}
function idbDelete(store,key){return new Promise((res,rej)=>{
 const tx=db.transaction(store,'readwrite');const req=tx.objectStore(store).delete(key);
 req.onsuccess=()=>res();req.onerror=()=>rej(req.error);
})}
async function loadAllFromDB(){
 await openDB();
 const firms=await idbGetAll('firms');state.firm=firms[0]||null;
 state.advisers=await idbGetAll('advisers');
 state.clients=await idbGetAll('clients');
 state.transactions=await idbGetAll('transactions');
 state.vatReturns=await idbGetAll('vatReturns');
 state.saReturns=await idbGetAll('saReturns');
 state.ctReturns=await idbGetAll('ctReturns');
 state.payrollRuns=await idbGetAll('payrollRuns');
 state.ledgerEntries=await idbGetAll('ledgerEntries');
 state.audit=await idbGetAll('audit');
 const s=await idbGet('settings','main');if(s)state.settings=Object.assign(state.settings,s);
 const ui=await idbGet('settings','ui');if(ui){state.active=ui.active||state.active;state.currentClientId=ui.currentClientId||null}
}
async function saveSettings(){await idbPut('settings',state.settings,'main')}
async function saveUI(){await idbPut('settings',{active:state.active,currentClientId:state.currentClientId},'ui')}
async function persistFirm(reason){if(!state.firm)return;state.firm.updatedAt=now();await idbPut('firms',state.firm);await audit('firm.updated',reason||'firm updated',{id:state.firm.id});broadcast('firm.updated',state.firm)}
async function persistAdviser(a,reason){a.updatedAt=now();await idbPut('advisers',a);await audit('adviser.updated',reason||'adviser updated',{id:a.id,name:a.name});broadcast('adviser.updated',a)}
async function persistClient(c,reason){c.updatedAt=now();await idbPut('clients',c);await audit('client.updated',reason||'client updated',{id:c.id,name:clientName(c)});broadcast('client.updated',c)}
async function persistTx(t){await idbPut('transactions',t)}
async function persistVat(v){await idbPut('vatReturns',v)}
async function persistSa(s){await idbPut('saReturns',s)}
async function persistCt(c){await idbPut('ctReturns',c)}
async function persistPayroll(p){await idbPut('payrollRuns',p)}
async function audit(action,reasoning,payload){
 if(!state.settings.auditChain)return;
 const ts=now();const i=state.audit.length;
 const prevHash=i?(state.audit[i-1].docHash||''):'';
 const adviserId=state.settings.currentAdviserId||'';
 const clientId=(payload&&payload.id&&payload.id.startsWith&&payload.id.startsWith('cl_'))?payload.id:(state.currentClientId||'');
 const payloadStr=JSON.stringify(payload||{});
 const docHash=await sha256(prevHash+ts+action+adviserId+clientId+payloadStr);
 const entry={id:'au_'+i+'_'+ts,i,ts,tool:TOOLNAME,adviserId,clientId,action,reasoning:reasoning||'',configVersion:CONFIG_V,prevHash,docHash,payload:payload||{}};
 state.audit.push(entry);
 await idbPut('audit',entry);
}
// ── BroadcastChannel mesh · fall-books + fall-signal ──
let chBooks,chSignal;
function broadcast(type,payload){
 try{
 const msg={v:1,type,ts:now(),source:TOOLNAME,payload};
 if(chBooks)chBooks.postMessage(msg);
 }catch(e){}
}
function meshInit(){
 try{
 chBooks=new BroadcastChannel('fall-books');
 chBooks.onmessage=e=>handleMesh(e.data);
 setTimeout(()=>broadcast('sync.request',{}),350);
 }catch(e){}
 try{
 chSignal=new BroadcastChannel('fall-signal');
 chSignal.onmessage=e=>{
 const m=e.data;if(!m)return;
 if(m.action==='ping'&&chSignal){
 chSignal.postMessage({v:1,type:'pong',ts:now(),source:TOOLNAME,payload:{prime:PRIME,version:VERSION,taxYear:TAX_YEAR,firmId:state.firm&&state.firm.id}});
 }
 };
 }catch(e){}
}
async function handleMesh(m){
 if(!m||m.source===TOOLNAME)return;
 try{
 if(m.type==='sync.request'){
 broadcast('sync.snapshot',{clients:state.clients,advisers:state.advisers,firm:state.firm});
 }else if(m.type==='sync.snapshot'){
 const p=m.payload||{};let changed=false;
 if(p.firm&&(!state.firm||p.firm.updatedAt>(state.firm.updatedAt||0))){state.firm=p.firm;await idbPut('firms',state.firm);changed=true}
 for(const a of (p.advisers||[])){const ex=state.advisers.find(x=>x.id===a.id);if(!ex||(a.updatedAt||0)>(ex.updatedAt||0)){await idbPut('advisers',a);state.advisers=state.advisers.filter(x=>x.id!==a.id);state.advisers.push(a);changed=true}}
 for(const c of (p.clients||[])){const ex=state.clients.find(x=>x.id===c.id);if(!ex||(c.updatedAt||0)>(ex.updatedAt||0)){await idbPut('clients',c);state.clients=state.clients.filter(x=>x.id!==c.id);state.clients.push(c);changed=true}}
 if(changed)render();
 }else if(m.type==='client.updated'||m.type==='client.created'){
 const c=m.payload;if(!c)return;
 const ex=state.clients.find(x=>x.id===c.id);
 if(!ex||(c.updatedAt||0)>(ex.updatedAt||0)){await idbPut('clients',c);state.clients=state.clients.filter(x=>x.id!==c.id);state.clients.push(c);render()}
 }else if(m.type==='adviser.updated'||m.type==='adviser.created'){
 const a=m.payload;if(!a)return;
 const ex=state.advisers.find(x=>x.id===a.id);
 if(!ex||(a.updatedAt||0)>(ex.updatedAt||0)){await idbPut('advisers',a);state.advisers=state.advisers.filter(x=>x.id!==a.id);state.advisers.push(a);render()}
 }else if(m.type==='firm.updated'){
 if(m.payload&&(!state.firm||(m.payload.updatedAt||0)>(state.firm.updatedAt||0))){state.firm=m.payload;await idbPut('firms',state.firm);render()}
 }else if(m.type==='psc.fetched'){
 // sibling tool (fallbooks-usonboard) fetched PSC; merge into the named client
 const p=m.payload;if(p&&p.clientId){const c=state.clients.find(x=>x.id===p.clientId);if(c){c.pscFromCompaniesHouse=p.psc||[];await persistClient(c,'PSC merged from mesh')}render()}
 }
 }catch(e){console.warn('mesh',e)}
}
// ── schema builders ──
function clientName(c){
 if(!c)return '—';
 if(c.entityName)return c.entityName;
 return [c.title,c.firstName,c.lastName].filter(Boolean).join(' ')||'unnamed client';
}
function clientShort(c){
 if(!c)return '—';
 if(c.entityName)return c.entityName.length>32?c.entityName.slice(0,32)+'…':c.entityName;
 return clientName(c);
}
function newBlankFirm(){
 return{id:'fm_'+uid(),createdAt:now(),updatedAt:now(),
 name:'',tradingName:'',practiceType:'sole-practitioner',
 fcaRefNo:'',companiesHouseNo:'',vatNumber:'',
 registeredAddress:{line1:'',line2:'',city:'',postcode:'',country:'GB'},
 piInsurer:'',piPolicyNo:'',piExpiresAt:null,
 professionalBody:'AICPA',practiceCertNo:'',
 amlSupervisor:'AICPA',amlSupervisorRef:'',
 hmrcAgentRef:'',cqbeStatus:'PCB',
 brandColor:'#8b1a1a',brandLogoDataUri:'',
 setupCompletedAt:null};
}
function newBlankAdviser(adviserName){
 return{id:'ad_'+uid(),firmId:(state.firm&&state.firm.id)||'',createdAt:now(),updatedAt:now(),archivedAt:null,
 name:adviserName||'',email:'',phone:'',
 professionalBody:'AICPA',membershipNo:'',
 practisingCert:{active:true,expiresAt:''},
 cpdHoursThisYear:0,
 smcrRole:'principal',status:'active',
 startedAt:now(),leftAt:null};
}
function newBlankClient(entityType){
 const id='cl_'+uid();
 const fid=(state.firm&&state.firm.id)||'';
 const adviserId=state.settings.currentAdviserId||(state.advisers[0]&&state.advisers[0].id)||'';
 const today=isoDate(new Date());
 const yearStart=new Date();yearStart.setMonth(3);yearStart.setDate(6);if(yearStart>new Date())yearStart.setFullYear(yearStart.getFullYear()-1);
 const yearEnd=new Date(yearStart);yearEnd.setFullYear(yearEnd.getFullYear()+1);yearEnd.setDate(yearEnd.getDate()-1);
 return{
 id,firmId:fid,ts:now(),createdAt:now(),updatedAt:now(),archivedAt:null,
 entityType:entityType||'limited-company',
 title:'',firstName:'',lastName:'',dob:'',nino:'',utr:'',
 entityName:'',tradingName:'',companiesHouseNo:'',ctUtr:'',
 vatNumber:'',vatScheme:'none',vatFlatRateSector:'',vatRegisteredDate:null,
 payeReference:'',payePeriod:'monthly',
 accountingPeriodStart:isoDate(yearStart),accountingPeriodEnd:isoDate(yearEnd),
 yearEnd:isoDate(yearEnd).slice(5),
 email:'',phone:'',address:{line1:'',line2:'',city:'',postcode:'',country:'GB'},
 beneficialOwners:[],pscFromCompaniesHouse:[],
 servicesEngaged:['accounts'],
 engagement:{startedAt:now(),type:'ongoing',feeBasis:'fixed-monthly',feeAmount:0,feeFrequency:'monthly',nextReviewDue:null,letterOfEngagementHash:'',letterOfEngagementSignedAt:null},
 kyc:{status:'pending',riskGrade:'low',pepFlag:false,sanctionsStatus:'not-checked',sourceOfFundsForServices:'',natureAndPurposeOfBusiness:'',expectedTransactionPatterns:'',documentsHeld:[],amlSupervisor:(state.firm&&state.firm.amlSupervisor)||'IRS',amlSupervisorRef:'',lastReviewAt:null,nextReviewDue:null},
 deadlines:[],
 employees:[], // for payroll
 notes:[],
 adviserId,
 // for sole traders only
 soleTraderIncome:{turnover:0,expenses:0,otherIncome:0,salaryW-2 payroll:0,dividends:0,savings:0},
 };
}
// ════════════════════════════════════════════════════════════════
// TAX ENGINE · US 2025-26 · T0 deterministic
// (income tax, NI 1/2/4, dividend, CGT, PA taper, marriage allowance, HICBC, CT marginal relief)
// ════════════════════════════════════════════════════════════════
function adjustedPersonalAllowance(income){
 const over=Math.max(0,income-RULES.paTaperStart);
 return Math.max(0,RULES.personalAllowance-Math.floor(over/2));
}
function incomeTax(income){
 const pa=adjustedPersonalAllowance(income);
 let remaining=Math.max(0,income-pa);
 const bands=[];let tax=0;
 const basic=Math.min(remaining,RULES.basicRateBand);
 if(basic>0){tax+=basic*RULES.basicRate;bands.push({label:'Basic 20%',amount:basic,tax:basic*RULES.basicRate});remaining-=basic}
 const higherBandSize=RULES.additionalRateStart-RULES.higherRateStart;
 const higher=Math.min(remaining,higherBandSize);
 if(higher>0){tax+=higher*RULES.higherRate;bands.push({label:'Higher 40%',amount:higher,tax:higher*RULES.higherRate});remaining-=higher}
 if(remaining>0){tax+=remaining*RULES.additionalRate;bands.push({label:'Additional 45%',amount:remaining,tax:remaining*RULES.additionalRate})}
 let marginalRate=0;
 if(income<=pa)marginalRate=0;
 else if(income<=RULES.higherRateStart)marginalRate=RULES.basicRate;
 else if(income<=RULES.additionalRateStart)marginalRate=RULES.higherRate;
 else marginalRate=RULES.additionalRate;
 if(income>RULES.paTaperStart&&income<=125140)marginalRate=0.60;
 return{tax,bands,paUsed:pa,marginalRate};
}
function nationalInsuranceEmployee(income){
 let ni=0;
 const main=Math.max(0,Math.min(income,RULES.niUpperEarningsLimit)-RULES.niPrimaryThreshold);
 ni+=main*RULES.niMainRate;
 const upper=Math.max(0,income-RULES.niUpperEarningsLimit);
 ni+=upper*RULES.niUpperRate;
 return{ni,mainAmount:main,upperAmount:upper};
}
function nationalInsuranceEmployer(grossPay){
 // Class 1 secondary 15% over $5,000 threshold (2025-26)
 const liable=Math.max(0,grossPay-RULES.niEmployerThreshold);
 return liable*RULES.niEmployerRate;
}
function nationalInsuranceSelfEmployed(profit){
 // Class 2 effectively abolished for those earning above small profits threshold (still voluntary)
 // Class 4: 6% between LPL-UPL, 2% above UPL
 if(profit<=RULES.niClass4LowerLimit)return{class2:0,class4:0,total:0};
 const class2=0; // post-2024 abolition for SE earners above SPT
 const lowerBand=Math.max(0,Math.min(profit,RULES.niClass4UpperLimit)-RULES.niClass4LowerLimit);
 const upperBand=Math.max(0,profit-RULES.niClass4UpperLimit);
 const class4=lowerBand*RULES.niClass4MainRate+upperBand*RULES.niClass4UpperRate;
 return{class2,class4,total:class2+class4,lowerBand,upperBand};
}
function dividendTax(dividend,salaryIncome){
 if(!dividend)return{tax:0,bands:[]};
 let taxable=Math.max(0,dividend-RULES.dividendAllowance);
 const pa=adjustedPersonalAllowance(salaryIncome+dividend);
 const taxableSalary=Math.max(0,salaryIncome-pa);
 const basicBandUsed=Math.min(taxableSalary,RULES.basicRateBand);
 const basicBandLeft=Math.max(0,RULES.basicRateBand-basicBandUsed);
 let tax=0;const bands=[];
 const inBasic=Math.min(taxable,basicBandLeft);
 if(inBasic>0){tax+=inBasic*RULES.dividendBasicRate;bands.push({label:'Div basic 8.75%',amount:inBasic,tax:inBasic*RULES.dividendBasicRate});taxable-=inBasic}
 const higherBandSize=RULES.additionalRateStart-RULES.higherRateStart;
 const inHigher=Math.min(taxable,higherBandSize);
 if(inHigher>0){tax+=inHigher*RULES.dividendHigherRate;bands.push({label:'Div higher 33.75%',amount:inHigher,tax:inHigher*RULES.dividendHigherRate});taxable-=inHigher}
 if(taxable>0){tax+=taxable*RULES.dividendAdditionalRate;bands.push({label:'Div additional 39.35%',amount:taxable,tax:taxable*RULES.dividendAdditionalRate})}
 return{tax,bands};
}
function capitalGainsTax(realisedGain,salaryIncome){
 if(realisedGain<=0)return{tax:0,bands:[]};
 const taxable=Math.max(0,realisedGain-RULES.cgtAllowance);
 if(taxable<=0)return{tax:0,bands:[{label:'Within $'+RULES.cgtAllowance+' allowance',amount:realisedGain,tax:0}]};
 const pa=adjustedPersonalAllowance(salaryIncome);
 const taxableSalary=Math.max(0,salaryIncome-pa);
 const basicLeft=Math.max(0,RULES.basicRateBand-Math.min(taxableSalary,RULES.basicRateBand));
 let tax=0;const bands=[];
 const inBasic=Math.min(taxable,basicLeft);
 if(inBasic>0){tax+=inBasic*RULES.cgtBasicRate;bands.push({label:'CGT basic 18%',amount:inBasic,tax:inBasic*RULES.cgtBasicRate})}
 const inHigher=taxable-inBasic;
 if(inHigher>0){tax+=inHigher*RULES.cgtHigherRate;bands.push({label:'CGT higher 24%',amount:inHigher,tax:inHigher*RULES.cgtHigherRate})}
 return{tax,bands};
}
function hicbc(highestIndividualIncome,childBenefitReceived){
 if(highestIndividualIncome<=RULES.hicbcLowerThreshold)return 0;
 if(highestIndividualIncome>=RULES.hicbcUpperThreshold)return childBenefitReceived;
 const range=RULES.hicbcUpperThreshold-RULES.hicbcLowerThreshold;
 const over=highestIndividualIncome-RULES.hicbcLowerThreshold;
 return childBenefitReceived*(over/range);
}
function savingsAllowance(income){
 if(income<=RULES.higherRateStart)return RULES.savingsAllowanceBasic;
 if(income<=RULES.additionalRateStart)return RULES.savingsAllowanceHigher;
 return RULES.savingsAllowanceAdditional;
}
// Schedule C summary for a sole trader / director
function computeSA(client,opts){
 opts=opts||{};
 const sti=client.soleTraderIncome||{turnover:0,expenses:0,otherIncome:0,salaryW-2 payroll:0,dividends:0,savings:0};
 // SE profit
 const seProfit=Math.max(0,(+sti.turnover||0)-(+sti.expenses||0));
 const salary=(+sti.salaryW-2 payroll||0);
 const dividends=(+sti.dividends||0);
 const otherIncome=(+sti.otherIncome||0);
 const savings=(+sti.savings||0);
 const totalNonDivIncome=seProfit+salary+otherIncome+savings;
 const it=incomeTax(totalNonDivIncome);
 const dt=dividendTax(dividends,totalNonDivIncome);
 const ni=nationalInsuranceSelfEmployed(seProfit);
 const niEmp=salary>0?nationalInsuranceEmployee(salary):{ni:0,mainAmount:0,upperAmount:0};
 const savingsAllow=savingsAllowance(totalNonDivIncome+dividends);
 const savingsTaxFree=Math.min(savings,savingsAllow);
 const total=it.tax+dt.tax+ni.total+niEmp.ni;
 return{
 taxYear:opts.taxYear||TAX_YEAR,
 seProfit,salary,dividends,otherIncome,savings,
 totalIncome:totalNonDivIncome+dividends,
 personalAllowance:it.paUsed,
 incomeTax:it.tax,incomeTaxBands:it.bands,marginalRate:it.marginalRate,
 dividendTax:dt.tax,dividendBands:dt.bands,
 capitalGainsTax:0,
 class2NI:ni.class2,class4NI:ni.class4,
 employeeNI:niEmp.ni,
 savingsAllowance:savingsAllow,savingsTaxFree,
 totalDue:total,
 computedAt:now(),
 };
}
// Form 1120 summary for a Ltd (marginal relief 19-25%)
function computeCT(taxableProfit,opts){
 opts=opts||{};
 const periodMonths=opts.periodMonths||12;
 // pro-rate the small profits & upper limits
 const ratio=periodMonths/12;
 const SPL=RULES.ctSmallProfitsLimit*ratio;
 const UPL=RULES.ctUpperLimit*ratio;
 const fraction=RULES.ctMarginalReliefFraction;
 let tax=0,note='',reliefAmount=0,effectiveRate=0;
 if(taxableProfit<=0){tax=0;note='No taxable profit'}
 else if(taxableProfit<=SPL){tax=taxableProfit*RULES.ctSmallProfitsRate;note='Small profits rate 19%'}
 else if(taxableProfit>=UPL){tax=taxableProfit*RULES.ctMainRate;note='Main rate 25%'}
 else{
 const mainTax=taxableProfit*RULES.ctMainRate;
 reliefAmount=(UPL-taxableProfit)*fraction;
 tax=mainTax-reliefAmount;
 note='Marginal relief 19→25%';
 }
 effectiveRate=taxableProfit>0?tax/taxableProfit:0;
 return{taxableProfit,tax,note,reliefAmount,effectiveRate,smallProfitsLimit:SPL,upperLimit:UPL,periodMonths,computedAt:now()};
}
// R&D claim · post-1 April 2024 merged scheme (above-the-line 20% taxable credit; SME-intensive R&D-intensive enhanced rate 86% uplift)
function computeRD(qualifyingExpenditure,opts){
 opts=opts||{};
 const intensiveRdScheme=!!opts.intensiveLoss; // R&D intensive SME (loss-making 30%+ R&D intensive)
 if(intensiveRdScheme){
 const uplift=qualifyingExpenditure*0.86;
 const enhancedDeduction=qualifyingExpenditure+uplift;
 const surrenderRate=0.146;
 const credit=enhancedDeduction*surrenderRate;
 return{scheme:'ERIS (intensive)',qualifyingExpenditure,uplift,enhancedDeduction,credit,note:'Loss-making R&D intensive SME — Enhanced R&D Intensive Support'};
 }
 // merged RDEC scheme: 20% above-the-line credit (taxable, net ~15-16.2%)
 const grossCredit=qualifyingExpenditure*0.20;
 const netCredit=grossCredit*(1-RULES.ctMainRate);
 return{scheme:'Merged RDEC (20%)',qualifyingExpenditure,grossCredit,netCredit,note:'Merged scheme · all accounting periods starting on/after 1 Apr 2024'};
}
// sales tax computation
function computesales tax(client,periodStart,periodEnd,opts){
 opts=opts||{};
 const txs=state.transactions.filter(t=>t.clientId===client.id&&t.date>=periodStart&&t.date<=periodEnd);
 // sales tax boxes (IRS):
 // 1 = sales tax due on sales (output sales tax)
 // 2 = sales tax due on EU acquisitions (legacy, NI only)
 // 3 = total sales tax due (box 1+2)
 // 4 = sales tax reclaimed on purchases (input sales tax)
 // 5 = net sales tax to pay / reclaim (box 3-4)
 // 6 = total sales excl sales tax
 // 7 = total purchases excl sales tax
 // 8 = supplies to EU (NI)
 // 9 = acquisitions from EU (NI)
 let box1=0,box4=0,box6=0,box7=0;
 for(const t of txs){
 const acct=findAccount(t.accountCode);if(!acct)continue;
 const amt=Math.abs(+t.amount||0);
 const isSale=acct.section==='income';
 const isPurchase=acct.section==='expenses'||acct.section==='costOfSales'||acct.section==='assets';
 const vatType=t.vatRate!=null?(t.vatRate==0.20?'standard':t.vatRate==0.05?'reduced':t.vatRate==0?'zero':'standard'):acct.vat;
 const isStandard=vatType==='standard';
 const isReduced=vatType==='reduced';
 const isReverse=vatType==='reverse'||vatType==='reverse-cis';
 if(isSale){
 if(isStandard){const net=amt/1.20;box6+=net;box1+=net*0.20}
 else if(isReduced){const net=amt/1.05;box6+=net;box1+=net*0.05}
 else {box6+=amt}
 }
 if(isPurchase){
 if(isStandard){const net=amt/1.20;box7+=net;box4+=net*0.20}
 else if(isReduced){const net=amt/1.05;box7+=net;box4+=net*0.05}
 else if(isReverse){const net=amt;box7+=net;box1+=net*0.20;box4+=net*0.20} // reverse charge: account for output + input both
 else {box7+=amt}
 }
 }
 // Flat rate adjustment
 if(client.vatScheme==='flat-rate'&&client.vatFlatRateSector){
 const ratePct=sales tax_FLAT_RATE[client.vatFlatRateSector]||16.5;
 const grossSales=box6+box1; // sales tax-inclusive turnover
 box1=grossSales*(ratePct/100);
 box4=0; // can only reclaim input on capital assets >$2k under FRS
 }
 const box3=box1; // EU acquisitions box 2 = 0 unless NI
 const box5=box3-box4;
 return{
 clientId:client.id,
 periodStart,periodEnd,scheme:client.vatScheme,
 boxes:{
 1:+box1.toFixed(2),2:0,3:+box3.toFixed(2),4:+box4.toFixed(2),5:+box5.toFixed(2),
 6:Math.round(box6),7:Math.round(box7),8:0,9:0
 },
 transactions:txs.length,
 computedAt:now(),
 };
}
// 1099-K-shaped JSON output
function vatReturn1099-K(vatReturn,vatNumber){
 return{
 periodKey:'#'+isoDate(vatReturn.periodEnd).slice(2,4)+'A'+Math.ceil((new Date(vatReturn.periodEnd).getMonth()+1)/3),
 vrn:vatNumber||'',
 vatDueSales:vatReturn.boxes[1],
 vatDueAcquisitions:vatReturn.boxes[2],
 totalVatDue:vatReturn.boxes[3],
 vatReclaimedCurrPeriod:vatReturn.boxes[4],
 netVatDue:Math.abs(vatReturn.boxes[5]),
 totalValueSalesExsales tax:vatReturn.boxes[6],
 totalValuePurchasesExsales tax:vatReturn.boxes[7],
 totalValueGoodsSuppliedExsales tax:vatReturn.boxes[8],
 totalAcquisitionsExsales tax:vatReturn.boxes[9],
 finalised:true,
 };
}
// ════════════════════════════════════════════════════════════════
// DEADLINE ENGINE · auto-generate per client
// ════════════════════════════════════════════════════════════════
function generateDeadlinesForClient(c){
 const out=[];
 const services=c.servicesEngaged||[];
 const pe=c.accountingPeriodEnd?new Date(c.accountingPeriodEnd):null;
 const ps=c.accountingPeriodStart?new Date(c.accountingPeriodStart):null;
 const today=new Date();
 const mkId=(kind,d)=>'dl_'+c.id+'_'+kind+'_'+isoDate(d);
 // Schedule C — sole-trader OR sole-trader-with-services-sa OR directors of Ltd with personal SA
 if(c.entityType==='sole-trader'||services.includes('sa')){
 // 31 Jan after end of tax year (assume tax year is 6 Apr-5 Apr nearest to period end)
 const tyEnd=new Date(today.getFullYear(),3,5); // 5 Apr current
 if(today>tyEnd)tyEnd.setFullYear(tyEnd.getFullYear()+1);
 const sa100=new Date(tyEnd.getFullYear()+1,0,31);
 out.push({kind:'Schedule C',label:'Schedule C Self Assessment '+(tyEnd.getFullYear()-1)+'-'+String(tyEnd.getFullYear()).slice(2),dueAt:isoDate(sa100),status:'pending',id:mkId('Schedule C',sa100)});
 // Payments on account · 31 Jan + 31 Jul
 out.push({kind:'SA-POA1',label:'SA payment on account #1',dueAt:isoDate(sa100),status:'pending',id:mkId('SA-POA1',sa100)});
 const poa2=new Date(sa100);poa2.setMonth(6);poa2.setDate(31);
 out.push({kind:'SA-POA2',label:'SA payment on account #2',dueAt:isoDate(poa2),status:'pending',id:mkId('SA-POA2',poa2)});
 }
 // Form 1120 + CT payment + Delaware SoS
 if(c.entityType==='limited-company'){
 if(pe){
 const ct600=new Date(pe);ct600.setFullYear(ct600.getFullYear()+1);
 out.push({kind:'Form 1120',label:'Form 1120 Federal income tax return',dueAt:isoDate(ct600),status:'pending',id:mkId('Form 1120',ct600)});
 const ctPay=new Date(pe);ctPay.setMonth(ctPay.getMonth()+9);ctPay.setDate(ctPay.getDate()+1);
 out.push({kind:'CT-PAY',label:'Federal income tax payment',dueAt:isoDate(ctPay),status:'pending',id:mkId('CT-PAY',ctPay)});
 // Delaware SoS annual accounts (private = 9 months after year end)
 const accDue=new Date(pe);accDue.setMonth(accDue.getMonth()+9);
 out.push({kind:'ACC',label:'Delaware SoS accounts',dueAt:isoDate(accDue),status:'pending',id:mkId('ACC',accDue)});
 }
 // CS01 · confirmation statement · annually (one year after incorporation or last CS01)
 const cs01Anchor=c.lastConfirmationStatement||c.accountingPeriodStart||isoDate(today);
 const cs01=addDays(new Date(cs01Anchor),365);
 out.push({kind:'CS01',label:'Confirmation statement (CS01)',dueAt:isoDate(cs01),status:'pending',id:mkId('CS01',cs01)});
 }
 // sales tax100 quarterly
 if(c.vatScheme&&c.vatScheme!=='none'&&c.vatNumber){
 // Generate next 4 quarterly returns based on registration date or year end
 const anchor=c.vatRegisteredDate?new Date(c.vatRegisteredDate):(pe?new Date(pe):new Date(today.getFullYear(),0,1));
 // Round to next quarter
 let q=new Date(anchor.getFullYear(),anchor.getMonth(),1);
 while(q<today)q=addMonths(q,3);
 for(let i=0;i<4;i++){
 const qEnd=addDays(addMonths(q,3),-1);
 const qDue=addDays(addMonths(qEnd,1),7);
 out.push({kind:'sales tax100',label:'sales tax100 '+isoDate(q).slice(0,7)+' to '+isoDate(qEnd).slice(0,7),dueAt:isoDate(qDue),status:'pending',id:mkId('sales tax100',qDue),periodStart:isoDate(q),periodEnd:isoDate(qEnd)});
 q=addMonths(q,3);
 }
 }
 // W-2 payroll · monthly EPS/P32, FPS on payday
 if(services.includes('payroll')&&c.payeReference){
 // P32 / EPS payment due 22nd of following month (or 19th if cheque)
 for(let i=0;i<3;i++){
 const m=new Date(today.getFullYear(),today.getMonth()+i,22);
 out.push({kind:'W-2 payroll-RTI',label:'W-2 payroll / NI payment '+isoDate(m).slice(0,7),dueAt:isoDate(m),status:'pending',id:mkId('W-2 payroll',m)});
 }
 // P60 · 31 May
 const p60=new Date(today.getFullYear(),4,31);
 if(p60<today)p60.setFullYear(p60.getFullYear()+1);
 out.push({kind:'P60',label:'P60 employee certificate',dueAt:isoDate(p60),status:'pending',id:mkId('P60',p60)});
 // P11D · 6 July
 const p11d=new Date(today.getFullYear(),6,6);
 if(p11d<today)p11d.setFullYear(p11d.getFullYear()+1);
 out.push({kind:'P11D',label:'P11D benefits in kind',dueAt:isoDate(p11d),status:'pending',id:mkId('P11D',p11d)});
 }
 // Merge with existing (preserve submitted status)
 const existing=c.deadlines||[];
 const merged=out.map(d=>{
 const ex=existing.find(x=>x.id===d.id);
 return ex?Object.assign({},d,{status:ex.status,submittedAt:ex.submittedAt,submissionRef:ex.submissionRef,notes:ex.notes}):d;
 });
 // Preserve any existing deadlines that don't appear in regenerated set (manually added or submitted)
 for(const ex of existing){
 if(!merged.find(x=>x.id===ex.id))merged.push(ex);
 }
 merged.sort((a,b)=>a.dueAt<b.dueAt?-1:1);
 return merged;
}
async function refreshDeadlines(c){
 c.deadlines=generateDeadlinesForClient(c);
 await persistClient(c,'deadlines regenerated');
}
function deadlineStatus(d){
 if(d.status==='submitted')return 'done';
 const today=isoDate(new Date());
 if(d.dueAt<today)return 'overdue';
 const diff=daysBetween(today,d.dueAt);
 if(diff<=30)return 'soon';
 return 'pending';
}
function allDeadlines(){
 const out=[];
 for(const c of state.clients){if(c.archivedAt)continue;for(const d of (c.deadlines||[])){out.push({...d,client:c})}}
 out.sort((a,b)=>a.dueAt<b.dueAt?-1:1);
 return out;
}
// ════════════════════════════════════════════════════════════════
// PAYROLL · RTI-shaped FPS/EPS
// ════════════════════════════════════════════════════════════════
function computePayrollPeriod(client,periodStart,periodEnd,opts){
 opts=opts||{};
 const employees=client.employees||[];
 const monthsInPeriod=Math.max(1,Math.round((new Date(periodEnd)-new Date(periodStart))/2592000000));
 const periodsPerYear=client.payePeriod==='weekly'?52:12;
 const out={
 id:'pr_'+uid(),clientId:client.id,
 periodStart,periodEnd,
 payeReference:client.payeReference||'',
 employees:[],
 totals:{gross:0,paye:0,niEe:0,niEr:0,pension:0,net:0},
 fpsRef:'FPS-'+isoDate(periodEnd).replace(/-/g,'')+'-'+(Math.random().toString(36).slice(2,6).toUpperCase()),
 epsRef:'EPS-'+isoDate(periodEnd).slice(0,7).replace(/-/g,''),
 status:'draft',
 computedAt:now(),
 };
 for(const e of employees){
 const annualSalary=+e.annualSalary||0;
 const periodGross=annualSalary/periodsPerYear*monthsInPeriod;
 // W-2 payroll: simplified — applies cumulative tax-free PA and basic rate per period
 const periodPA=adjustedPersonalAllowance(annualSalary)/periodsPerYear*monthsInPeriod;
 const periodBasicBand=RULES.basicRateBand/periodsPerYear*monthsInPeriod;
 let taxable=Math.max(0,periodGross-periodPA);
 let paye=0;
 const basic=Math.min(taxable,periodBasicBand);paye+=basic*RULES.basicRate;taxable-=basic;
 const higherSize=(RULES.additionalRateStart-RULES.higherRateStart)/periodsPerYear*monthsInPeriod;
 const higher=Math.min(taxable,higherSize);paye+=higher*RULES.higherRate;taxable-=higher;
 if(taxable>0)paye+=taxable*RULES.additionalRate;
 // NI · per-period thresholds
 const periodPT=RULES.niPrimaryThreshold/periodsPerYear*monthsInPeriod;
 const periodUEL=RULES.niUpperEarningsLimit/periodsPerYear*monthsInPeriod;
 const periodErT=RULES.niEmployerThreshold/periodsPerYear*monthsInPeriod;
 const niEeMain=Math.max(0,Math.min(periodGross,periodUEL)-periodPT)*RULES.niMainRate;
 const niEeUpper=Math.max(0,periodGross-periodUEL)*RULES.niUpperRate;
 const niEe=niEeMain+niEeUpper;
 const niEr=Math.max(0,periodGross-periodErT)*RULES.niEmployerRate;
 const pension=(e.pensionPct||0)*periodGross;
 const studentLoan=e.studentLoan?Math.max(0,(periodGross-27295/periodsPerYear*monthsInPeriod))*0.09:0;
 const net=periodGross-paye-niEe-pension-studentLoan;
 const row={
 id:e.id||uid(),name:e.name,nino:e.nino||'',taxCode:e.taxCode||'1257L',
 gross:+periodGross.toFixed(2),paye:+paye.toFixed(2),niEe:+niEe.toFixed(2),niEr:+niEr.toFixed(2),
 pension:+pension.toFixed(2),studentLoan:+studentLoan.toFixed(2),net:+net.toFixed(2)
 };
 out.employees.push(row);
 out.totals.gross+=row.gross;out.totals.paye+=row.paye;out.totals.niEe+=row.niEe;out.totals.niEr+=row.niEr;out.totals.pension+=row.pension;out.totals.net+=row.net;
 }
 out.totals.p32Liability=+(out.totals.paye+out.totals.niEe+out.totals.niEr-(out.totals.employmentAllowance||0)).toFixed(2);
 // round totals
 ['gross','paye','niEe','niEr','pension','net'].forEach(k=>out.totals[k]=+out.totals[k].toFixed(2));
 return out;
}
function generateP60(client,employeeId,taxYear){
 // Sum payroll runs for the tax year for this employee
 const runs=state.payrollRuns.filter(r=>r.clientId===client.id);
 const matching=runs.flatMap(r=>r.employees.filter(e=>e.id===employeeId).map(e=>({run:r,e})));
 const totals={gross:0,paye:0,niEe:0,niEr:0,pension:0,net:0};
 for(const {e} of matching){
 totals.gross+=e.gross;totals.paye+=e.paye;totals.niEe+=e.niEe;totals.niEr+=e.niEr;totals.pension+=e.pension;totals.net+=e.net;
 }
 const emp=(client.employees||[]).find(e=>e.id===employeeId)||{name:'unknown'};
 return{
 form:'P60',taxYear,employer:client.entityName||clientName(client),employerPayeRef:client.payeReference,
 employee:{name:emp.name,nino:emp.nino,taxCode:emp.taxCode||'1257L'},
 totals,issuedAt:now(),
 };
}
// ════════════════════════════════════════════════════════════════
// T0 KNOWLEDGE BASE · 14 deterministic rules
// ════════════════════════════════════════════════════════════════
const T0_RULES=[
 {q:/Schedule C|self.?assessment.*deadline|when.*SA/i,a:'**Schedule C deadlines** — Paper return: 31 October following end of tax year. Online: 31 January following end of tax year. Tax payment also due 31 January. Payments on account (50% each) due 31 January and 31 July. Late filing: $100 fixed penalty after deadline, then daily $10 (max $900), then 5% or $300 (whichever greater) at 6 months and again 12 months.'},
 {q:/Form 1120|corporation tax.*deadline|when.*CT/i,a:'**Form 1120 / Federal income tax** — Return due 12 months after accounting period end. Tax payment due 9 months and 1 day after period end (or quarterly instalments for large/very large companies). Late filing penalty: $100 (1 day), $200 (3 months), 10% of unpaid tax (18 months), 20% (12 months). For accounting periods ending after 1 April 2023, rates are 19% (≤$50k), marginal relief $50k–$250k, 25% (>$250k).'},
 {q:/sales tax.*1099-K|making tax digital|1099-K/i,a:'**1099-K for sales tax** — Mandatory for all sales tax-registered businesses since April 2022. Requires (a) digital records, (b) digital links between software, (c) returns submitted via API-compatible software. Records must be retained 6 years. From April 2026, 1099-K for ITSA starts for sole traders/landlords with qualifying income >$50k, then >$30k from 2027.'},
 {q:/P60|when.*P60|payslip end of year/i,a:'**P60** — Annual end-of-year certificate showing total pay and deductions for each employee. Must be issued by 31 May following end of tax year (5 April). One per employee still employed on 5 April.'},
 {q:/P11D|benefits in kind|when.*P11D/i,a:'**P11D** — Reports benefits in kind (BIK) for employees and directors. Due 6 July following the tax year. Class 1A FICA on benefits payable by 22 July (electronic) / 19 July (post). Payrolled benefits can be reported via FPS instead, but P11D(b) Class 1A return still required.'},
 {q:/R.?D|research.*development|SME.*credit/i,a:'**R&D tax relief (post-1 April 2024)** — Two schemes: (1) **Merged RDEC** — 20% above-the-line credit (taxable, net ≈15-16.2%) for all companies. (2) **ERIS (Enhanced R&D Intensive Support)** — for loss-making SMEs where qualifying R&D ≥30% of total expenditure: 86% uplift + 14.5% surrender = up to 27% effective rate. Pre-notification required within 6 months of period end for new claimants. W-2 payroll/FICA cap applies.'},
 {q:/flat rate|sales tax.*sector|FRS/i,a:'**sales tax Flat Rate Scheme** — For businesses with sales tax-exclusive turnover ≤$150k. You pay a flat % of gross (sales tax-inclusive) turnover instead of standard sales tax calculation. Sector rates range 4% (retail food) to 16.5% (limited cost trader). 1% discount in first year of sales tax registration. Cannot reclaim input sales tax except on capital assets >$2,000. Must leave at gross turnover $230k.'},
 {q:/W-2 payroll.*RTI|FPS|real.?time/i,a:'**W-2 payroll RTI · FPS vs EPS** — **FPS** (Full Payment Submission) sent on or before every payday with employee pay/deduction details. **EPS** (Employer Payment Summary) sent monthly to claim reductions (statutory pay reclaim, Employment Allowance, CIS deductions, apprenticeship levy). **P32** is the monthly summary you remit to IRS by 22nd (electronic) of following month.'},
 {q:/companies house.*penalty|late filing.*accounts/i,a:'**Delaware SoS late filing penalty (private Ltd)** — Up to 1 month late: $150. 1-3 months: $375. 3-6 months: $750. >6 months: $1,500. Doubled if late in two consecutive years. Public companies: $750/$1,500/$3,000/$7,500. Note: this is separate from Form 1120 late-filing penalty (which goes to IRS).'},
 {q:/marginal relief|small profits.*CT/i,a:'**CT marginal relief (FY 2023+)** — Profits ≤$50k: 19% small profits rate. Profits ≥$250k: 25% main rate. Between $50k–$250k: marginal relief tapers between the two. Formula: F × (U − A) × N/A, where F = 3/200, U = upper limit ($250k), A = augmented profits, N = taxable profits. Limits prorated for associated companies and short accounting periods.'},
 {q:/director.?s loan|DLA|s.455|loan.*director/i,a:'**Director\'s loan (DLA)** — If overdrawn at year end and not repaid within 9 months 1 day, company pays **s.455 tax** at 33.75% of overdrawn balance (matches dividend higher rate). Refundable when loan is repaid (4 years to wait). Loans >$10k = benefit in kind reportable on P11D (IRS official rate, 2.25% for 2024-25). Bed-and-breakfasting anti-avoidance: 30-day rule + $15k rule applies.'},
 {q:/reverse charge.*construction|CIS reverse|DRC/i,a:'**Domestic Reverse Charge (CIS)** — Since 1 March 2021, sales tax-registered subcontractors don\'t charge sales tax to sales tax-registered contractor customers. Instead, contractor self-accounts (output + input both, net effect $0). Applies to most construction services where (a) both parties sales tax-registered, (b) supply within CIS, (c) recipient is not end-user. Invoice must state "Reverse charge: customer to account for sales tax".'},
 {q:/PSC|persons.*significant.*control|beneficial owner/i,a:'**PSC register** — Companies must keep a register of Persons with Significant Control. A PSC: (a) owns >25% shares, (b) >25% voting rights, (c) right to appoint/remove majority of board, (d) significant influence/control, (e) trust/firm with above. Changes filed via PSC01-09 forms within 14 days. Public on Delaware SoS. Annual confirmation via CS01.'},
 {q:/confirmation statement|CS01|accounts.*difference/i,a:'**CS01 vs annual accounts** — **CS01 (confirmation statement)** confirms registered details (registered office, SIC code, shareholders, PSCs) are up to date. Due annually by anniversary of incorporation (+14 days), $34 online/$62 paper. **Annual accounts** are statutory financial statements due 9 months after year end (private), filed at Delaware SoS and (via Form 1120) at IRS.'},
];
function answerT0(query){
 const q=String(query||'').trim();
 if(!q)return{found:false,answer:'Ask anything about US accountancy practice — SA, CT, sales tax, W-2 payroll, R&D, Delaware SoS.'};
 for(const r of T0_RULES){
 if(r.q.test(q))return{found:true,answer:r.a,source:'T0'};
 }
 // Dynamic computed answers
 const c=currentClient();
 if(/next deadline/i.test(q)&&c){
 const ds=(c.deadlines||[]).filter(d=>d.status!=='submitted').slice(0,3);
 if(ds.length)return{found:true,answer:'Next deadlines for **'+clientName(c)+'**:\n'+ds.map(d=>'• '+d.label+' — '+fmtDate(d.dueAt)+' ('+deadlineStatus(d)+')').join('\n'),source:'T0·computed'};
 }
 if(/CT.*on (\d+)|corporation tax.*$?(\d+)/i.test(q)){
 const m=q.match(/(\d{3,})/);if(m){const p=+m[1];const r=computeCT(p);return{found:true,answer:'CT on $'+fmt(p)+' = **'+moneyP(r.tax)+'** ('+r.note+'). Effective rate '+pct(r.effectiveRate)+'.',source:'T0·computed'};}
 }
 return{found:false,answer:'No T0 rule matched. Try: "When is Schedule C due?", "Form 1120 deadline?", "sales tax 1099-K compliance?", "R&D SME post-2024?", "sales tax flat-rate sectors?", "W-2 payroll RTI vs FPS?", "Delaware SoS late filing penalty?", "Marginal relief CT?", "Director\'s loan tax?", "Reverse charge sales tax construction?", "PSC rules?", "Confirmation statement vs accounts?". Or connect a T3 BYOK key in Settings.'};
}
// T3 BYOK (best-effort, optional)
async function askT3(q,prov){
 const key=state.settings[prov+'Key'];
 if(!key)return{answer:'No '+prov+' API key set. Open Settings to add a key (stored locally only, never transmitted to FallBooks).',source:'T3·error'};
 const sys='You are an assistant for a US accountancy practitioner using FallBooks. Be concise. Cite IRS manuals/Companies Act where helpful. Always end with "Verify with primary IRS/AICPA sources before acting." Tax year 2025-26.';
 try{
 if(prov==='anthropic'){
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-3-5-haiku-latest',max_tokens:800,system:sys,messages:[{role:'user',content:q}]})});
 const j=await r.json();return{answer:(j.content&&j.content[0]&&j.content[0].text)||JSON.stringify(j),source:'T3·anthropic'};
 }else if(prov==='openai'){
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:q}],max_tokens:800})});
 const j=await r.json();return{answer:(j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||JSON.stringify(j),source:'T3·openai'};
 }else if(prov==='gemini'){
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:sys+'\n\n'+q}]}]})});
 const j=await r.json();return{answer:(j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts[0].text)||JSON.stringify(j),source:'T3·gemini'};
 }
 }catch(e){return{answer:'T3 call failed: '+e.message,source:'T3·error'};}
 return{answer:'Unknown provider',source:'T3·error'};
}
function currentClient(){return state.currentClientId?state.clients.find(c=>c.id===state.currentClientId):null}
function currentAdviser(){return state.advisers.find(a=>a.id===state.settings.currentAdviserId)||state.advisers[0]||null}
// ════════════════════════════════════════════════════════════════
// UI · RENDER LAYER
// ════════════════════════════════════════════════════════════════
function render(){
 if(!state.firm||!state.firm.setupCompletedAt){renderOnboarding();return}
 renderHeader();renderLayout();
}
function renderHeader(){
 const tabs=$('#tabs');
 tabs.innerHTML=TABS.map(t=>'<button class="'+(t.id===state.active?'active':'')+'" onclick="setActive(\''+t.id+'\')"><span>'+t.ico+'</span><span>'+t.name+'</span></button>').join('');
 const cp=$('#clientPill');
 const c=currentClient();
 if(c){cp.style.display='flex';$('#cpWho').textContent=clientShort(c);$('#cpMeta').textContent=c.entityType+' · '+(c.servicesEngaged||[]).join(', ').slice(0,28)}
 else{cp.style.display='none'}
}
function setActive(t){state.active=t;saveUI();render()}
async function setCurrentClient(id){state.currentClientId=id;state.currentSubtab='overview';await saveUI();if(state.active==='clients')state.active='clients';render()}
function renderLayout(){
 const root=$('#layout');
 root.innerHTML='<aside class="sidebar" id="sidebar"></aside><main id="main"></main>';
 renderSidebar();renderMain();
}
function renderSidebar(){
 const sb=$('#sidebar');
 const f=state.filters;
 const clients=state.clients.filter(c=>{
 if(c.archivedAt)return false;
 if(f.q){const q=f.q.toLowerCase();if(!clientName(c).toLowerCase().includes(q)&&!(c.vatNumber||'').toLowerCase().includes(q)&&!(c.companiesHouseNo||'').toLowerCase().includes(q))return false}
 if(f.entityType&&c.entityType!==f.entityType)return false;
 if(f.service&&!(c.servicesEngaged||[]).includes(f.service))return false;
 if(f.adviserId&&c.adviserId!==f.adviserId)return false;
 if(f.overdueOnly){const od=(c.deadlines||[]).some(d=>deadlineStatus(d)==='overdue');if(!od)return false}
 return true;
 });
 clients.sort((a,b)=>clientName(a).localeCompare(clientName(b)));
 const adviserOpts=state.advisers.map(a=>'<option value="'+a.id+'"'+(f.adviserId===a.id?' selected':'')+'>'+esc(a.name)+'</option>').join('');
 sb.innerHTML=`
 <div class="sidebar-search">
 <input id="sbq" placeholder="Search clients · sales tax no · CH no" value="${esc(f.q)}" oninput="state.filters.q=this.value;renderSidebar()">
 <select onchange="state.filters.entityType=this.value;renderSidebar()">
 <option value="">All entity types</option>
 <option value="sole-trader"${f.entityType==='sole-trader'?' selected':''}>Sole trader</option>
 <option value="partnership"${f.entityType==='partnership'?' selected':''}>Partnership</option>
 <option value="llp"${f.entityType==='llp'?' selected':''}>LLP</option>
 <option value="limited-company"${f.entityType==='limited-company'?' selected':''}>Ltd company</option>
 <option value="charity"${f.entityType==='charity'?' selected':''}>Charity</option>
 <option value="trust"${f.entityType==='trust'?' selected':''}>Trust</option>
 </select>
 <select onchange="state.filters.service=this.value;renderSidebar()">
 <option value="">All services</option>
 <option value="accounts"${f.service==='accounts'?' selected':''}>Accounts</option>
 <option value="ct"${f.service==='ct'?' selected':''}>CT</option>
 <option value="vat"${f.service==='vat'?' selected':''}>sales tax</option>
 <option value="payroll"${f.service==='payroll'?' selected':''}>Payroll</option>
 <option value="sa"${f.service==='sa'?' selected':''}>SA</option>
 <option value="bookkeeping"${f.service==='bookkeeping'?' selected':''}>Bookkeeping</option>
 </select>
 <select onchange="state.filters.adviserId=this.value;renderSidebar()">
 <option value="">All advisers</option>
 ${adviserOpts}
 </select>
 <div class="chip-row">
 <span class="chip ${f.overdueOnly?'on':''}" onclick="state.filters.overdueOnly=!state.filters.overdueOnly;renderSidebar()">Overdue</span>
 <span class="chip" onclick="addClientFlow()">+ New client</span>
 </div>
 </div>
 <h4>Clients · ${clients.length}</h4>
 <div class="client-list">
 ${clients.length?clients.map(c=>renderClientCard(c)).join(''):'<div class="empty-state">No clients match filters. Click "+ New client" to add one.</div>'}
 </div>
 `;
}
function renderClientCard(c){
 const adv=state.advisers.find(a=>a.id===c.adviserId);
 const nextD=(c.deadlines||[]).filter(d=>d.status!=='submitted').sort((a,b)=>a.dueAt<b.dueAt?-1:1)[0];
 const overdueCount=(c.deadlines||[]).filter(d=>deadlineStatus(d)==='overdue').length;
 const soonCount=(c.deadlines||[]).filter(d=>deadlineStatus(d)==='soon').length;
 const riskCls=c.kyc&&c.kyc.riskGrade==='high'?'due':c.kyc&&c.kyc.riskGrade==='medium'?'amber':'green';
 return `<div class="client-card ${c.id===state.currentClientId?'active':''}" onclick="setCurrentClient('${c.id}')">
 <div class="nm">${esc(clientShort(c))}</div>
 <div class="sub">
 <span class="tag">${c.entityType.replace('-',' ')}</span>
 ${c.vatNumber?'<span class="tag">sales tax</span>':''}
 ${overdueCount?'<span class="tag due">'+overdueCount+' OVERDUE</span>':''}
 ${!overdueCount&&soonCount?'<span class="tag amber">'+soonCount+' SOON</span>':''}
 ${nextD&&!overdueCount&&!soonCount?'<span class="tag green">'+nextD.kind+' '+fmtDate(nextD.dueAt).slice(0,6)+'</span>':''}
 <span class="tag ${riskCls}">AML ${c.kyc&&c.kyc.riskGrade||'low'}</span>
 ${adv?'<span class="tag">'+esc(adv.name.split(' ')[0])+'</span>':''}
 </div>
 </div>`;
}
function renderMain(){
 const m=$('#main');
 m.innerHTML=`<div class="disclaimer"><strong>FallBooks · practitioner aid.</strong> Multi-client bookkeeping, deadline tracking, SA/CT/sales tax/W-2 payroll summary preparation, engagement letters, and practice management. Not an IRS-approved filing system — submissions to IRS/Delaware SoS remain the practitioner's responsibility. Sovereign — client data never leaves the device unless exported.</div>`;
 const a=state.active;
 if(a==='dashboard')renderDashboard(m);
 else if(a==='clients')renderClients(m);
 else if(a==='deadlines')renderDeadlines(m);
 else if(a==='books')renderBooks(m);
 else if(a==='vat')rendersales tax(m);
 else if(a==='sa')renderSA(m);
 else if(a==='ct')renderCT(m);
 else if(a==='payroll')renderPayroll(m);
 else if(a==='qa')renderQA(m);
 else if(a==='practice')renderPractice(m);
}
// ── Dashboard ──
function renderDashboard(m){
 const all=allDeadlines();
 const overdue=all.filter(d=>deadlineStatus(d)==='overdue').length;
 const soon=all.filter(d=>deadlineStatus(d)==='soon').length;
 const done=all.filter(d=>deadlineStatus(d)==='done').length;
 const clientCount=state.clients.filter(c=>!c.archivedAt).length;
 const byType={};state.clients.filter(c=>!c.archivedAt).forEach(c=>byType[c.entityType]=(byType[c.entityType]||0)+1);
 const byService={};state.clients.filter(c=>!c.archivedAt).forEach(c=>(c.servicesEngaged||[]).forEach(s=>byService[s]=(byService[s]||0)+1));
 const next7=all.filter(d=>deadlineStatus(d)!=='done').slice(0,8);
 m.innerHTML+=`
 <div class="section-h">
 <div><h2>Practice dashboard</h2><div class="sub">${esc(state.firm.name)} · tax year ${TAX_YEAR}</div></div>
 <div class="actions"><button class="btn ghost" onclick="seedDemoData()">+ Seed demo client</button></div>
 </div>
 <div class="deadline-summary">
 <div class="ds"><div class="v ${overdue?'red':'green'}">${overdue}</div><div class="l">overdue</div></div>
 <div class="ds"><div class="v ${soon?'amber':''}">${soon}</div><div class="l">due ≤30 days</div></div>
 <div class="ds"><div class="v">${all.length-done}</div><div class="l">pending</div></div>
 <div class="ds"><div class="v">${clientCount}</div><div class="l">active clients</div></div>
 </div>
 <div class="grid">
 <div class="card"><h3>Clients by type</h3>${Object.keys(byType).map(k=>`<div class="kpi"><span class="l">${k.replace('-',' ')}</span><span class="v">${byType[k]}</span></div>`).join('')||'<div class="empty-state">No clients yet</div>'}</div>
 <div class="card"><h3>Services engaged</h3>${Object.keys(byService).map(k=>`<div class="kpi"><span class="l">${k}</span><span class="v">${byService[k]}</span></div>`).join('')||'<div class="empty-state">—</div>'}</div>
 <div class="card"><h3>Firm details</h3>
 <div class="kpi"><span class="l">Professional body</span><span class="v">${esc(state.firm.professionalBody)}</span></div>
 <div class="kpi"><span class="l">Practice cert</span><span class="v">${esc(state.firm.practiceCertNo||'—')}</span></div>
 <div class="kpi"><span class="l">AML supervisor</span><span class="v">${esc(state.firm.amlSupervisor)}</span></div>
 <div class="kpi"><span class="l">IRS agent ref</span><span class="v">${esc(state.firm.hmrcAgentRef||'—')}</span></div>
 <div class="kpi"><span class="l">PI expires</span><span class="v">${state.firm.piExpiresAt?fmtDate(state.firm.piExpiresAt):'—'}</span></div>
 <div class="kpi"><span class="l">Advisers</span><span class="v">${state.advisers.length}</span></div>
 </div>
 <div class="card"><h3>Next 8 deadlines <span class="meta">${all.length} total</span></h3>
 <table><thead><tr><th>Due</th><th>Client</th><th>Kind</th></tr></thead><tbody>
 ${next7.map(d=>`<tr class="clickable ${deadlineStatus(d)==='overdue'?'overdue':deadlineStatus(d)==='soon'?'soon':''}" onclick="setCurrentClient('${d.client.id}');setActive('deadlines')"><td>${fmtDate(d.dueAt)}</td><td>${esc(clientShort(d.client))}</td><td>${d.kind}</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:var(--cream-muted)">No deadlines</td></tr>'}
 </tbody></table>
 </div>
 </div>
 `;
}
// ── Clients screen ──
function renderClients(m){
 const c=currentClient();
 if(!c){
 m.innerHTML+=`<div class="section-h"><div><h2>Clients</h2><div class="sub">${state.clients.filter(x=>!x.archivedAt).length} active</div></div><div class="actions"><button class="btn primary" onclick="addClientFlow()">+ New client</button></div></div>
 <div class="card"><div class="empty-state">Select a client from the sidebar, or add a new one.</div></div>`;
 return;
 }
 const subs=['overview','identity','services','transactions','sa','ct','vat','payroll','deadlines','documents','time','history'];
 const subTabs=subs.map(s=>`<button class="${state.currentSubtab===s?'active':''}" onclick="state.currentSubtab='${s}';renderMain()">${s.toUpperCase()}</button>`).join('');
 m.innerHTML+=`<div class="section-h"><div><h2>${esc(clientName(c))}</h2><div class="sub">${c.entityType} · ${esc(c.companiesHouseNo||c.utr||'no ref')} · ${(c.servicesEngaged||[]).join(' · ')}</div></div>
 <div class="actions">
 <button class="btn ghost" onclick="refreshDeadlinesNow()">↻ Refresh deadlines</button>
 <button class="btn danger sm" onclick="archiveClient()">Archive</button>
 </div></div>
 <div class="subtabs">${subTabs}</div>
 <div id="clientSub"></div>`;
 renderClientSub();
}
function renderClientSub(){
 const c=currentClient();if(!c)return;
 const root=$('#clientSub');if(!root)return;
 const s=state.currentSubtab;
 if(s==='overview')root.innerHTML=clientOverview(c);
 else if(s==='identity')root.innerHTML=clientIdentity(c);
 else if(s==='services')root.innerHTML=clientServices(c);
 else if(s==='transactions')root.innerHTML=clientTransactions(c);
 else if(s==='sa')root.innerHTML=clientSA(c);
 else if(s==='ct')root.innerHTML=clientCT(c);
 else if(s==='vat')root.innerHTML=clientsales tax(c);
 else if(s==='payroll')root.innerHTML=clientPayroll(c);
 else if(s==='deadlines')root.innerHTML=clientDeadlines(c);
 else if(s==='documents')root.innerHTML=clientDocuments(c);
 else if(s==='time')root.innerHTML=clientTime(c);
 else if(s==='history')root.innerHTML=clientHistory(c);
}
function clientOverview(c){
 const ds=(c.deadlines||[]).filter(d=>d.status!=='submitted').slice(0,5);
 const txCount=state.transactions.filter(t=>t.clientId===c.id).length;
 const adv=state.advisers.find(a=>a.id===c.adviserId);
 return `<div class="grid">
 <div class="card"><h3>At a glance</h3>
 <div class="kpi"><span class="l">Entity</span><span class="v">${c.entityType}</span></div>
 <div class="kpi"><span class="l">Year end</span><span class="v">${c.accountingPeriodEnd?fmtDate(c.accountingPeriodEnd):'—'}</span></div>
 <div class="kpi"><span class="l">sales tax scheme</span><span class="v">${c.vatScheme||'none'}</span></div>
 <div class="kpi"><span class="l">W-2 payroll ref</span><span class="v">${esc(c.payeReference||'—')}</span></div>
 <div class="kpi"><span class="l">Adviser</span><span class="v">${adv?esc(adv.name):'—'}</span></div>
 <div class="kpi"><span class="l">Transactions</span><span class="v">${txCount}</span></div>
 <div class="kpi"><span class="l">AML risk</span><span class="v ${c.kyc.riskGrade==='high'?'red':c.kyc.riskGrade==='medium'?'amber':'green'}">${c.kyc.riskGrade}</span></div>
 </div>
 <div class="card"><h3>Engagement</h3>
 <div class="kpi"><span class="l">Type</span><span class="v">${c.engagement.type}</span></div>
 <div class="kpi"><span class="l">Fee basis</span><span class="v">${c.engagement.feeBasis}</span></div>
 <div class="kpi"><span class="l">Fee amount</span><span class="v">${moneyP(c.engagement.feeAmount||0)}</span></div>
 <div class="kpi"><span class="l">Frequency</span><span class="v">${c.engagement.feeFrequency||'—'}</span></div>
 <div class="kpi"><span class="l">Letter signed</span><span class="v ${c.engagement.letterOfEngagementSignedAt?'green':'red'}">${c.engagement.letterOfEngagementSignedAt?fmtDate(c.engagement.letterOfEngagementSignedAt):'NOT SIGNED'}</span></div>
 ${!c.engagement.letterOfEngagementSignedAt?`<button class="btn primary sm" style="margin-top:8px" onclick="signEngagement('${c.id}')">Mark engagement signed</button>`:''}
 </div>
 <div class="card"><h3>Upcoming deadlines</h3>
 ${ds.length?'<table><thead><tr><th>Due</th><th>Kind</th><th>Status</th></tr></thead><tbody>'+ds.map(d=>`<tr class="${deadlineStatus(d)==='overdue'?'overdue':deadlineStatus(d)==='soon'?'soon':''}"><td>${fmtDate(d.dueAt)}</td><td>${d.kind}</td><td>${deadlineStatus(d)}</td></tr>`).join('')+'</tbody></table>':'<div class="empty-state">No pending deadlines. Click "Refresh deadlines".</div>'}
 </div>
 </div>`;
}
function clientIdentity(c){
 const isIndiv=c.entityType==='sole-trader';
 return `<div class="card"><h3>Identity</h3>
 ${isIndiv?`
 <div class="row r3">
 <div class="field"><label>Title</label><input id="i_title" value="${esc(c.title)}"></div>
 <div class="field"><label>First name</label><input id="i_first" value="${esc(c.firstName)}"></div>
 <div class="field"><label>Last name</label><input id="i_last" value="${esc(c.lastName)}"></div>
 </div>
 <div class="row r3">
 <div class="field"><label>Date of birth</label><input id="i_dob" type="date" value="${esc(c.dob)}"></div>
 <div class="field"><label>NINO</label><input id="i_nino" value="${esc(c.nino)}"></div>
 <div class="field"><label>UTR</label><input id="i_utr" value="${esc(c.utr)}"></div>
 </div>`:`
 <div class="row">
 <div class="field"><label>Entity name</label><input id="i_entity" value="${esc(c.entityName)}"></div>
 <div class="field"><label>Trading name</label><input id="i_trade" value="${esc(c.tradingName)}"></div>
 </div>
 <div class="row r3">
 <div class="field"><label>Delaware SoS no</label><input id="i_ch" value="${esc(c.companiesHouseNo)}"></div>
 <div class="field"><label>CT UTR</label><input id="i_ctutr" value="${esc(c.ctUtr)}"></div>
 <div class="field"><label>sales tax number</label><input id="i_vat" value="${esc(c.vatNumber)}"></div>
 </div>`}
 <div class="row r3">
 <div class="field"><label>Period start</label><input id="i_ps" type="date" value="${esc(c.accountingPeriodStart)}"></div>
 <div class="field"><label>Period end</label><input id="i_pe" type="date" value="${esc(c.accountingPeriodEnd)}"></div>
 <div class="field"><label>Year end (MM-DD)</label><input id="i_ye" value="${esc(c.yearEnd)}"></div>
 </div>
 <div class="row r3">
 <div class="field"><label>sales tax scheme</label><select id="i_vs">
 ${['none','standard','flat-rate','cash','annual','margin'].map(s=>`<option value="${s}"${c.vatScheme===s?' selected':''}>${s}</option>`).join('')}
 </select></div>
 <div class="field"><label>Flat-rate sector</label><select id="i_vfs">
 <option value="">—</option>${Object.keys(sales tax_FLAT_RATE).map(k=>`<option value="${k}"${c.vatFlatRateSector===k?' selected':''}>${k} (${sales tax_FLAT_RATE[k]}%)</option>`).join('')}
 </select></div>
 <div class="field"><label>W-2 payroll reference</label><input id="i_paye" value="${esc(c.payeReference)}"></div>
 </div>
 <h3 style="margin-top:14px">Contact</h3>
 <div class="row"><div class="field"><label>Email</label><input id="i_email" value="${esc(c.email||'')}"></div><div class="field"><label>Phone</label><input id="i_phone" value="${esc(c.phone||'')}"></div></div>
 <div class="row"><div class="field"><label>Address line 1</label><input id="i_addr1" value="${esc(c.address.line1||'')}"></div><div class="field"><label>City</label><input id="i_city" value="${esc(c.address.city||'')}"></div></div>
 <div class="row r3"><div class="field"><label>Postcode</label><input id="i_pc" value="${esc(c.address.postcode||'')}"></div><div class="field"><label>Country</label><input id="i_country" value="${esc(c.address.country||'GB')}"></div><div class="field"><label>Adviser</label><select id="i_adv">${state.advisers.map(a=>`<option value="${a.id}"${c.adviserId===a.id?' selected':''}>${esc(a.name)}</option>`).join('')}</select></div></div>
 <h3 style="margin-top:14px">KYC / AML</h3>
 <div class="row r3">
 <div class="field"><label>Risk grade</label><select id="i_risk"><option value="low"${c.kyc.riskGrade==='low'?' selected':''}>low</option><option value="medium"${c.kyc.riskGrade==='medium'?' selected':''}>medium</option><option value="high"${c.kyc.riskGrade==='high'?' selected':''}>high</option></select></div>
 <div class="field"><label>KYC status</label><select id="i_kstatus"><option${c.kyc.status==='pending'?' selected':''}>pending</option><option${c.kyc.status==='verified'?' selected':''}>verified</option><option${c.kyc.status==='review'?' selected':''}>review</option><option${c.kyc.status==='failed'?' selected':''}>failed</option></select></div>
 <div class="field"><label>AML supervisor</label><select id="i_amlsup">${['IRS','AICPA','ACCA','CIMA','AAT','IFA','other'].map(s=>`<option${c.kyc.amlSupervisor===s?' selected':''}>${s}</option>`).join('')}</select></div>
 </div>
 <div class="field" style="margin-top:8px"><label>Nature & purpose of business</label><textarea id="i_nature" rows="2">${esc(c.kyc.natureAndPurposeOfBusiness||'')}</textarea></div>
 <div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveIdentity('${c.id}')">Save identity</button></div>
 </div>`;
}
async function saveIdentity(id){
 const c=state.clients.find(x=>x.id===id);if(!c)return;
 if(c.entityType==='sole-trader'){
 c.title=$('#i_title').value;c.firstName=$('#i_first').value;c.lastName=$('#i_last').value;
 c.dob=$('#i_dob').value;c.nino=$('#i_nino').value;c.utr=$('#i_utr').value;
 }else{
 c.entityName=$('#i_entity').value;c.tradingName=$('#i_trade').value;
 c.companiesHouseNo=$('#i_ch').value;c.ctUtr=$('#i_ctutr').value;c.vatNumber=$('#i_vat').value;
 }
 c.accountingPeriodStart=$('#i_ps').value;c.accountingPeriodEnd=$('#i_pe').value;c.yearEnd=$('#i_ye').value;
 c.vatScheme=$('#i_vs').value;c.vatFlatRateSector=$('#i_vfs').value;c.payeReference=$('#i_paye').value;
 c.email=$('#i_email').value;c.phone=$('#i_phone').value;
 c.address.line1=$('#i_addr1').value;c.address.city=$('#i_city').value;c.address.postcode=$('#i_pc').value;c.address.country=$('#i_country').value;
 c.adviserId=$('#i_adv').value;
 c.kyc.riskGrade=$('#i_risk').value;c.kyc.status=$('#i_kstatus').value;c.kyc.amlSupervisor=$('#i_amlsup').value;
 c.kyc.natureAndPurposeOfBusiness=$('#i_nature').value;
 await persistClient(c,'identity edited');
 await refreshDeadlines(c);
 toast('client saved');render();
}
function clientServices(c){
 const allSvc=['accounts','ct','vat','payroll','sa','tax-planning','bookkeeping','companies-house-filings'];
 return `<div class="card"><h3>Services engaged</h3>
 <div class="row r3">${allSvc.map(s=>`<label style="display:flex;gap:6px;align-items:center;padding:6px 0;cursor:pointer"><input type="checkbox" data-svc="${s}" ${(c.servicesEngaged||[]).includes(s)?'checked':''} onchange="toggleService('${c.id}','${s}',this.checked)"> ${s}</label>`).join('')}</div>
 <h3 style="margin-top:14px">Engagement</h3>
 <div class="row r3">
 <div class="field"><label>Type</label><select id="e_type">${['ongoing','one-off','transactional'].map(t=>`<option${c.engagement.type===t?' selected':''}>${t}</option>`).join('')}</select></div>
 <div class="field"><label>Fee basis</label><select id="e_basis">${['fixed-monthly','hourly','fixed-annual','per-job'].map(t=>`<option${c.engagement.feeBasis===t?' selected':''}>${t}</option>`).join('')}</select></div>
 <div class="field"><label>Fee amount $</label><input id="e_amt" type="number" value="${c.engagement.feeAmount||0}"></div>
 </div>
 <div class="actions"><button class="btn primary" onclick="saveEngagement('${c.id}')">Save engagement</button>${!c.engagement.letterOfEngagementSignedAt?'<button class="btn" onclick="signEngagement(\''+c.id+'\')">Generate &amp; mark signed</button>':''}</div>
 </div>`;
}
async function toggleService(id,svc,on){const c=state.clients.find(x=>x.id===id);if(!c)return;c.servicesEngaged=c.servicesEngaged||[];if(on){if(!c.servicesEngaged.includes(svc))c.servicesEngaged.push(svc)}else{c.servicesEngaged=c.servicesEngaged.filter(s=>s!==svc)}await persistClient(c,'service toggled '+svc+'='+on);await refreshDeadlines(c);renderSidebar()}
async function saveEngagement(id){const c=state.clients.find(x=>x.id===id);if(!c)return;c.engagement.type=$('#e_type').value;c.engagement.feeBasis=$('#e_basis').value;c.engagement.feeAmount=+$('#e_amt').value||0;await persistClient(c,'engagement saved');toast('saved')}
async function signEngagement(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const body='Engagement letter\n\n'+state.firm.name+'\n\n'+clientName(c)+'\n\nServices: '+(c.servicesEngaged||[]).join(', ')+'\nFee: $'+(c.engagement.feeAmount||0)+' '+c.engagement.feeFrequency+'\nSigned: '+isoDate(new Date());const h=await sha256(body);c.engagement.letterOfEngagementHash=h;c.engagement.letterOfEngagementSignedAt=now();await persistClient(c,'engagement letter signed');broadcast('engagement.signed',{clientId:c.id,firmId:state.firm.id,hash:h});downloadFile('engagement-'+c.id+'.txt',body);toast('engagement signed');renderClientSub()}
function clientTransactions(c){
 const txs=state.transactions.filter(t=>t.clientId===c.id).sort((a,b)=>a.date<b.date?1:-1);
 const balance=txs.reduce((s,t)=>s+(+t.amount||0),0);
 const accounts=flatChartOfAccounts();
 return `<div class="card"><h3>Bank balance · ${moneyP(balance)} <span class="meta">${txs.length} tx</span></h3>
 <div class="actions"><button class="btn primary sm" onclick="addBlankTx('${c.id}')">+ New tx</button>
 <button class="btn ghost sm" onclick="bulkClassify('${c.id}')">Auto-classify all</button>
 <button class="btn ghost sm" onclick="exportTxCSV('${c.id}')">Export CSV</button></div>
 <div class="tx-row head"><div>Date</div><div>Payee / description</div><div>Account</div><div class="r">Amount $</div><div>sales tax</div><div class="c">Rec.</div><div></div></div>
 ${txs.map(t=>`<div class="tx-row">
 <input type="date" value="${esc(t.date)}" onchange="editTx('${t.id}','date',this.value)">
 <input value="${esc(t.payee)}" onchange="editTx('${t.id}','payee',this.value)">
 <select onchange="editTx('${t.id}','accountCode',this.value)">${accounts.map(a=>`<option value="${a.code}"${t.accountCode===a.code?' selected':''}>${a.code} ${a.name}</option>`).join('')}</select>
 <input type="number" step="0.01" value="${t.amount}" onchange="editTx('${t.id}','amount',+this.value)" style="text-align:right">
 <select onchange="editTx('${t.id}','vatRate',+this.value)">
 <option value="0.20"${t.vatRate==0.20?' selected':''}>20%</option>
 <option value="0.05"${t.vatRate==0.05?' selected':''}>5%</option>
 <option value="0"${t.vatRate==0?' selected':''}>0%/exempt</option>
 </select>
 <input type="checkbox" ${t.reconciled?'checked':''} onchange="editTx('${t.id}','reconciled',this.checked)" style="margin:auto">
 <div class="x" onclick="delTx('${t.id}')">×</div>
 </div>`).join('')||'<div class="empty-state">No transactions. Click + New tx.</div>'}
 </div>`;
}
async function addBlankTx(clientId){
 const t={id:'tx_'+uid(),clientId,date:isoDate(new Date()),payee:'',accountCode:'6900',amount:0,vatRate:0.20,vatScheme:'standard',reconciled:false,createdAt:now()};
 state.transactions.push(t);await persistTx(t);await audit('tx.created','blank tx',{id:t.id,clientId});renderClientSub();
}
async function editTx(id,field,value){
 const t=state.transactions.find(x=>x.id===id);if(!t)return;
 t[field]=value;
 if(field==='payee'&&(!t.accountCode||t.accountCode==='6900'))t.accountCode=autoClassify(value);
 await persistTx(t);await audit('tx.updated',field,{id:t.id,field,value});
 if(field==='payee'||field==='accountCode')renderClientSub();
}
async function delTx(id){const t=state.transactions.find(x=>x.id===id);if(!t)return;state.transactions=state.transactions.filter(x=>x.id!==id);await idbDelete('transactions',id);await audit('tx.deleted','',{id});renderClientSub()}
async function bulkClassify(clientId){let n=0;for(const t of state.transactions.filter(x=>x.clientId===clientId)){const code=autoClassify(t.payee);if(t.accountCode!==code){t.accountCode=code;await persistTx(t);n++}}toast(n+' tx auto-classified');renderClientSub()}
function exportTxCSV(clientId){const txs=state.transactions.filter(t=>t.clientId===clientId);const head=['date','payee','accountCode','amount','vatRate','reconciled'];const rows=[head.join(','),...txs.map(t=>head.map(k=>JSON.stringify(t[k]==null?'':t[k])).join(','))];downloadFile('transactions-'+clientId+'.csv',rows.join('\n'),'text/csv')}
function clientSA(c){
 const isEligible=c.entityType==='sole-trader'||(c.servicesEngaged||[]).includes('sa');
 if(!isEligible)return '<div class="card"><div class="empty-state">SA module — enable "sa" service or set entity to sole-trader.</div></div>';
 const sa=computeSA(c);
 const sti=c.soleTraderIncome||{};
 return `<div class="card"><h3>Schedule C · ${sa.taxYear}</h3>
 <div class="row r3">
 <div class="field"><label>Turnover $</label><input id="sa_t" type="number" value="${sti.turnover||0}" onchange="setSTI('${c.id}','turnover',+this.value)"></div>
 <div class="field"><label>SE expenses $</label><input id="sa_e" type="number" value="${sti.expenses||0}" onchange="setSTI('${c.id}','expenses',+this.value)"></div>
 <div class="field"><label>Salary (W-2 payroll) $</label><input id="sa_s" type="number" value="${sti.salaryW-2 payroll||0}" onchange="setSTI('${c.id}','salaryW-2 payroll',+this.value)"></div>
 </div>
 <div class="row r3">
 <div class="field"><label>Dividends $</label><input id="sa_d" type="number" value="${sti.dividends||0}" onchange="setSTI('${c.id}','dividends',+this.value)"></div>
 <div class="field"><label>Savings interest $</label><input id="sa_sv" type="number" value="${sti.savings||0}" onchange="setSTI('${c.id}','savings',+this.value)"></div>
 <div class="field"><label>Other income $</label><input id="sa_o" type="number" value="${sti.otherIncome||0}" onchange="setSTI('${c.id}','otherIncome',+this.value)"></div>
 </div>
 <h3 style="margin-top:14px">Schedule C summary</h3>
 <div class="kpi"><span class="l">SE profit</span><span class="v">${moneyP(sa.seProfit)}</span></div>
 <div class="kpi"><span class="l">Total income</span><span class="v brass">${moneyP(sa.totalIncome)}</span></div>
 <div class="kpi"><span class="l">Personal allowance used</span><span class="v">${moneyP(sa.personalAllowance)}</span></div>
 <div class="kpi"><span class="l">Income tax</span><span class="v">${moneyP(sa.incomeTax)}</span></div>
 <div class="kpi"><span class="l">Dividend tax</span><span class="v">${moneyP(sa.dividendTax)}</span></div>
 <div class="kpi"><span class="l">Class 2 NI</span><span class="v">${moneyP(sa.class2NI)}</span></div>
 <div class="kpi"><span class="l">Class 4 NI</span><span class="v">${moneyP(sa.class4NI)}</span></div>
 <div class="kpi"><span class="l">Employee NI</span><span class="v">${moneyP(sa.employeeNI)}</span></div>
 <div class="kpi"><span class="l">Marginal rate</span><span class="v ${sa.marginalRate===0.6?'red':'amber'}">${pct(sa.marginalRate)}</span></div>
 <div class="kpi"><span class="l"><b>TOTAL DUE</b></span><span class="v brass"><b>${moneyP(sa.totalDue)}</b></span></div>
 <div class="actions"><button class="btn primary" onclick="recordSA('${c.id}')">Record SA computation</button>
 <button class="btn" onclick="downloadSA('${c.id}')">Export Schedule C summary</button></div>
 </div>`;
}
async function setSTI(id,field,value){const c=state.clients.find(x=>x.id===id);if(!c)return;c.soleTraderIncome=c.soleTraderIncome||{};c.soleTraderIncome[field]=value;await persistClient(c,'SA input '+field);renderClientSub()}
async function recordSA(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const sa=computeSA(c);const r={id:'sa_'+uid(),clientId:id,taxYear:sa.taxYear,summary:sa,status:'draft',createdAt:now()};state.saReturns.push(r);await persistSa(r);await audit('sa.computed',sa.taxYear,{id:r.id,clientId:id,totalDue:sa.totalDue});broadcast('submission.recorded',{kind:'SA',clientId:id,returnId:r.id});toast('SA recorded')}
function downloadSA(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const sa=computeSA(c);downloadFile('Schedule C-'+id+'-'+sa.taxYear+'.json',JSON.stringify(sa,null,2),'application/json')}
function clientCT(c){
 if(c.entityType!=='limited-company')return '<div class="card"><div class="empty-state">CT module — only applicable to limited companies.</div></div>';
 const txs=state.transactions.filter(t=>t.clientId===c.id&&t.date>=c.accountingPeriodStart&&t.date<=c.accountingPeriodEnd);
 let income=0,expenses=0;
 for(const t of txs){const a=findAccount(t.accountCode);if(!a)continue;if(a.section==='income')income+=Math.abs(+t.amount||0);if(a.section==='expenses'||a.section==='costOfSales')expenses+=Math.abs(+t.amount||0)}
 const profit=income-expenses;
 const ct=computeCT(profit);
 return `<div class="card"><h3>Form 1120 · period ${fmtDate(c.accountingPeriodStart)} → ${fmtDate(c.accountingPeriodEnd)}</h3>
 <div class="kpi"><span class="l">Turnover</span><span class="v">${moneyP(income)}</span></div>
 <div class="kpi"><span class="l">Expenses</span><span class="v">${moneyP(expenses)}</span></div>
 <div class="kpi"><span class="l">Taxable profit</span><span class="v brass">${moneyP(profit)}</span></div>
 <div class="kpi"><span class="l">Note</span><span class="v">${ct.note}</span></div>
 <div class="kpi"><span class="l">Marginal relief</span><span class="v">${moneyP(ct.reliefAmount)}</span></div>
 <div class="kpi"><span class="l"><b>CT due</b></span><span class="v brass"><b>${moneyP(ct.tax)}</b></span></div>
 <div class="kpi"><span class="l">Effective rate</span><span class="v amber">${pct(ct.effectiveRate)}</span></div>
 <h3 style="margin-top:14px">R&amp;D claim (optional)</h3>
 <div class="row"><div class="field"><label>Qualifying R&amp;D spend $</label><input id="rd_qual" type="number" value="0"></div>
 <div class="field"><label>Scheme</label><select id="rd_sch"><option value="rdec">Merged RDEC (20%)</option><option value="eris">ERIS (R&amp;D intensive)</option></select></div></div>
 <button class="btn sm" onclick="computeRDClaim('${c.id}')">Compute R&amp;D credit</button>
 <div id="rdResult" style="margin-top:8px;font-family:var(--mono);font-size:12px;color:var(--brass)"></div>
 <div class="actions" style="margin-top:14px"><button class="btn primary" onclick="recordCT('${c.id}')">Record CT computation</button>
 <button class="btn" onclick="downloadCT('${c.id}')">Export Form 1120 summary</button></div>
 </div>`;
}
function computeRDClaim(id){const q=+$('#rd_qual').value||0;const intensive=$('#rd_sch').value==='eris';const r=computeRD(q,{intensiveLoss:intensive});$('#rdResult').textContent=r.scheme+' · qualifying '+moneyP(r.qualifyingExpenditure)+(r.netCredit?' → net credit '+moneyP(r.netCredit):'')+(r.credit?' → credit '+moneyP(r.credit):'')}
async function recordCT(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const txs=state.transactions.filter(t=>t.clientId===id&&t.date>=c.accountingPeriodStart&&t.date<=c.accountingPeriodEnd);let income=0,expenses=0;for(const t of txs){const a=findAccount(t.accountCode);if(!a)continue;if(a.section==='income')income+=Math.abs(+t.amount||0);if(a.section==='expenses'||a.section==='costOfSales')expenses+=Math.abs(+t.amount||0)}const ct=computeCT(income-expenses);const r={id:'ct_'+uid(),clientId:id,periodStart:c.accountingPeriodStart,periodEnd:c.accountingPeriodEnd,summary:{income,expenses,...ct},status:'draft',createdAt:now()};state.ctReturns.push(r);await persistCt(r);await audit('ct.computed','',{id:r.id,clientId:id,tax:ct.tax});broadcast('submission.recorded',{kind:'CT',clientId:id,returnId:r.id});toast('CT recorded')}
function downloadCT(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const txs=state.transactions.filter(t=>t.clientId===id&&t.date>=c.accountingPeriodStart&&t.date<=c.accountingPeriodEnd);let income=0,expenses=0;for(const t of txs){const a=findAccount(t.accountCode);if(!a)continue;if(a.section==='income')income+=Math.abs(+t.amount||0);if(a.section==='expenses'||a.section==='costOfSales')expenses+=Math.abs(+t.amount||0)}const ct=computeCT(income-expenses);downloadFile('Form 1120-'+id+'.json',JSON.stringify({clientId:id,period:[c.accountingPeriodStart,c.accountingPeriodEnd],income,expenses,...ct},null,2),'application/json')}
function clientsales tax(c){
 if(!c.vatScheme||c.vatScheme==='none')return '<div class="card"><div class="empty-state">sales tax module — set a sales tax scheme on the Identity tab.</div></div>';
 const dls=(c.deadlines||[]).filter(d=>d.kind==='sales tax100').slice(0,4);
 return `<div class="card"><h3>sales tax · ${c.vatScheme} · ${esc(c.vatNumber||'no VRN')}</h3>
 ${dls.length?'<table><thead><tr><th>Period</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>'+dls.map(d=>`<tr><td>${esc(d.periodStart||'')} → ${esc(d.periodEnd||'')}</td><td>${fmtDate(d.dueAt)}</td><td>${d.status||deadlineStatus(d)}</td><td><button class="btn sm" onclick="computesales taxPeriod('${c.id}','${d.periodStart||''}','${d.periodEnd||''}')">Compute</button></td></tr>`).join('')+'</tbody></table>':'<div class="empty-state">No sales tax periods. Click "Refresh deadlines" on the client header.</div>'}
 <div id="vatResult" style="margin-top:14px"></div>
 </div>`;
}
function computesales taxPeriod(id,ps,pe){
 const c=state.clients.find(x=>x.id===id);if(!c)return;
 if(!ps||!pe){toast('No period set');return}
 const v=computesales tax(c,ps,pe);
 const mtd=vatReturn1099-K(v,c.vatNumber);
 $('#vatResult').innerHTML=`<div class="card"><h3>sales tax100 result · ${ps} → ${pe}</h3>
 ${[1,2,3,4,5,6,7,8,9].map(b=>`<div class="kpi"><span class="l">Box ${b}</span><span class="v ${b===5?'brass':''}">${moneyP(v.boxes[b])}</span></div>`).join('')}
 <div class="actions"><button class="btn primary sm" onclick='recordsales tax(${JSON.stringify(v).replace(/'/g,"&apos;")})'>Record return</button>
 <button class="btn sm" onclick='downloadsales tax(${JSON.stringify({return:v,mtd}).replace(/'/g,"&apos;")})'>Export 1099-K JSON</button></div>
 </div>`;
}
async function recordsales tax(v){const r=Object.assign({id:'vat_'+uid(),status:'draft',createdAt:now()},v);state.vatReturns.push(r);await persistVat(r);await audit('vat.computed',v.periodStart+'→'+v.periodEnd,{id:r.id,clientId:v.clientId});broadcast('submission.recorded',{kind:'sales tax',clientId:v.clientId,returnId:r.id});toast('sales tax return recorded')}
function downloadsales tax(o){downloadFile('sales tax100-'+o.return.clientId+'-'+o.return.periodEnd+'.json',JSON.stringify(o,null,2),'application/json')}
function clientPayroll(c){
 if(!(c.servicesEngaged||[]).includes('payroll'))return '<div class="card"><div class="empty-state">Payroll — enable "payroll" service on the Services tab.</div></div>';
 const employees=c.employees||[];
 return `<div class="card"><h3>Employees · ${employees.length}</h3>
 <div class="emp-row head"><div>Name</div><div>NINO</div><div>Tax code</div><div>Annual $</div><div>Pension %</div><div></div></div>
 ${employees.map(e=>`<div class="emp-row">
 <input value="${esc(e.name)}" onchange="editEmp('${c.id}','${e.id}','name',this.value)">
 <input value="${esc(e.nino||'')}" onchange="editEmp('${c.id}','${e.id}','nino',this.value)">
 <input value="${esc(e.taxCode||'1257L')}" onchange="editEmp('${c.id}','${e.id}','taxCode',this.value)">
 <input type="number" value="${e.annualSalary||0}" onchange="editEmp('${c.id}','${e.id}','annualSalary',+this.value)">
 <input type="number" step="0.01" value="${e.pensionPct||0}" onchange="editEmp('${c.id}','${e.id}','pensionPct',+this.value)">
 <div class="x" onclick="delEmp('${c.id}','${e.id}')">×</div>
 </div>`).join('')||'<div class="empty-state">No employees</div>'}
 <div class="actions" style="margin-top:8px"><button class="btn primary sm" onclick="addEmp('${c.id}')">+ Employee</button>
 <button class="btn sm" onclick="runPayrollNow('${c.id}')">Run payroll · this month</button>
 <button class="btn sm" onclick="genP60All('${c.id}')">Generate P60s · ${TAX_YEAR}</button></div>
 <div id="payrollResult" style="margin-top:14px"></div>
 <h3 style="margin-top:14px">Recent runs</h3>
 ${state.payrollRuns.filter(r=>r.clientId===c.id).slice(-5).reverse().map(r=>`<div class="kpi"><span class="l">${esc(r.periodStart)} → ${esc(r.periodEnd)}</span><span class="v">gross ${moneyP(r.totals.gross)} · P32 ${moneyP(r.totals.p32Liability||0)}</span></div>`).join('')||'<div class="empty-state">No runs yet</div>'}
 </div>`;
}
async function addEmp(id){const c=state.clients.find(x=>x.id===id);if(!c)return;c.employees=c.employees||[];c.employees.push({id:'em_'+uid(),name:'',nino:'',taxCode:'1257L',annualSalary:30000,pensionPct:0.05,studentLoan:false});await persistClient(c,'employee added');renderClientSub()}
async function editEmp(cid,eid,field,value){const c=state.clients.find(x=>x.id===cid);if(!c)return;const e=(c.employees||[]).find(x=>x.id===eid);if(!e)return;e[field]=value;await persistClient(c,'emp edit '+field)}
async function delEmp(cid,eid){const c=state.clients.find(x=>x.id===cid);if(!c)return;c.employees=(c.employees||[]).filter(e=>e.id!==eid);await persistClient(c,'emp deleted');renderClientSub()}
async function runPayrollNow(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const today=new Date();const ps=isoDate(new Date(today.getFullYear(),today.getMonth(),1));const pe=isoDate(new Date(today.getFullYear(),today.getMonth()+1,0));const run=computePayrollPeriod(c,ps,pe);run.status='draft';state.payrollRuns.push(run);await persistPayroll(run);await audit('payroll.run',ps+'→'+pe,{id:run.id,clientId:id,gross:run.totals.gross});broadcast('submission.recorded',{kind:'FPS',clientId:id,runId:run.id,fpsRef:run.fpsRef});$('#payrollResult').innerHTML=`<div class="card"><h3>Payroll run · ${ps} → ${pe} <span class="meta">${run.fpsRef}</span></h3><table><thead><tr><th>Employee</th><th class="r">Gross</th><th class="r">W-2 payroll</th><th class="r">NI ee</th><th class="r">NI er</th><th class="r">Pension</th><th class="r">Net</th></tr></thead><tbody>${run.employees.map(e=>`<tr><td>${esc(e.name)}</td><td class="r">${moneyP(e.gross)}</td><td class="r">${moneyP(e.paye)}</td><td class="r">${moneyP(e.niEe)}</td><td class="r">${moneyP(e.niEr)}</td><td class="r">${moneyP(e.pension)}</td><td class="r">${moneyP(e.net)}</td></tr>`).join('')}<tr class="total"><td>Totals</td><td class="r">${moneyP(run.totals.gross)}</td><td class="r">${moneyP(run.totals.paye)}</td><td class="r">${moneyP(run.totals.niEe)}</td><td class="r">${moneyP(run.totals.niEr)}</td><td class="r">${moneyP(run.totals.pension)}</td><td class="r">${moneyP(run.totals.net)}</td></tr></tbody></table><div class="actions"><button class="btn sm" onclick='downloadFile("FPS-${run.id}.json",JSON.stringify(${JSON.stringify(run).replace(/'/g,"&apos;")},null,2),"application/json")'>Export FPS JSON</button></div></div>`;toast('payroll run recorded')}
function genP60All(id){const c=state.clients.find(x=>x.id===id);if(!c)return;const all=(c.employees||[]).map(e=>generateP60(c,e.id,TAX_YEAR));downloadFile('P60-'+id+'-'+TAX_YEAR+'.json',JSON.stringify(all,null,2),'application/json');toast(all.length+' P60s generated')}
function clientDeadlines(c){
 const ds=c.deadlines||[];
 return `<div class="card"><h3>Deadlines · ${ds.length}</h3>
 <div class="actions"><button class="btn sm" onclick="refreshDeadlinesNow()">↻ Refresh from rules</button></div>
 <table><thead><tr><th>Kind</th><th>Label</th><th>Due</th><th>Status</th><th>Submitted</th><th>Ref</th><th></th></tr></thead><tbody>
 ${ds.map(d=>`<tr class="${deadlineStatus(d)==='overdue'?'overdue':deadlineStatus(d)==='soon'?'soon':''}"><td>${d.kind}</td><td>${esc(d.label)}</td><td>${fmtDate(d.dueAt)}</td><td>${deadlineStatus(d)}</td><td>${d.submittedAt?fmtDate(d.submittedAt):'—'}</td><td>${esc(d.submissionRef||'')}</td><td>${d.status==='submitted'?'<button class="btn ghost sm" onclick="undoSubmit(\''+d.id+'\')">undo</button>':'<button class="btn sm" onclick="markSubmitted(\''+d.id+'\')">submit</button>'}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--cream-muted)">No deadlines</td></tr>'}
 </tbody></table>
 </div>`;
}
async function refreshDeadlinesNow(){const c=currentClient();if(!c)return;await refreshDeadlines(c);broadcast('deadline.regenerated',{clientId:c.id,count:c.deadlines.length});toast(c.deadlines.length+' deadlines');render()}
async function markSubmitted(did){const c=currentClient();if(!c)return;const d=(c.deadlines||[]).find(x=>x.id===did);if(!d)return;const ref=prompt('Submission reference (IRS receipt / CH ref):','REF-'+isoDate(new Date()).replace(/-/g,''));if(ref===null)return;d.status='submitted';d.submittedAt=now();d.submissionRef=ref;await persistClient(c,'deadline submitted '+d.kind);await audit('deadline.submitted',d.kind,{deadlineId:d.id,clientId:c.id,ref});broadcast('deadline.markedDone',{clientId:c.id,deadlineId:d.id,kind:d.kind,ref});render()}
async function undoSubmit(did){const c=currentClient();if(!c)return;const d=(c.deadlines||[]).find(x=>x.id===did);if(!d)return;d.status='pending';d.submittedAt=null;d.submissionRef='';await persistClient(c,'undo submit');render()}
function clientDocuments(c){const docs=(c.kyc.documentsHeld||[]);return `<div class="card"><h3>Documents · ${docs.length}</h3><div class="empty-state">${docs.length?docs.map(d=>'<div class="kpi"><span class="l">'+esc(d.type)+'</span><span class="v">'+fmtDate(d.capturedAt)+'</span></div>').join(''):'Document store — paired with fallbooks-usonboard for KYC capture. Records appear here when the onboard sibling broadcasts via fall-books mesh.'}</div></div>`}
function clientTime(c){return `<div class="card"><h3>Time &amp; fees</h3><div class="empty-state">Time tracking lives in fallbooks-uspractice. Current engagement: ${c.engagement.feeBasis} · $${c.engagement.feeAmount||0} ${c.engagement.feeFrequency||''}</div></div>`}
function clientHistory(c){const entries=state.audit.filter(a=>a.clientId===c.id).slice(-30).reverse();return `<div class="card"><h3>History · ${entries.length} entries (last 30)</h3><table><thead><tr><th>When</th><th>Action</th><th>Reason</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${new Date(e.ts).toLocaleString('en-GB')}</td><td>${esc(e.action)}</td><td>${esc(e.reasoning)}</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:var(--cream-muted)">No history</td></tr>'}</tbody></table></div>`}
// ── Deadlines master grid ──
function renderDeadlines(m){
 const all=allDeadlines();
 const overdue=all.filter(d=>deadlineStatus(d)==='overdue').length;
 const soon=all.filter(d=>deadlineStatus(d)==='soon').length;
 m.innerHTML+=`<div class="section-h"><div><h2>All deadlines · master grid</h2><div class="sub">${all.length} across all clients</div></div>
 <div class="actions"><button class="btn ghost" onclick="refreshAllDeadlines()">↻ Refresh all</button><button class="btn ghost" onclick="exportDeadlinesCSV()">Export CSV</button></div></div>
 <div class="deadline-summary">
 <div class="ds"><div class="v ${overdue?'red':'green'}">${overdue}</div><div class="l">overdue</div></div>
 <div class="ds"><div class="v ${soon?'amber':''}">${soon}</div><div class="l">soon (≤30d)</div></div>
 <div class="ds"><div class="v">${all.filter(d=>d.status==='submitted').length}</div><div class="l">submitted</div></div>
 <div class="ds"><div class="v">${all.length}</div><div class="l">total</div></div>
 </div>
 <div class="card"><table><thead><tr><th>Due</th><th>Client</th><th>Kind</th><th>Label</th><th>Status</th><th>Days</th></tr></thead><tbody>
 ${all.map(d=>{const st=deadlineStatus(d);const days=daysBetween(isoDate(new Date()),d.dueAt);return `<tr class="clickable ${st==='overdue'?'overdue':st==='soon'?'soon':''}" onclick="setCurrentClient('${d.client.id}');state.currentSubtab='deadlines';setActive('clients')"><td>${fmtDate(d.dueAt)}</td><td>${esc(clientShort(d.client))}</td><td><span class="tag ${st==='overdue'?'red':st==='soon'?'amber':st==='done'?'green':''}">${d.kind}</span></td><td>${esc(d.label)}</td><td>${st}</td><td class="r">${days}</td></tr>`}).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--cream-muted)">No deadlines · add a client</td></tr>'}
 </tbody></table></div>`;
}
async function refreshAllDeadlines(){let n=0;for(const c of state.clients){if(c.archivedAt)continue;c.deadlines=generateDeadlinesForClient(c);await idbPut('clients',c);n++}toast(n+' clients refreshed');render()}
function exportDeadlinesCSV(){const all=allDeadlines();const rows=['due,client,kind,label,status'];for(const d of all)rows.push([d.dueAt,JSON.stringify(clientShort(d.client)),d.kind,JSON.stringify(d.label),d.status||deadlineStatus(d)].join(','));downloadFile('deadlines-all.csv',rows.join('\n'),'text/csv')}
// ── Books overview (cross-client bookkeeping) ──
function renderBooks(m){
 const c=currentClient();
 if(!c){m.innerHTML+=`<div class="section-h"><h2>Books</h2></div><div class="card"><div class="empty-state">Pick a client from the sidebar to view transactions.</div></div>`;return}
 state.currentSubtab='transactions';renderClients(m);
}
// ── sales tax master ──
function rendersales tax(m){
 const vatClients=state.clients.filter(c=>!c.archivedAt&&c.vatScheme&&c.vatScheme!=='none');
 m.innerHTML+=`<div class="section-h"><h2>sales tax · ${vatClients.length} registered clients</h2></div>
 <div class="card"><table><thead><tr><th>Client</th><th>VRN</th><th>Scheme</th><th>Next return due</th></tr></thead><tbody>
 ${vatClients.map(c=>{const next=(c.deadlines||[]).filter(d=>d.kind==='sales tax100'&&d.status!=='submitted')[0];return `<tr class="clickable" onclick="setCurrentClient('${c.id}');state.currentSubtab='vat';setActive('clients')"><td>${esc(clientShort(c))}</td><td>${esc(c.vatNumber||'—')}</td><td>${c.vatScheme}${c.vatFlatRateSector?' · '+c.vatFlatRateSector:''}</td><td>${next?fmtDate(next.dueAt):'—'}</td></tr>`}).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--cream-muted)">No sales tax-registered clients</td></tr>'}
 </tbody></table></div>`;
}
// ── SA master ──
function renderSA(m){
 const saClients=state.clients.filter(c=>!c.archivedAt&&(c.entityType==='sole-trader'||(c.servicesEngaged||[]).includes('sa')));
 m.innerHTML+=`<div class="section-h"><h2>SA · ${saClients.length} clients</h2></div>
 <div class="card"><table><thead><tr><th>Client</th><th>UTR</th><th>Total due (est)</th><th>Next Schedule C</th></tr></thead><tbody>
 ${saClients.map(c=>{const sa=computeSA(c);const next=(c.deadlines||[]).filter(d=>d.kind==='Schedule C')[0];return `<tr class="clickable" onclick="setCurrentClient('${c.id}');state.currentSubtab='sa';setActive('clients')"><td>${esc(clientShort(c))}</td><td>${esc(c.utr||'—')}</td><td class="r">${moneyP(sa.totalDue)}</td><td>${next?fmtDate(next.dueAt):'—'}</td></tr>`}).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--cream-muted)">No SA clients</td></tr>'}
 </tbody></table></div>`;
}
// ── CT master ──
function renderCT(m){
 const ctClients=state.clients.filter(c=>!c.archivedAt&&c.entityType==='limited-company');
 m.innerHTML+=`<div class="section-h"><h2>CT · ${ctClients.length} limited companies</h2></div>
 <div class="card"><table><thead><tr><th>Client</th><th>CT UTR</th><th>Period end</th><th>Next Form 1120</th></tr></thead><tbody>
 ${ctClients.map(c=>{const next=(c.deadlines||[]).filter(d=>d.kind==='Form 1120')[0];return `<tr class="clickable" onclick="setCurrentClient('${c.id}');state.currentSubtab='ct';setActive('clients')"><td>${esc(clientShort(c))}</td><td>${esc(c.ctUtr||'—')}</td><td>${fmtDate(c.accountingPeriodEnd)}</td><td>${next?fmtDate(next.dueAt):'—'}</td></tr>`}).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--cream-muted)">No Ltd clients</td></tr>'}
 </tbody></table></div>`;
}
// ── Payroll master ──
function renderPayroll(m){
 const prClients=state.clients.filter(c=>!c.archivedAt&&(c.servicesEngaged||[]).includes('payroll'));
 m.innerHTML+=`<div class="section-h"><h2>Payroll · ${prClients.length} clients</h2></div>
 <div class="card"><table><thead><tr><th>Client</th><th>W-2 payroll ref</th><th>Employees</th><th>Last run</th></tr></thead><tbody>
 ${prClients.map(c=>{const last=state.payrollRuns.filter(r=>r.clientId===c.id).slice(-1)[0];return `<tr class="clickable" onclick="setCurrentClient('${c.id}');state.currentSubtab='payroll';setActive('clients')"><td>${esc(clientShort(c))}</td><td>${esc(c.payeReference||'—')}</td><td class="r">${(c.employees||[]).length}</td><td>${last?fmtDate(last.periodEnd):'—'}</td></tr>`}).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--cream-muted)">No payroll clients</td></tr>'}
 </tbody></table></div>`;
}
// ── Q&A ──
function renderQA(m){
 m.innerHTML+=`<div class="section-h"><h2>T0 · US accountancy Q&amp;A</h2><div class="sub">14 deterministic rules · T3 BYOK optional</div></div>
 <div class="card">
 <div class="chat" id="chat">${state.chat.map(c=>`<div class="msg ${c.role}">${c.role==='bot'?esc(c.text)+(c.src?'<div class="src">'+esc(c.src)+'</div>':''):esc(c.text)}</div>`).join('')||'<div class="empty-state">Ask anything: "When is Schedule C due?", "Form 1120 deadline?", "sales tax 1099-K compliance?", "R&D SME post-2024?", "Marginal relief CT?", "Director\'s loan tax?"</div>'}</div>
 <div class="chat-input"><input id="qaInput" placeholder="ask · e.g. when is Form 1120 due?" onkeydown="if(event.key==='Enter')doQA()"><button class="btn primary" onclick="doQA()">Ask</button>
 <select id="qaMode"><option value="t0">T0 only</option><option value="anthropic">T3 Claude</option><option value="openai">T3 OpenAI</option><option value="gemini">T3 Gemini</option></select></div>
 </div>`;
}
async function doQA(){
 const q=$('#qaInput').value.trim();if(!q)return;
 state.chat.push({role:'user',text:q});$('#qaInput').value='';renderQA($('#main'));
 const mode=$('#qaMode').value;
 let res;
 if(mode==='t0'){res=answerT0(q);if(!res.found){res={answer:res.answer,source:'T0·no match'}}}
 else{res=await askT3(q,mode)}
 state.chat.push({role:'bot',text:res.answer||res.found,src:res.source||'T0'});
 await audit('qa.asked',q.slice(0,80),{mode,source:res.source});
 renderQA($('#main'));
 setTimeout(()=>{const ch=$('#chat');if(ch)ch.scrollTop=ch.scrollHeight},50);
}
function openQA(){state.active='qa';render()}
// ── Practice ──
function renderPractice(m){
 m.innerHTML+=`<div class="section-h"><h2>Practice</h2><div class="sub">${state.advisers.length} advisers · ${state.audit.length} audit entries</h2></div>
 <div class="grid">
 <div class="card"><h3>Firm</h3>
 <div class="kpi"><span class="l">Name</span><span class="v">${esc(state.firm.name)}</span></div>
 <div class="kpi"><span class="l">Practice type</span><span class="v">${state.firm.practiceType}</span></div>
 <div class="kpi"><span class="l">Professional body</span><span class="v">${state.firm.professionalBody}</span></div>
 <div class="kpi"><span class="l">Practice cert</span><span class="v">${esc(state.firm.practiceCertNo||'—')}</span></div>
 <div class="kpi"><span class="l">AML supervisor</span><span class="v">${state.firm.amlSupervisor}</span></div>
 <div class="kpi"><span class="l">IRS agent ref</span><span class="v">${esc(state.firm.hmrcAgentRef||'—')}</span></div>
 <div class="kpi"><span class="l">PI insurer</span><span class="v">${esc(state.firm.piInsurer||'—')}</span></div>
 <div class="kpi"><span class="l">PI expires</span><span class="v ${state.firm.piExpiresAt&&new Date(state.firm.piExpiresAt)<new Date()?'red':''}">${state.firm.piExpiresAt?fmtDate(state.firm.piExpiresAt):'—'}</span></div>
 <div class="actions"><button class="btn sm" onclick="openFirmEdit()">Edit firm</button></div>
 </div>
 <div class="card"><h3>Advisers · ${state.advisers.length}</h3>
 ${state.advisers.map(a=>`<div class="kpi"><span class="l">${esc(a.name)} <span class="tag dim">${a.professionalBody}</span></span><span class="v">${a.cpdHoursThisYear||0}h CPD</span></div>`).join('')||'<div class="empty-state">No advisers</div>'}
 <div class="actions"><button class="btn sm" onclick="addAdviserFlow()">+ Adviser</button></div>
 </div>
 <div class="card"><h3>Audit chain</h3>
 <div class="kpi"><span class="l">Entries</span><span class="v">${state.audit.length}</span></div>
 <div class="kpi"><span class="l">Latest</span><span class="v">${state.audit.length?new Date(state.audit[state.audit.length-1].ts).toLocaleString('en-GB'):'—'}</span></div>
 <div class="kpi"><span class="l">Retained</span><span class="v">6yr IRS · 7yr AICPA</span></div>
 <div class="actions"><button class="btn sm" onclick="exportAudit()">Export audit JSON</button></div>
 </div>
 </div>`;
}
// ── modals & flows ──
function openModal(html){$('#modal').innerHTML=html;$('#modalBg').classList.add('open')}
function closeModal(){$('#modalBg').classList.remove('open')}
function openClientPicker(){
 openModal(`<h2>Switch client</h2>${state.clients.filter(c=>!c.archivedAt).map(c=>`<div class="kpi clickable" onclick="setCurrentClient('${c.id}');closeModal()" style="cursor:pointer;padding:8px 0"><span class="l">${esc(clientName(c))}</span><span class="v">${c.entityType}</span></div>`).join('')}<div class="actions"><button class="btn" onclick="closeModal()">Close</button></div>`);
}
function addClientFlow(){
 openModal(`<h2>New client</h2>
 <div class="field"><label>Entity type</label><select id="nc_type">
 <option value="limited-company">Limited company</option>
 <option value="sole-trader">Sole trader</option>
 <option value="partnership">Partnership</option>
 <option value="llp">LLP</option>
 <option value="charity">Charity</option>
 <option value="trust">Trust</option>
 </select></div>
 <div class="field" style="margin-top:8px"><label>Name / entity name</label><input id="nc_name"></div>
 <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createClient()">Create</button></div>`);
 setTimeout(()=>$('#nc_name')&&$('#nc_name').focus(),50);
}
async function createClient(){
 const type=$('#nc_type').value;const name=$('#nc_name').value.trim();
 const c=newBlankClient(type);
 if(type==='sole-trader'){const parts=name.split(' ');c.firstName=parts[0]||'';c.lastName=parts.slice(1).join(' ')||''}
 else{c.entityName=name||'New '+type}
 state.clients.push(c);await persistClient(c,'client created');c.deadlines=generateDeadlinesForClient(c);await persistClient(c,'initial deadlines');broadcast('client.created',c);
 state.currentClientId=c.id;await saveUI();
 closeModal();state.active='clients';state.currentSubtab='identity';render();toast('client created');
}
async function archiveClient(){
 const c=currentClient();if(!c)return;if(!confirm('Archive '+clientName(c)+'?'))return;
 c.archivedAt=now();await persistClient(c,'archived');state.currentClientId=null;await saveUI();broadcast('client.archived',c);render();toast('archived')
}
function openSettings(){
 openModal(`<h2>Settings</h2>
 <div class="field"><label>Audit chain</label><select id="set_audit"><option value="true"${state.settings.auditChain?' selected':''}>on</option><option value="false"${!state.settings.auditChain?' selected':''}>off</option></select></div>
 <div class="field" style="margin-top:8px"><label>Current adviser</label><select id="set_adv">${state.advisers.map(a=>`<option value="${a.id}"${state.settings.currentAdviserId===a.id?' selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
 <h3 style="font-family:var(--serif);margin-top:14px;font-size:14px;color:var(--brass)">T3 BYOK keys (stored locally only)</h3>
 <div class="field"><label>Anthropic key</label><input id="set_a" type="password" value="${esc(state.settings.anthropicKey||'')}"></div>
 <div class="field" style="margin-top:6px"><label>OpenAI key</label><input id="set_o" type="password" value="${esc(state.settings.openaiKey||'')}"></div>
 <div class="field" style="margin-top:6px"><label>Gemini key</label><input id="set_g" type="password" value="${esc(state.settings.geminiKey||'')}"></div>
 <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSettingsFromModal()">Save</button></div>`);
}
async function saveSettingsFromModal(){
 state.settings.auditChain=$('#set_audit').value==='true';
 state.settings.currentAdviserId=$('#set_adv').value;
 state.settings.anthropicKey=$('#set_a').value;state.settings.openaiKey=$('#set_o').value;state.settings.geminiKey=$('#set_g').value;
 await saveSettings();closeModal();toast('settings saved');render();
}
function openFirmEdit(){
 const f=state.firm;
 openModal(`<h2>Edit firm</h2>
 <div class="row"><div class="field"><label>Firm name</label><input id="ef_name" value="${esc(f.name)}"></div><div class="field"><label>Practice type</label><select id="ef_type">${['sole-practitioner','partnership','llp','limited-company'].map(t=>`<option${f.practiceType===t?' selected':''}>${t}</option>`).join('')}</select></div></div>
 <div class="row r3"><div class="field"><label>Professional body</label><select id="ef_pb">${['AICPA','ACCA','CIMA','AAT','CIOT','ATT','IFA','other'].map(t=>`<option${f.professionalBody===t?' selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Practice cert no</label><input id="ef_pc" value="${esc(f.practiceCertNo||'')}"></div><div class="field"><label>IRS agent ref</label><input id="ef_hmrc" value="${esc(f.hmrcAgentRef||'')}"></div></div>
 <div class="row r3"><div class="field"><label>AML supervisor</label><select id="ef_aml">${['IRS','AICPA','ACCA','CIMA','AAT','CIOT','IFA','other'].map(t=>`<option${f.amlSupervisor===t?' selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>AML ref</label><input id="ef_amlref" value="${esc(f.amlSupervisorRef||'')}"></div><div class="field"><label>CQBE / PCB status</label><input id="ef_cq" value="${esc(f.cqbeStatus||'')}"></div></div>
 <div class="row r3"><div class="field"><label>PI insurer</label><input id="ef_pi" value="${esc(f.piInsurer||'')}"></div><div class="field"><label>PI policy</label><input id="ef_pip" value="${esc(f.piPolicyNo||'')}"></div><div class="field"><label>PI expires</label><input id="ef_pie" type="date" value="${f.piExpiresAt?isoDate(f.piExpiresAt):''}"></div></div>
 <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveFirmFromModal()">Save</button></div>`);
}
async function saveFirmFromModal(){
 const f=state.firm;
 f.name=$('#ef_name').value;f.practiceType=$('#ef_type').value;
 f.professionalBody=$('#ef_pb').value;f.practiceCertNo=$('#ef_pc').value;f.hmrcAgentRef=$('#ef_hmrc').value;
 f.amlSupervisor=$('#ef_aml').value;f.amlSupervisorRef=$('#ef_amlref').value;f.cqbeStatus=$('#ef_cq').value;
 f.piInsurer=$('#ef_pi').value;f.piPolicyNo=$('#ef_pip').value;f.piExpiresAt=$('#ef_pie').value||null;
 await persistFirm('firm edited');closeModal();toast('firm saved');render();
}
function addAdviserFlow(){
 openModal(`<h2>+ Adviser</h2>
 <div class="row"><div class="field"><label>Name</label><input id="na_name"></div><div class="field"><label>Email</label><input id="na_email"></div></div>
 <div class="row r3"><div class="field"><label>Professional body</label><select id="na_pb">${['AICPA','ACCA','CIMA','AAT','CIOT','ATT','IFA','other'].map(t=>`<option>${t}</option>`).join('')}</select></div><div class="field"><label>Membership no</label><input id="na_mn"></div><div class="field"><label>CPD hours</label><input id="na_cpd" type="number" value="0"></div></div>
 <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createAdviser()">Create</button></div>`);
}
async function createAdviser(){
 const a=newBlankAdviser($('#na_name').value);
 a.email=$('#na_email').value;a.professionalBody=$('#na_pb').value;a.membershipNo=$('#na_mn').value;a.cpdHoursThisYear=+$('#na_cpd').value||0;
 state.advisers.push(a);await persistAdviser(a,'adviser created');broadcast('adviser.created',a);closeModal();toast('adviser added');render();
}
function exportAudit(){downloadFile('fallbooks-us-audit-'+isoDate(new Date())+'.json',JSON.stringify({schema:'fallbooks-us-audit@1',firmId:state.firm&&state.firm.id,exportedAt:new Date().toISOString(),entries:state.audit},null,2),'application/json');toast('audit exported')}
function exportAll(){const snap={schema:'fallbooks-us-export@1',toolVersion:VERSION,exportedAt:new Date().toISOString(),firm:state.firm,advisers:state.advisers,clients:state.clients,transactions:state.transactions,vatReturns:state.vatReturns,saReturns:state.saReturns,ctReturns:state.ctReturns,payrollRuns:state.payrollRuns,audit:state.audit};downloadFile('fallbooks-us-export-'+isoDate(new Date())+'.json',JSON.stringify(snap,null,2),'application/json');toast('full export saved')}
// ── ONBOARDING (first launch) ──
function renderOnboarding(){
 const root=$('#layout');
 root.innerHTML=`<main style="grid-column:1/-1">
 <div class="onboard">
 <div class="step">step 1 of 2 · firm</div>
 <h1>FallBooks</h1>
 <div class="lead">Sovereign multi-client US accountancy practice. Set up your firm to begin. All data stays in your browser.</div>
 <div class="field"><label>Firm name</label><input id="ob_fname" placeholder="Patel & Co"></div>
 <div class="row" style="margin-top:8px"><div class="field"><label>Practice type</label><select id="ob_ftype"><option value="sole-practitioner">Sole practitioner</option><option value="partnership">Partnership</option><option value="llp">LLP</option><option value="limited-company">Limited company</option></select></div>
 <div class="field"><label>Professional body</label><select id="ob_pb"><option>AICPA</option><option>ACCA</option><option>CIMA</option><option>AAT</option><option>CIOT</option><option>ATT</option><option>IFA</option><option>other</option></select></div></div>
 <div class="row" style="margin-top:8px"><div class="field"><label>Practising certificate no</label><input id="ob_pc" placeholder="PC123456"></div><div class="field"><label>AML supervisor</label><select id="ob_aml"><option>IRS</option><option>AICPA</option><option>ACCA</option><option>CIMA</option><option>AAT</option><option>IFA</option><option>other</option></select></div></div>
 <div class="row" style="margin-top:8px"><div class="field"><label>IRS agent ref</label><input id="ob_hmrc" placeholder="64-8 ref"></div><div class="field"><label>PI insurer</label><input id="ob_pi" placeholder="Hiscox"></div></div>
 <div class="row" style="margin-top:8px"><div class="field"><label>PI expires</label><input id="ob_pie" type="date"></div><div class="field"><label>Brand colour</label><input id="ob_bc" type="color" value="#8b1a1a"></div></div>
 <div class="actions" style="margin-top:18px;justify-content:flex-end"><button class="btn primary" onclick="onboardStep1()">Continue · add adviser</button></div>
 </div></main>`;
}
async function onboardStep1(){
 const f=newBlankFirm();
 f.name=$('#ob_fname').value.trim()||'Unnamed firm';
 f.practiceType=$('#ob_ftype').value;f.professionalBody=$('#ob_pb').value;f.practiceCertNo=$('#ob_pc').value;
 f.amlSupervisor=$('#ob_aml').value;f.hmrcAgentRef=$('#ob_hmrc').value;
 f.piInsurer=$('#ob_pi').value;f.piExpiresAt=$('#ob_pie').value||null;
 f.brandColor=$('#ob_bc').value;
 state.firm=f;await persistFirm('firm created via onboarding');
 // step 2
 const root=$('#layout');
 root.innerHTML=`<main style="grid-column:1/-1">
 <div class="onboard">
 <div class="step">step 2 of 2 · adviser</div>
 <h1>${esc(f.name)}</h1>
 <div class="lead">Add yourself as the first adviser (you can add more from Practice → + Adviser).</div>
 <div class="row"><div class="field"><label>Your name</label><input id="ob_aname"></div><div class="field"><label>Email</label><input id="ob_aemail"></div></div>
 <div class="row" style="margin-top:8px"><div class="field"><label>Professional body</label><select id="ob_apb"><option>AICPA</option><option>ACCA</option><option>CIMA</option><option>AAT</option><option>CIOT</option><option>ATT</option><option>IFA</option><option>other</option></select></div><div class="field"><label>Membership no</label><input id="ob_amn"></div></div>
 <div class="row" style="margin-top:8px"><div class="field"><label>Practising cert active?</label><select id="ob_apc"><option value="true">yes</option><option value="false">no</option></select></div><div class="field"><label>CPD hours · this year</label><input id="ob_acpd" type="number" value="0"></div></div>
 <div class="actions" style="margin-top:18px;justify-content:flex-end"><button class="btn primary" onclick="onboardStep2()">Complete &amp; enter app</button></div>
 </div></main>`;
}
async function onboardStep2(){
 const a=newBlankAdviser($('#ob_aname').value.trim()||'Principal');
 a.email=$('#ob_aemail').value;a.professionalBody=$('#ob_apb').value;a.membershipNo=$('#ob_amn').value;
 a.practisingCert.active=$('#ob_apc').value==='true';a.cpdHoursThisYear=+$('#ob_acpd').value||0;
 state.advisers.push(a);await persistAdviser(a,'first adviser');state.settings.currentAdviserId=a.id;
 state.firm.setupCompletedAt=now();await persistFirm('setup completed');await saveSettings();
 // seed demo client
 await seedDemoData();
 toast('welcome to FallBooks');render();
}
// ── DEMO DATA ──
async function seedDemoData(){
 if(state.clients.find(c=>c.id==='cl_DEMO_OSEI'))return;
 const c=newBlankClient('limited-company');
 c.id='cl_DEMO_OSEI';
 c.entityName='DEMO · Marcus Osei Trading Ltd · overwrite me';
 c.tradingName='Osei IT Consulting';
 c.companiesHouseNo='15234567';
 c.ctUtr='1234567890';
 c.vatNumber='GB345678901';
 c.vatScheme='flat-rate';c.vatFlatRateSector='computer-it';
 c.payeReference='123/AB12345';c.payePeriod='monthly';
 c.email='marcus@osei-it.example';c.phone='+44 7700 900123';
 c.address={line1:'12 Holloway Rd',line2:'',city:'London',postcode:'N7 8JG',country:'GB'};
 c.servicesEngaged=['accounts','ct','vat','payroll','bookkeeping','companies-house-filings'];
 c.engagement.feeBasis='fixed-monthly';c.engagement.feeAmount=350;c.engagement.feeFrequency='monthly';
 c.engagement.letterOfEngagementSignedAt=now()-30*86400000;
 c.engagement.letterOfEngagementHash=await sha256('demo-loe');
 c.kyc.riskGrade='low';c.kyc.status='verified';c.kyc.natureAndPurposeOfBusiness='IT consultancy services to US SMEs';
 c.kyc.sourceOfFundsForServices='trading income';c.kyc.amlSupervisor=state.firm.amlSupervisor;
 c.beneficialOwners=[{name:'Marcus Osei',dob:'1986-04-12',address:'12 Holloway Rd, London N7 8JG',ownershipPct:100,controlNotes:'sole director + shareholder'}];
 c.pscFromCompaniesHouse=[{name:'Marcus Osei',natureOfControl:'ownership-of-shares-75-to-100-percent'}];
 // current accounting period · last 12 months
 const today=new Date();const ps=new Date(today.getFullYear(),today.getMonth()-11,1);const pe=addDays(new Date(today.getFullYear(),today.getMonth()+1,1),-1);
 c.accountingPeriodStart=isoDate(ps);c.accountingPeriodEnd=isoDate(pe);c.yearEnd=c.accountingPeriodEnd.slice(5);
 c.employees=[
 {id:'em_demo1',name:'Marcus Osei (director)',nino:'AB123456C',taxCode:'1257L',annualSalary:12570,pensionPct:0,studentLoan:false},
 {id:'em_demo2',name:'Aisha Reeve (admin)',nino:'CD234567E',taxCode:'1257L',annualSalary:28000,pensionPct:0.05,studentLoan:false},
 ];
 c.adviserId=state.settings.currentAdviserId;
 state.clients.push(c);
 // demo transactions
 const txList=[
 {date:isoDate(addMonths(today,-11)),payee:'Sales · IT Consulting Acme Ltd',accountCode:'4100',amount:6000,vatRate:0.20},
 {date:isoDate(addMonths(today,-10)),payee:'Stripe payout',accountCode:'4100',amount:4200,vatRate:0.20},
 {date:isoDate(addMonths(today,-9)),payee:'Sales · Patel Construction Ltd',accountCode:'4100',amount:9500,vatRate:0.20},
 {date:isoDate(addMonths(today,-8)),payee:'AWS subscription',accountCode:'6301',amount:-240,vatRate:0.20},
 {date:isoDate(addMonths(today,-7)),payee:'Office rent · Holloway Studios',accountCode:'6100',amount:-1200,vatRate:0.20},
 {date:isoDate(addMonths(today,-6)),payee:'Octopus Energy',accountCode:'6102',amount:-180,vatRate:0.05},
 {date:isoDate(addMonths(today,-5)),payee:'Uber',accountCode:'6200',amount:-65,vatRate:0.20},
 {date:isoDate(addMonths(today,-5)),payee:'BT Internet',accountCode:'6300',amount:-45,vatRate:0.20},
 {date:isoDate(addMonths(today,-4)),payee:'Hiscox PI Insurance',accountCode:'6103',amount:-420,vatRate:0},
 {date:isoDate(addMonths(today,-4)),payee:'Sales · Holdings',accountCode:'4100',amount:11200,vatRate:0.20},
 {date:isoDate(addMonths(today,-3)),payee:'AICPA subscription',accountCode:'6402',amount:-380,vatRate:0.20},
 {date:isoDate(addMonths(today,-3)),payee:'Payroll · Aisha Reeve',accountCode:'6000',amount:-2333,vatRate:0},
 {date:isoDate(addMonths(today,-2)),payee:'GitHub Enterprise',accountCode:'6301',amount:-160,vatRate:0.20},
 {date:isoDate(addMonths(today,-2)),payee:'Sales · Bond Wealth Ltd',accountCode:'4100',amount:8400,vatRate:0.20},
 {date:isoDate(addMonths(today,-1)),payee:'Google Ads',accountCode:'6500',amount:-220,vatRate:0.20},
 {date:isoDate(addMonths(today,-1)),payee:'Sales · final tranche · ',accountCode:'4100',amount:7800,vatRate:0.20},
 ];
 for(const t of txList){const tx={id:'tx_'+uid(),clientId:c.id,...t,vatScheme:'standard',reconciled:true,createdAt:now()};state.transactions.push(tx);await persistTx(tx)}
 c.deadlines=generateDeadlinesForClient(c);
 await persistClient(c,'demo client seeded');
 await audit('demo.seeded','demo client + tx',{id:c.id});
 toast('demo client seeded');
}
// ── BOOT ──
async function boot(){
 try{
 await loadAllFromDB();
 meshInit();
 render();
 }catch(e){
 console.error('boot',e);
 $('#layout').innerHTML='<div style="padding:30px;color:var(--red)">Boot error · '+esc(e.message)+'</div>';
 }
}
boot();
  try {
    const { installAutopilot } = await import('https://sjgant80-hub.github.io/fall-autopilot-kit/src/autopilot.js');
    const manifestRes = await fetch('https://sjgant80-hub.github.io/fall-autopilot-kit/manifests/fallbooks-us.json');
    const manifest = await manifestRes.json();
    // Wire actions to stub run functions (each tool implements its own; missing ones alert the user)
    manifest.actions = manifest.actions.map(a => ({ ...a, run: async (params) => {
      const fn = window._app?.[a.id];
      if (typeof fn === 'function') return fn(params);
      alert('Autopilot proposes: ' + a.name + ' · params: ' + JSON.stringify(params) + '\n\nThis tool has not yet implemented the ' + a.id + ' handler. Proposal logged to audit.');
      return { stub: true, action: a.id, params };
    }}));
    manifest.state = () => ({ ...(window._app || {}), now: new Date().toISOString() });
    installAutopilot(manifest);
  } catch (e) { console.warn('[autopilot] init failed:', e); }

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { TOOLNAME };
export { VERSION };
