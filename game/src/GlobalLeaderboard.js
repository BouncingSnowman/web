// src/GlobalLeaderboard.js
//
// Client-side helper for the Global Leaderboard.
// Constraints:
// - No Supabase client SDK
// - Talks only to Supabase Edge Functions (get-scores / submit-score)

const FUNCTIONS_BASE = 'https://cywcnyimlhiwbbqqzvoe.supabase.co/functions/v1';

// OPTIONAL AUTH:
// If your Supabase Edge Functions are deployed with JWT verification ON (default),
// browser calls must include an Authorization header.
//
// Put your project's *anon* key here (it is public, safe to ship client-side):
// Supabase Dashboard -> Project Settings -> API -> anon public key
//
// Leave this empty if you deployed functions with verify_jwt = false.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5d2NueWltbGhpd2JicXF6dm9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjIyOTYsImV4cCI6MjA4MTEzODI5Nn0.rVPlSGwbKz-HyODCz3f2tFW-9sm1X3zRVuWoDuwsM24';

function normalizeDifficulty(difficulty) {
  const d = String(difficulty || 'NORMAL').toUpperCase();
  if (d === 'HARD') return 'HARD';
  if (d === 'EASY') return 'EASY';
  return 'NORMAL';
}

function normalizeScores(payload) {
  // Accept either:
  // - { scores: [...] }
  // - { data: [...] }
  // - [...]
  const arr = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.data)
      ? payload.data
      : (payload && Array.isArray(payload.scores)
        ? payload.scores
        : []));
  return arr.map((s) => ({
    name: (s && s.name ? String(s.name) : 'Pilot').slice(0, 8),
    score: Math.floor(Number(s && s.score ? s.score : 0)),
    difficulty: normalizeDifficulty(s && s.difficulty),
  }));
}

function rowHtml(entry, idx) {
  const mode = entry.difficulty === 'HARD' ? 'HARD' : entry.difficulty === 'EASY' ? 'EASY' : 'NORMAL';
  const modeStyle = mode === 'HARD'
    ? 'display:inline-block;min-width:64px;text-align:center;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#ff5555;'
    : mode === 'EASY'
      ? 'display:inline-block;min-width:64px;text-align:center;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#44ff44;'
      : 'display:inline-block;min-width:64px;text-align:center;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#88aaff;';

  return `<div class="score-row">
    <span class="score-rank">${idx + 1}.</span>
    <span class="score-name">${entry.name}</span>
    <span style="${modeStyle}">${mode}</span>
    <span class="score-value">${Math.floor(entry.score)}</span>
  </div>`;
}

function sectionTitleHtml(title) {
  return `<div style="margin:10px 0 6px 0; font-weight:900; letter-spacing:2px; color:#00ffff; text-transform:uppercase; text-shadow:0 0 10px rgba(0,255,255,0.4);">
    ${title}
  </div>`;
}

function _addAnonAuthHeaders(options) {
  if (!SUPABASE_ANON_KEY) return options;
  const base = options || {};
  const h = { ...(base.headers || {}) };
  if (!h.Authorization) h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  if (!h.apikey) h.apikey = SUPABASE_ANON_KEY;
  return { ...base, headers: h };
}

async function fetchJson(url, options, _didAuthRetry = false) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = (json && (json.error || json.message)) ? (json.error || json.message) : `HTTP ${res.status}`;

    if (!_didAuthRetry && SUPABASE_ANON_KEY && (res.status === 401 || res.status === 403)) {
      return fetchJson(url, _addAnonAuthHeaders(options), true);
    }

    throw new Error(msg);
  }
  return json;
}

