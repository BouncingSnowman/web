// CrazyGames SDK helper (safe wrapper)
// Docs: https://docs.crazygames.com/sdk/intro/
//
// Goals of this wrapper:
// - Never crash when running outside CrazyGames.
// - Allow calling loadingStart/gameplayStart/etc. early (even before SDK init is done).
// - Queue calls so the CrazyGames QA tool reliably detects them.

export const CG = (() => {
    let _initPromise = null;
    let _loadingStarted = false;
    let _loadingStopped = false;
    let _muted = false;

    const hasSDK = () => {
        return typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK;
    };

    const _safe = (fn) => {
        try { fn(); } catch (e) { }
    };

    const _waitForSDK = (timeoutMs = 10000) => {
        return new Promise((resolve) => {
            if (hasSDK()) return resolve(true);
            const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const id = setInterval(() => {
                if (hasSDK()) {
                    clearInterval(id);
                    resolve(true);
                    return;
                }
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                if (now - start >= timeoutMs) {
                    clearInterval(id);
                    resolve(false);
                }
            }, 50);
        });
    };

    const _applySettings = (settings) => {
        if (!settings) return;
        if (typeof settings.muteAudio === 'boolean') {
            _muted = !!settings.muteAudio;
            window.__cgMuteAudio = _muted;
            // Inform the rest of the game (audio/video) without hard dependencies.
            _safe(() => {
                window.dispatchEvent(new CustomEvent('cg-settings-changed', { detail: settings }));
            });
        }
    };

    const init = () => {
        if (_initPromise) return _initPromise;

        _initPromise = (async () => {
            // If the SDK script loads slightly later (QA tool / slow network), wait a moment.
            if (!hasSDK()) {
                const ok = await _waitForSDK(10000);
                if (!ok) return false;
            }

            try {
                await window.CrazyGames.SDK.init();
                console.log('[CG] SDK init complete. SDK.data available:', !!(window.CrazyGames.SDK.data));
                if (window.CrazyGames.SDK.data) {
                    console.log('[CG] SDK.data methods:', Object.keys(window.CrazyGames.SDK.data));
                    try {
                        const testVal = window.CrazyGames.SDK.data.getItem('ALIENSECTOR_SCORE_ACCRUED');
                        console.log('[CG] SDK.data accrued score on init:', testVal);
                    } catch (e2) { console.warn('[CG] SDK.data.getItem test failed:', e2); }
                }

                // Initial settings (muteAudio / disableChat etc.)
                _safe(() => {
                    const game = window.CrazyGames.SDK.game;
                    _applySettings(game && game.settings);
                });

                // Live settings updates
                _safe(() => {
                    const game = window.CrazyGames.SDK.game;
                    if (game && typeof game.addSettingsChangeListener === 'function') {
                        game.addSettingsChangeListener((newSettings) => _applySettings(newSettings));
                    }
                });

                return true;
            } catch (e) {
                console.warn('[CG] SDK init failed:', e);
                return false;
            }
        })();

        return _initPromise;
    };

    const _withGame = async (fn) => {
        const ok = await init();
        if (!ok || !hasSDK()) return;
        const game = window.CrazyGames.SDK.game;
        if (!game) return;
        _safe(() => {
            const r = fn(game);
            // Many SDK calls return a Promise that may reject when not inside
            // the CrazyGames runtime. Swallow those rejections to avoid noisy
            // "Uncaught (in promise) t.GeneralError" console spam.
            if (r && typeof r.then === 'function' && typeof r.catch === 'function') {
                r.catch(() => { });
            }
            return r;
        });
    };

    const loadingStart = () => {
        if (_loadingStarted) return;
        _loadingStarted = true;
        // Ensure this call happens after SDK init so it is actually registered by the QA tool.
        _withGame((game) => game.loadingStart());
    };

    const loadingStop = () => {
        if (_loadingStopped) return;
        _loadingStopped = true;
        _withGame((game) => game.loadingStop());
    };

    const gameplayStart = () => {
        // According to docs, loadingStop should happen when gameplay starts.
        loadingStop();
        _withGame((game) => game.gameplayStart());
    };

    const gameplayStop = () => {
        _withGame((game) => game.gameplayStop());
    };

    const happytime = () => {
        _withGame((game) => game.happytime());
    };

    const isMuted = () => !!_muted;

    // ── Data persistence (CG SDK data module → localStorage fallback) ──

    const _hasData = () => {
        try {
            return hasSDK() && window.CrazyGames.SDK.data &&
                typeof window.CrazyGames.SDK.data.getItem === 'function';
        } catch (e) { return false; }
    };

    const getItem = (key) => {
        try {
            if (_hasData()) {
                const v = window.CrazyGames.SDK.data.getItem(key);
                if (key.indexOf('SCORE_ACCRUED') !== -1 || key.indexOf('UNLOCKED') !== -1) {
                    console.log('[CG] getItem SDK.data', key, '→', v);
                }
                if (v !== null && v !== undefined) return v;
            }
        } catch (e) { console.warn('[CG] getItem SDK.data error:', key, e); }
        // Fallback to localStorage
        try {
            const lsVal = localStorage.getItem(key);
            if (key.indexOf('SCORE_ACCRUED') !== -1 || key.indexOf('UNLOCKED') !== -1) {
                console.log('[CG] getItem localStorage fallback', key, '→', lsVal);
            }
            return lsVal;
        } catch (e) { return null; }
    };

    const setItem = (key, value) => {
        // Always write to SDK data when available
        try {
            if (_hasData()) {
                window.CrazyGames.SDK.data.setItem(key, String(value));
                if (key.indexOf('SCORE_ACCRUED') !== -1) {
                    console.log('[CG] setItem SDK.data', key, '=', String(value));
                }
            }
        } catch (e) { console.warn('[CG] setItem SDK.data error:', key, e); }
        // Also write to localStorage as a local cache / fallback
        try { localStorage.setItem(key, String(value)); } catch (e) { }
    };

    const removeItem = (key) => {
        try {
            if (_hasData()) window.CrazyGames.SDK.data.removeItem(key);
        } catch (e) { }
        try { localStorage.removeItem(key); } catch (e) { }
    };

    /**
     * One-time migration: copy all game-related localStorage keys into the
     * CrazyGames SDK data module so returning players keep their progress.
     * Call once after CG.init() resolves.
     */
    const migrateLocalStorage = () => {
        if (!_hasData()) return;
        const MIGRATED_FLAG = '_ALIENSECTOR_CG_DATA_MIGRATED';
        try {
            if (window.CrazyGames.SDK.data.getItem(MIGRATED_FLAG) === '1') return;
        } catch (e) { return; }

        try {
            const prefixes = ['ALIENSECTOR_', 'ASTROCOM_'];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (!prefixes.some(p => key.startsWith(p))) continue;
                const val = localStorage.getItem(key);
                if (val !== null) {
                    window.CrazyGames.SDK.data.setItem(key, val);
                }
            }
            window.CrazyGames.SDK.data.setItem(MIGRATED_FLAG, '1');
        } catch (e) { }
    };

    return {
        hasSDK,
        init,
        loadingStart,
        loadingStop,
        gameplayStart,
        gameplayStop,
        happytime,
        isMuted,
        getItem,
        setItem,
        removeItem,
        migrateLocalStorage
    };
})();