export const GlobalLeaderboard = {
  _worldBest: { EASY: 0, NORMAL: 0, HARD: 0 },

  getWorldBest(difficulty) {
    const d = normalizeDifficulty(difficulty);
    return this._worldBest[d] || 0;
  },

  async prefetchWorldBests() {
    const [easy, normal, hard] = await Promise.all([
      this.fetchTopScores('EASY', 1).catch(() => []),
      this.fetchTopScores('NORMAL', 1).catch(() => []),
      this.fetchTopScores('HARD', 1).catch(() => [])
    ]);

    this._worldBest.EASY = easy[0]?.score || 0;
    this._worldBest.NORMAL = normal[0]?.score || 0;
    this._worldBest.HARD = hard[0]?.score || 0;

    return { ...this._worldBest };
  },

  async fetchTopScores(difficulty, limit = 10) {
    const d = normalizeDifficulty(difficulty);
    const cleanLimit = Math.max(1, Math.floor(Number(limit) || 10));
    // Ask for extra rows so we can de-duplicate client-side without ending up with a short list.
    const requestLimit = Math.min(100, cleanLimit * 3);
    const url = `${FUNCTIONS_BASE}/get-scores?difficulty=${encodeURIComponent(d)}&limit=${encodeURIComponent(String(requestLimit))}&_=${Date.now()}`;
    const json = await fetchJson(url, { method: 'GET', cache: 'no-store' });

    const normalized = normalizeScores(json)
      .filter((s) => s.difficulty === d)
      .sort((a, b) => (b.score - a.score));

    // De-duplicate exact duplicates (same name + score + difficulty), then cut to limit.
    const seen = new Set();
    const unique = [];
    for (const s of normalized) {
      const key = `${s.difficulty}|${String(s.name || '').toUpperCase()}|${Math.floor(Number(s.score || 0))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(s);
      if (unique.length >= cleanLimit) break;
    }

    return unique;
  },

  async submitScore({ name, score, difficulty }) {
    const d = normalizeDifficulty(difficulty);
    const cleanName = (String(name || 'Pilot').trim() || 'Pilot').slice(0, 8).toUpperCase();
    const cleanScore = Math.floor(Number(score || 0));

    const url = `${FUNCTIONS_BASE}/submit-score`;
    const payload = {
      name: cleanName,
      score: cleanScore,
      difficulty: d,
    };

    const json = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return json;
  },

  async renderGlobalInto(elementId = 'leaderboard-entries') {
    const listEl = document.getElementById(elementId);
    const loadingEl = document.getElementById('leaderboard-loading');
    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'block';
    listEl.style.display = 'none';

    const [easy, normal, hard] = await Promise.all([
      this.fetchTopScores('EASY', 10).catch(() => []),
      this.fetchTopScores('NORMAL', 20).catch(() => []),
      this.fetchTopScores('HARD', 10).catch(() => [])
    ]);

    this._worldBest.EASY = easy[0]?.score || 0;
    this._worldBest.NORMAL = normal[0]?.score || 0;
    this._worldBest.HARD = hard[0]?.score || 0;

    if ((!easy || easy.length === 0) && (!normal || normal.length === 0) && (!hard || hard.length === 0)) {
      if (loadingEl) loadingEl.style.display = 'none';
      listEl.style.display = 'block';
      return;
    }

    const parts = [];
    parts.push(sectionTitleHtml('GLOBAL EASY'));
    if (easy.length === 0) {
      parts.push('<p class="no-scores">No global Easy scores yet.</p>');
    } else {
      parts.push(easy.map((s, i) => rowHtml(s, i)).join(''));
    }

    parts.push(sectionTitleHtml('GLOBAL NORMAL'));
    if (normal.length === 0) {
      parts.push('<p class="no-scores">No global Normal scores yet.</p>');
    } else {
      parts.push(normal.map((s, i) => rowHtml(s, i)).join(''));
    }

    parts.push(sectionTitleHtml('GLOBAL HARD'));
    if (hard.length === 0) {
      parts.push('<p class="no-scores">No global Hard scores yet.</p>');
    } else {
      parts.push(hard.map((s, i) => rowHtml(s, i)).join(''));
    }

    listEl.innerHTML = parts.join('');

    if (loadingEl) loadingEl.style.display = 'none';
    listEl.style.display = 'block';
  }
};
