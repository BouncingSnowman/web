import { Game } from './Game.js?v=6005';
import { AudioSys, Joystick, Leaderboard, safeSetText } from './Systems.js?v=6000';
import { CONFIG } from './constants.js?v=6000';
import { GlobalLeaderboard } from './GlobalLeaderboard.js?v=6000';
import { CG } from './crazygames.js?v=6000';
import { track } from './Telemetry.js?v=6000';

const DIFFICULTY_KEY = 'ASTROCOM_DIFFICULTY';
const TUTORIAL_DONE_KEY = 'ALIENSECTOR_TUTORIAL_DONE';

// Kick off CrazyGames SDK as early as possible (safe no-op outside CrazyGames)
CG.loadingStart();
CG.init().then(() => CG.migrateLocalStorage());

const _normalizeDifficulty = (v) => {
    const d = String(v || 'NORMAL').toUpperCase();
    if (d === 'HARD') return 'HARD';
    if (d === 'EASY') return 'EASY';
    return 'NORMAL';
};

window.addEventListener('load', () => {
    console.log('[AlienSector] boot');

    // CrazyGames: the game starts in the menu (not actively playing yet)
    CG.loadingStop();
    CG.gameplayStop();

    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
        console.error('[AlienSector] ERROR: Canvas element with id "game-canvas" not found in DOM');
        return;
    }

    const gameViewport = document.getElementById('game-viewport');

    const isStandardMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIpadDesktopMode = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isTouchCapable = (navigator.maxTouchPoints > 1) || ('ontouchstart' in window);
    const isMobileControls = isStandardMobile || isIpadDesktopMode || isTouchCapable;

    // The 'desktop' class drives desktop vs mobile UI/CSS.
    // Important: touch-capable laptops should still behave as desktop.
    const isDesktop = !isStandardMobile && !isIpadDesktopMode;
    document.body.classList.toggle('desktop', isDesktop);
    const isSmallScreen = window.innerWidth < 768;

    // --- MOBILE MENU SIZING FIX ---
    // Injects styles to make buttons and text larger on small screens.
    const mobileStyle = document.createElement('style');
    mobileStyle.innerHTML = `
        @media (max-width: 768px) {
            #start-content {
                width: 100% !important;
                padding: 0 15px;
            }
            #start-content h1, .title {
                font-size: 3rem !important; /* Larger Title */
                margin-bottom: 20px !important;
            }
            #controls-text {
                font-size: 14px !important;
                line-height: 1.4 !important;
                padding: 15px !important;
                width: 95% !important;
                margin-bottom: 20px !important;
            }
            #menu-difficulty {
                width: 95% !important;
                margin: 15px auto !important;
            }
		    #start-btn, #hangar-btn, #leaderboard-btn {
                font-size: 1.6rem !important;
                padding: 18px 0 !important;
                width: 90% !important;
                margin: 10px 0 !important;
            }
        }
    `;
    document.head.appendChild(mobileStyle);
    // ------------------------------

    const controlsText = document.getElementById('controls-text');
    if (controlsText) {
        if (isMobileControls) {
            controlsText.innerText = 'Virtual stick to steer on right side of screen, Shield button on the left to activate shield';
        } else {
            controlsText.innerText = 'WASD or arrow keys to steer, Spacebar to activate shield';
        }
    }

    if (isSmallScreen) {
        CONFIG.SHIP_SIZE *= 0.8;
        CONFIG.ASTEROID_LARGE_SIZE *= 0.7;
        CONFIG.ASTEROID_MEDIUM_SIZE *= 0.7;
        CONFIG.ASTEROID_SMALL_SIZE *= 0.7;
    } else {
        // PC and tablet: increase player blaster range by 20%
        CONFIG.BULLET_LIFETIME *= 1.2;
    }

    const setVh = () => {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };

    const resizeCanvas = () => {
        setVh();

        if (gameViewport) {
            const rect = gameViewport.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(rect.width));
            canvas.height = Math.max(1, Math.round(rect.height));
        } else {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        if (window.currentGame) {
            window.currentGame.width = canvas.width;
            window.currentGame.height = canvas.height;

            const g = window.currentGame.galaxy;
            // Guard against partially-initialized galaxy objects to avoid resize-time crashes.
            if (g && g.canvas && (canvas.width > g.canvas.width || canvas.height > g.canvas.height)) {
                g.canvas.width = canvas.width;
                g.canvas.height = canvas.height;
                g.generate(canvas.width, canvas.height);
            }
        }
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Telemetry: track session start
    const _isMobile = /Mobi|Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
    const _sessionCareer = parseInt((() => { try { return CG.getItem('ALIENSECTOR_SCORE_ACCRUED') || '0'; } catch (e) { return '0'; } })(), 10) || 0;
    track('session_start', { device: _isMobile ? 'mobile' : 'desktop', isBeginner: _sessionCareer < 50000 });

    const overlay = document.getElementById('center-screen-overlay');
    const startContent = document.getElementById('start-content');
    const leaderboardView = document.getElementById('leaderboard-view');
    const hangarView = document.getElementById('hangar-view');

    const startBtn = document.getElementById('start-btn');
    const hangarBtn = document.getElementById('hangar-btn');
    const leaderboardBtn = document.getElementById('leaderboard-btn');
    const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');
    const hangarBackBtn = document.getElementById('hangar-back-btn');

    const gameOverHangarBtn = document.getElementById('gameover-hangar-btn');
    const victoryHangarBtn = document.getElementById('victory-hangar-btn');
    const sectorSuccessHangarBtn = document.getElementById('sector-success-hangar-btn');

    const comebackUi = document.getElementById('comeback-contract-ui');
    const comebackAcceptBtn = document.getElementById('comeback-accept-btn');
    const comebackSkipBtn = document.getElementById('comeback-skip-btn');

    const comebackCompleteUi = document.getElementById('comeback-complete-ui');
    const comebackReturnBtn = document.getElementById('comeback-return-btn');

    const hangarHeroAction = document.getElementById('hangar-hero-action');
    const hangarWinnerAction = document.getElementById('hangar-winner-action');
    const hangarWinnerBadge = document.getElementById('hangar-winner-badge');
    const hangarWarlockAction = document.getElementById('hangar-warlock-action');
    const hangarWarlockBadge = document.getElementById('hangar-warlock-badge');

    const hangarHeroCard = document.getElementById('hangar-hero-card');
    const hangarWinnerCard = document.getElementById('hangar-winner-card');
    const hangarWarlockCard = document.getElementById('hangar-warlock-card');

    const LS_WINNER_SHIP_UNLOCKED = 'ALIENSECTOR_WINNER_SHIP_UNLOCKED';
    const LS_WARLOCK_SHIP_UNLOCKED = 'ALIENSECTOR_WARLOCK_SHIP_UNLOCKED';
    const LS_SELECTED_SHIP = 'ALIENSECTOR_SELECTED_SHIP';
    const joystickZone = document.getElementById('joystick-zone');

    // New Controls Tutorial (simple one-screen overlay)
    const controlsTutorial = document.getElementById('controls-tutorial');
    let controlsTutorialShown = false;

    const showControlsTutorial = () => {
        if (!controlsTutorial) return;
        controlsTutorial.classList.add('is-visible');
        controlsTutorial.setAttribute('aria-hidden', 'false');
        controlsTutorialShown = true;

        // Pause the game while tutorial is shown
        if (game) game.isPaused = true;
    };

    const hideControlsTutorial = () => {
        if (!controlsTutorial) return;
        controlsTutorial.classList.remove('is-visible');
        controlsTutorial.setAttribute('aria-hidden', 'true');
        controlsTutorialShown = false;

        // Mark tutorial as done
        try { CG.setItem(TUTORIAL_DONE_KEY, '1'); } catch (e) { }

        // Resume the game
        if (game) {
            game.isPaused = false;
            game.tutorialActive = false;
            if (typeof game.enableSpawningAfterTutorial === 'function') {
                game.enableSpawningAfterTutorial();
            }
        }
    };

    // Dismiss tutorial on tap/click anywhere
    if (controlsTutorial) {
        const dismissTutorial = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideControlsTutorial();
        };
        controlsTutorial.addEventListener('click', dismissTutorial);
        controlsTutorial.addEventListener('touchstart', dismissTutorial, { passive: false });
    }

    const gameOverContent = document.getElementById('game-over-content');
    const levelCompleteContent = document.getElementById('level-complete-content');
    const gameCompleteContent = document.getElementById('game-complete-content');
    const victoryStatsContent = document.getElementById('victory-stats-content');

    const pauseOverlay = document.getElementById('pause-overlay');
    const pauseBtn = isDesktop ? document.getElementById('pause-btn-desktop') : document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const quitBtn = document.getElementById('quit-btn');

    const launchCutscene = document.getElementById('launch-cutscene');
    const launchVideo = document.getElementById('launch-video');

    const LAUNCH_SRC = 'assets/launch.mp4';
    const WELCOME_SRC = 'assets/welcomehome.mp4';

    const LS_SCORE_ACCRUED = 'ALIENSECTOR_SCORE_ACCRUED';
    const WINNER_UNLOCK_AT = 15000;
    const WARLOCK_UNLOCK_AT = 100000;
    const GHOST_UNLOCK_AT = 1000000;

    // Helper: stop the ad-hoc <audio> element used for Leaderboard.mp3 on the victory screen.
    const stopLeaderboardAudioEl = () => {
        const el = document.getElementById('leaderboard-audio-el');
        if (el) { try { el.pause(); el.currentTime = 0; el.remove(); } catch (e) { } }
    };


    const applyCgMuteToMedia = () => {
        const muted = !!window.__cgMuteAudio;
        try { if (launchVideo) launchVideo.muted = false; } catch (e) { } // MUST have audio to unlock iOS!
        try {
            const lb = document.getElementById('leaderboard-audio-el');
            if (lb) lb.muted = muted;
        } catch (e) { }
    };

    // Initial apply + react to CrazyGames settings changes (muteAudio)
    applyCgMuteToMedia();
    window.addEventListener('cg-settings-changed', applyCgMuteToMedia);

    // iPad/iOS: proactively resume AudioContext when page becomes visible again.
    // Safari suspends the context when the tab/app goes to background; this
    // ensures it's running before the player taps Resume.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
            AudioSys.ctx.resume().catch(() => { });
        }
    });

    const setCutsceneSrc = (src) => {
        if (!launchVideo) return;
        try {
            launchVideo.src = src;
            launchVideo.load();
        } catch (e) { }
    };

    let _audioKeepAliveOsc = null;
    let _audioKeepAliveGain = null;

    const startAudioKeepAlive = () => {
        if (!AudioSys.ctx || _audioKeepAliveOsc) return;
        try {
            const ctx = AudioSys.ctx;
            _audioKeepAliveOsc = ctx.createOscillator();
            _audioKeepAliveGain = ctx.createGain();
            // Silent but keeps the audio session active.
            _audioKeepAliveGain.gain.value = 0.00001;
            _audioKeepAliveOsc.connect(_audioKeepAliveGain);
            _audioKeepAliveGain.connect(ctx.destination);
            _audioKeepAliveOsc.start();
        } catch (e) { }
    };

    const stopAudioKeepAlive = () => {
        try {
            if (_audioKeepAliveOsc) _audioKeepAliveOsc.stop();
        } catch (e) { }
        try {
            if (_audioKeepAliveOsc) _audioKeepAliveOsc.disconnect();
            if (_audioKeepAliveGain) _audioKeepAliveGain.disconnect();
        } catch (e) { }
        _audioKeepAliveOsc = null;
        _audioKeepAliveGain = null;
    };

    let game = new Game(canvas);
    window.currentGame = game;

    // Legacy tutorial variables (kept for compatibility, simplified)
    let tutorialActive = false;


    Leaderboard.init();
    GlobalLeaderboard.prefetchWorldBests().catch(() => { });
    Leaderboard.render('leaderboard-list');

    const shieldBtn = document.getElementById('shield-btn');
    if (shieldBtn) {
        const activateShieldTap = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (game && game.isPlaying && game.ship) {
                game.ship.activateShield();
            }
        };
        shieldBtn.addEventListener('touchstart', activateShieldTap, { passive: false });
        shieldBtn.addEventListener('mousedown', activateShieldTap);
    }

    if (overlay && startContent) {
        overlay.style.display = 'flex';
        startContent.style.display = 'flex';

        // Use the UFO splash as the background for the main menu/leaderboard.
        overlay.classList.add('menu-bg');

        if (joystickZone) joystickZone.style.pointerEvents = 'auto';
        if (leaderboardView) leaderboardView.style.display = 'none';
        if (gameOverContent) gameOverContent.style.display = 'none';
        if (levelCompleteContent) levelCompleteContent.style.display = 'none';
        if (gameCompleteContent) gameCompleteContent.style.display = 'none';
    }

    // Refresh career progress display on the main menu
    const refreshMenuCareerProgress = () => {
        const menuCareerEl = document.getElementById('menu-career-progress');
        if (!menuCareerEl) return;
        try {
            const accrued = parseInt(CG.getItem('ALIENSECTOR_SCORE_ACCRUED') || '0', 10) || 0;
            if (accrued > 0) {
                const WINNER_UNLOCK_AT = 15000;
                const WARLOCK_UNLOCK_AT = 100000;
                const GHOST_UNLOCK_AT = 1000000;

                let progressMsg = `Career Score: ${accrued.toLocaleString('en-US')}`;
                let nextAt = 0;
                let nextName = '';
                if (accrued < WINNER_UNLOCK_AT) { nextAt = WINNER_UNLOCK_AT; nextName = 'Ship Upgrade'; }
                else if (accrued < WARLOCK_UNLOCK_AT) { nextAt = WARLOCK_UNLOCK_AT; nextName = 'Ship Upgrade'; }
                else if (accrued < GHOST_UNLOCK_AT) { nextAt = GHOST_UNLOCK_AT; nextName = 'Ship Upgrade'; }

                if (nextAt > 0) {
                    const remaining = Math.max(0, nextAt - accrued);
                    progressMsg += ` · ${remaining.toLocaleString('en-US')} to ${nextName}`;
                }

                menuCareerEl.textContent = progressMsg;
                menuCareerEl.style.display = 'block';
                menuCareerEl.classList.add('ship-progress-pulse');
            } else {
                menuCareerEl.style.display = 'none';
            }
        } catch (e) { }
    };
    refreshMenuCareerProgress();

    // Show personal best + best sector on the main menu
    const refreshMenuPlayerStats = () => {
        const statsEl = document.getElementById('menu-player-stats');
        if (!statsEl) return;
        try {
            const pb = parseInt(CG.getItem('ALIENSECTOR_PERSONAL_BEST') || '0', 10) || 0;
            const bs = parseInt(CG.getItem('ALIENSECTOR_BEST_SECTOR') || '0', 10) || 0;
            if (pb > 0 || bs > 0) {
                let msg = '';
                if (pb > 0) msg += `⭐ Best Score: ${pb.toLocaleString('en-US')}`;
                if (bs > 0) msg += `${msg ? '  ·  ' : ''}🚀 Best Sector: ${bs}`;
                statsEl.textContent = msg;
            } else {
                statsEl.textContent = '⭐ Play your first round!';
            }
            statsEl.style.display = 'block';
        } catch (e) { statsEl.style.display = 'none'; }
    };
    refreshMenuPlayerStats();

    track('menu_view');

    const playCutsceneThen = (src, onDone, restoreLaunchAfter = false) => {
        if (!launchCutscene || !launchVideo) {
            stopAudioKeepAlive();
            if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
                AudioSys.ctx.resume().catch(() => { });
            }
            onDone();
            return;
        }

        setCutsceneSrc(src);
        launchCutscene.style.display = 'flex';

        try {
            launchVideo.pause();
            launchVideo.currentTime = 0;
        } catch (e) { }

        let finished = false;
        let safety = null;

        const finish = (userTriggered = false) => {
            if (finished) return;
            finished = true;

            if (safety) clearTimeout(safety);

            stopAudioKeepAlive();
            if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
                AudioSys.ctx.resume().catch(() => { });
            }

            try { launchVideo.pause(); } catch (e) { }

            // Audio is already unlocked from the PLAY button tap - proceed directly
            launchCutscene.style.display = 'none';

            if (restoreLaunchAfter) {
                setCutsceneSrc(LAUNCH_SRC);
            }

            onDone();
        };

        launchVideo.onended = () => { track('intro_complete'); finish(false); }; // Natural end, no user trigger

        safety = setTimeout(() => finish(false), 20000);
        launchVideo.onloadedmetadata = () => {
            if (safety) clearTimeout(safety);
            const ms = Math.ceil((launchVideo.duration || 0) * 1000) + 250;
            safety = setTimeout(() => finish(false), Math.max(2000, ms));
        };

        const skip = (e) => {
            e.preventDefault();
            track('intro_skip');
            if (safety) clearTimeout(safety);
            finish(true); // User triggered
        };

        launchCutscene.addEventListener('click', skip, { once: true });
        launchCutscene.addEventListener('touchstart', skip, { passive: false, once: true });

        const p = launchVideo.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {
                if (safety) clearTimeout(safety);
                finish();
            });
        }
    };

    const playLaunchCutsceneThenStart = (onDone) => {
        playCutsceneThen(LAUNCH_SRC, onDone, true);
    };

    const playWelcomeHomeCutsceneThen = (onDone) => {
        playCutsceneThen(WELCOME_SRC, onDone, true);
    };

    const startGame = (difficulty) => {
        const chosenDifficulty = _normalizeDifficulty(difficulty || (() => {
            try { return CG.getItem(DIFFICULTY_KEY); } catch (e) { return 'NORMAL'; }
        })());
        try { CG.setItem(DIFFICULTY_KEY, chosenDifficulty); } catch (e) { }

        console.log('[AlienSector] startGame', chosenDifficulty);


        // Unlock iOS audio from PLAY button click by playing actual sound
        try { AudioSys.unlock(); } catch (e) { }

        AudioSys.init();
        if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') {
            AudioSys.ctx.resume().catch(() => { });
        }
        startAudioKeepAlive();

        // Play startofround.mp3 to unlock iOS audio
        try {
            setTimeout(() => AudioSys.playSound('startofround', 0.5), 50);
        } catch (e) { }

        // Hide the menu background when the game starts (other overlays keep the darker default).
        if (overlay) {
            overlay.classList.remove('menu-bg');
            overlay.classList.remove('overlay-scroll');
            overlay.style.display = 'none';
        }
        if (startContent) startContent.style.display = 'none';
        if (leaderboardView) leaderboardView.style.display = 'none';
        if (gameOverContent) gameOverContent.style.display = 'none';
        if (levelCompleteContent) levelCompleteContent.style.display = 'none';
        if (gameCompleteContent) gameCompleteContent.style.display = 'none';
        const doStart = () => {
            AudioSys.init();

            // Enable the floating joystick on all platforms.
            // Desktop: click + drag on the right side of the screen.
            // Mobile/tablet: touch joystick.
            Joystick.init();

            game.score = 0;
            // EASY mode: 7 lives. NORMAL/HARD: 5 lives.
            const _careerScore = parseInt(CG.getItem('ALIENSECTOR_SCORE_ACCRUED') || '0', 10) || 0;
            game.lives = 5;
            game.scoreMultiplier = 1.0;

            game.difficulty = chosenDifficulty;

            // Clear the last game score so hangar doesn't show stale progress
            try {
                CG.removeItem('ALIENSECTOR_LAST_GAME_SCORE');
            } catch (e) { }

            // Ensure the currently selected ship is applied before starting the run.
            reloadShipFromSelection();

            // Check if this is the player's first time
            const tutorialDone = (() => {
                try { return CG.getItem(TUTORIAL_DONE_KEY) === '1'; } catch (e) { return false; }
            })();

            // Start the level
            // Audio is already unlocked from the PLAY button click and launch video
            CG.gameplayStart();
            track('game_start', { ship: game.shipType || 'HERO', difficulty: chosenDifficulty || 'NORMAL', isBeginner: _careerScore < 50000 });
            game.tutorialActive = !tutorialDone;
            game.startLevel(1);

            // Show the new controls tutorial overlay if first time
            if (!tutorialDone) {
                showControlsTutorial();

                // Play platform-specific tutorial voiceover
                try {
                    const tutorialAudioSrc = isDesktop
                        ? 'assets/sounds/desktoptutorial.mp3'
                        : 'assets/sounds/mobiletutorial.mp3';
                    const tutorialAudio = new Audio(tutorialAudioSrc);
                    tutorialAudio.volume = 0.8;
                    tutorialAudio.play().catch(() => { });
                } catch (e) { }
            }
        };

        // Always play the launch cutscene for every player, every time.
        // The intro video interaction is what reliably unlocks the iOS AudioContext.
        playLaunchCutsceneThenStart(doStart);
    };

    // Called by the splash screen for 1-click play
    window.__astro_startGame = (difficulty) => startGame(difficulty);

    const _readScoreAccrued = () => {
        try {
            const v = parseInt(CG.getItem(LS_SCORE_ACCRUED) || '0', 10);
            return Number.isFinite(v) ? Math.max(0, v) : 0;
        } catch (e) { return 0; }
    };

    const _fmt = (n) => {
        try { return Math.floor(n).toLocaleString('en-US'); } catch (e) { return String(Math.floor(n)); }
    };

    const _syncUnlocksFromTotal = (total) => {
        try {
            const prevWinner = CG.getItem(LS_WINNER_SHIP_UNLOCKED) === '1';
            const prevWarlock = CG.getItem(LS_WARLOCK_SHIP_UNLOCKED) === '1';

            let newlyUnlocked = false;
            if (total >= WINNER_UNLOCK_AT) {
                if (!prevWinner) newlyUnlocked = true;
                CG.setItem(LS_WINNER_SHIP_UNLOCKED, '1');
            }
            if (total >= WARLOCK_UNLOCK_AT) {
                if (!prevWarlock) newlyUnlocked = true;
                CG.setItem(LS_WARLOCK_SHIP_UNLOCKED, '1');
            }

            const prevGhost = CG.getItem('ALIENSECTOR_GHOST_SHIP_UNLOCKED') === '1';
            if (total >= GHOST_UNLOCK_AT) {
                if (!prevGhost) newlyUnlocked = true;
                CG.setItem('ALIENSECTOR_GHOST_SHIP_UNLOCKED', '1');
            }

            if (newlyUnlocked) {
                try { AudioSys.playNewShipUnlocked(); } catch (e) { }
            }
        } catch (e) { }
        return total;
    };

    const _syncUnlocksFromAccrued = () => {
        const total = _readScoreAccrued();
        return _syncUnlocksFromTotal(total);
    };

    const readWinnerUnlocked = () => {
        const total = _syncUnlocksFromAccrued();
        return total >= WINNER_UNLOCK_AT;
    };

    const readWarlockUnlocked = () => {
        const total = _syncUnlocksFromAccrued();
        return total >= WARLOCK_UNLOCK_AT;
    };

    const readGhostUnlocked = () => {
        const total = _syncUnlocksFromAccrued();
        return total >= GHOST_UNLOCK_AT;
    };

    const readSelectedShip = () => {
        try {
            const v = CG.getItem(LS_SELECTED_SHIP);
            return v ? String(v).toUpperCase() : '';
        } catch (e) { return ''; }
    };

    const setSelectedShip = (shipKey) => {
        try { CG.setItem(LS_SELECTED_SHIP, shipKey); } catch (e) { }
    };

    const refreshHangarUI = () => {
        // Query elements fresh each time to ensure they exist
        const hangarHeroAction = document.getElementById('hangar-hero-action');
        const hangarWinnerAction = document.getElementById('hangar-winner-action');
        const hangarWinnerBadge = document.getElementById('hangar-winner-badge');
        const hangarWarlockAction = document.getElementById('hangar-warlock-action');
        const hangarWarlockBadge = document.getElementById('hangar-warlock-badge');
        const hangarGhostAction = document.getElementById('hangar-ghost-action');
        const hangarGhostBadge = document.getElementById('hangar-ghost-badge');
        const hangarHeroCard = document.getElementById('hangar-hero-card');
        const hangarWinnerCard = document.getElementById('hangar-winner-card');
        const hangarWarlockCard = document.getElementById('hangar-warlock-card');
        const hangarGhostCard = document.getElementById('hangar-ghost-card');
        const hangarView = document.getElementById('hangar-view');

        if (!hangarHeroAction || !hangarWinnerAction || !hangarWinnerBadge || !hangarWarlockAction || !hangarWarlockBadge) return;

        // Always sync unlock flags from the committed accrued score first.
        const baseAccrued = _syncUnlocksFromAccrued();

        // Show a projected "this run" score when opening hangar from the sector-success screen.
        // Do not project run score in other flows to avoid double-counting across re-entries.
        let currentRunScore = 0;
        if (hangarReturnTo === 'SECTOR_SUCCESS' && game && !game.isGameOver && typeof game.score === 'number' && game.score > 0) {
            currentRunScore = Math.floor(game.score);
        }

        const accrued = baseAccrued + currentRunScore;

        // Check unlocks based on the total (committed accrued + optional projection)
        const winnerUnlocked = accrued >= WINNER_UNLOCK_AT;
        const warlockUnlocked = accrued >= WARLOCK_UNLOCK_AT;
        const ghostUnlocked = accrued >= GHOST_UNLOCK_AT;

        // IMPORTANT: Don't write the projected score back to LS_SCORE_ACCRUED.
        // Accrued score is committed by the gameplay flow (e.g. on game over).
        // Writing it here would cause double-counting when the commit happens,
        // and also when re-entering the hangar.

        const storedSel = readSelectedShip();

        // Update or create the accrued score progress display
        let progressEl = document.getElementById('hangar-accrued-progress');

        if (!progressEl) {
            // Create the progress element if it doesn't exist
            progressEl = document.createElement('div');
            progressEl.id = 'hangar-accrued-progress';
            progressEl.style.cssText = 'margin: 15px auto 10px auto; padding: 12px 20px; background: rgba(0,0,0,0.5); border: 1px solid rgba(136,255,255,0.3); border-radius: 8px; text-align: center; max-width: 400px;';

            // Insert after the hangar description paragraph
            const hangarDesc = hangarView ? hangarView.querySelector('p') : null;

            if (hangarDesc && hangarDesc.nextSibling) {
                hangarDesc.parentNode.insertBefore(progressEl, hangarDesc.nextSibling);
            } else if (hangarView) {
                const container = hangarView.querySelector('.hangar-container');
                if (container) {
                    hangarView.insertBefore(progressEl, container);
                } else {
                    hangarView.appendChild(progressEl);
                }
            }
        }

        // Build progress display content
        let progressHTML = `<div style="color: #88ffff; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px;">CAREER PROGRESS</div>`;

        if (currentRunScore > 0) {
            progressHTML += `<div style="color: #fff; font-size: 18px; margin-bottom: 6px;">Total Score: <span style="color: #ffd700; font-weight: bold;">${_fmt(accrued)}</span> <span style="color: #88ff88; font-size: 14px;">(+${_fmt(currentRunScore)} this run)</span></div>`;
        } else {
            progressHTML += `<div style="color: #fff; font-size: 18px; margin-bottom: 6px;">Total Accrued Score: <span style="color: #ffd700; font-weight: bold;">${_fmt(accrued)}</span></div>`;
        }

        // Show progress bar to next unlock
        if (!winnerUnlocked) {
            const progress = Math.min(100, (accrued / WINNER_UNLOCK_AT) * 100);
            progressHTML += `<div style="margin-top: 10px; color: #aaa; font-size: 13px;">Next unlock: PHOENIX at ${_fmt(WINNER_UNLOCK_AT)}</div>`;
            progressHTML += `<div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 8px; margin-top: 4px; overflow: hidden;">`;
            progressHTML += `<div style="background: linear-gradient(90deg, #ffaa00, #ffd700); height: 100%; width: ${progress.toFixed(1)}%; transition: width 0.3s;"></div>`;
            progressHTML += `</div>`;
            progressHTML += `<div style="color: #888; font-size: 12px; margin-top: 4px;">${_fmt(Math.max(0, WINNER_UNLOCK_AT - accrued))} more points needed</div>`;
        } else if (!warlockUnlocked) {
            const progress = Math.min(100, (accrued / WARLOCK_UNLOCK_AT) * 100);
            progressHTML += `<div style="margin-top: 10px; color: #aaa; font-size: 13px;">Next unlock: WARLOCK at ${_fmt(WARLOCK_UNLOCK_AT)}</div>`;
            progressHTML += `<div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 8px; margin-top: 4px; overflow: hidden;">`;
            progressHTML += `<div style="background: linear-gradient(90deg, #8800ff, #bb66ff); height: 100%; width: ${progress.toFixed(1)}%; transition: width 0.3s;"></div>`;
            progressHTML += `</div>`;
            progressHTML += `<div style="color: #888; font-size: 12px; margin-top: 4px;">${_fmt(Math.max(0, WARLOCK_UNLOCK_AT - accrued))} more points needed</div>`;
        } else if (!ghostUnlocked) {
            const progress = Math.min(100, (accrued / GHOST_UNLOCK_AT) * 100);
            progressHTML += `<div style="margin-top: 10px; color: #aaa; font-size: 13px;">Next unlock: GHOST at ${_fmt(GHOST_UNLOCK_AT)}</div>`;
            progressHTML += `<div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 8px; margin-top: 4px; overflow: hidden;">`;
            progressHTML += `<div style="background: linear-gradient(90deg, #00cccc, #88ffee); height: 100%; width: ${progress.toFixed(1)}%; transition: width 0.3s;"></div>`;
            progressHTML += `</div>`;
            progressHTML += `<div style="color: #888; font-size: 12px; margin-top: 4px;">${_fmt(Math.max(0, GHOST_UNLOCK_AT - accrued))} more points needed</div>`;
        } else {
            progressHTML += `<div style="margin-top: 8px; color: #44ff44; font-size: 14px;">✓ All ships unlocked!</div>`;
        }

        progressEl.innerHTML = progressHTML;

        let activeShip = 'HERO';
        if (storedSel === 'GHOST' && ghostUnlocked) activeShip = 'GHOST';
        else if (storedSel === 'WARLOCK' && warlockUnlocked) activeShip = 'WARLOCK';
        else if (storedSel === 'WINNER' && winnerUnlocked) activeShip = 'WINNER';
        else if (storedSel === 'HERO') activeShip = 'HERO';
        else if (!storedSel) {
            if (ghostUnlocked) activeShip = 'GHOST';
            else if (warlockUnlocked) activeShip = 'WARLOCK';
            else if (winnerUnlocked) activeShip = 'WINNER';
            else activeShip = 'HERO';
        } else {
            if (ghostUnlocked) activeShip = 'GHOST';
            else if (warlockUnlocked) activeShip = 'WARLOCK';
            else if (winnerUnlocked) activeShip = 'WINNER';
            else activeShip = 'HERO';
        }

        // Card highlight and locked dim
        if (hangarHeroCard) {
            hangarHeroCard.classList.toggle('is-active-ship', activeShip === 'HERO');
            hangarHeroCard.classList.remove('is-locked-card');
        }
        if (hangarWinnerCard) {
            hangarWinnerCard.classList.toggle('is-active-ship', activeShip === 'WINNER');
            hangarWinnerCard.classList.toggle('is-locked-card', !winnerUnlocked);
        }
        if (hangarWarlockCard) {
            hangarWarlockCard.classList.toggle('is-active-ship', activeShip === 'WARLOCK');
            hangarWarlockCard.classList.toggle('is-locked-card', !warlockUnlocked);
        }
        if (hangarGhostCard) {
            hangarGhostCard.classList.toggle('is-active-ship', activeShip === 'GHOST');
            hangarGhostCard.classList.toggle('is-locked-card', !ghostUnlocked);
        }

        // Hero card button
        if (activeShip === 'HERO') {
            hangarHeroAction.textContent = 'ACTIVE';
            hangarHeroAction.disabled = true;
            hangarHeroAction.classList.add('is-active');
        } else {
            hangarHeroAction.textContent = 'SELECT';
            hangarHeroAction.disabled = false;
            hangarHeroAction.classList.remove('is-active');
        }

        // Winner card badge + button
        if (!winnerUnlocked) {
            hangarWinnerBadge.textContent = `${_fmt(Math.min(accrued, WINNER_UNLOCK_AT))} / ${_fmt(WINNER_UNLOCK_AT)}`;
            hangarWinnerBadge.classList.add('ship-card-badge-locked');
            hangarWinnerBadge.classList.remove('ship-card-badge-unlocked');

            hangarWinnerAction.textContent = 'LOCKED';
            hangarWinnerAction.disabled = true;
            hangarWinnerAction.classList.remove('is-active');
            hangarWinnerAction.classList.add('is-locked');
        } else {
            hangarWinnerBadge.textContent = 'UNLOCKED';
            hangarWinnerBadge.classList.remove('ship-card-badge-locked');
            hangarWinnerBadge.classList.add('ship-card-badge-unlocked');

            hangarWinnerAction.classList.remove('is-locked');
            if (activeShip === 'WINNER') {
                hangarWinnerAction.textContent = 'ACTIVE';
                hangarWinnerAction.disabled = true;
                hangarWinnerAction.classList.add('is-active');
            } else {
                hangarWinnerAction.textContent = 'SELECT';
                hangarWinnerAction.disabled = false;
                hangarWinnerAction.classList.remove('is-active');
            }
        }

        // Warlock card badge + button
        if (!warlockUnlocked) {
            hangarWarlockBadge.textContent = `${_fmt(Math.min(accrued, WARLOCK_UNLOCK_AT))} / ${_fmt(WARLOCK_UNLOCK_AT)}`;
            hangarWarlockBadge.classList.add('ship-card-badge-locked');
            hangarWarlockBadge.classList.remove('ship-card-badge-unlocked');

            hangarWarlockAction.textContent = 'LOCKED';
            hangarWarlockAction.disabled = true;
            hangarWarlockAction.classList.remove('is-active');
            hangarWarlockAction.classList.add('is-locked');
        } else {
            hangarWarlockBadge.textContent = 'UNLOCKED';
            hangarWarlockBadge.classList.remove('ship-card-badge-locked');
            hangarWarlockBadge.classList.add('ship-card-badge-unlocked');

            hangarWarlockAction.classList.remove('is-locked');
            if (activeShip === 'WARLOCK') {
                hangarWarlockAction.textContent = 'ACTIVE';
                hangarWarlockAction.disabled = true;
                hangarWarlockAction.classList.add('is-active');
            } else {
                hangarWarlockAction.textContent = 'SELECT';
                hangarWarlockAction.disabled = false;
                hangarWarlockAction.classList.remove('is-active');
            }
        }

        // Ghost card badge + button
        if (hangarGhostAction && hangarGhostBadge) {
            if (!ghostUnlocked) {
                hangarGhostBadge.textContent = `${_fmt(Math.min(accrued, GHOST_UNLOCK_AT))} / ${_fmt(GHOST_UNLOCK_AT)}`;
                hangarGhostBadge.classList.add('ship-card-badge-locked');
                hangarGhostBadge.classList.remove('ship-card-badge-unlocked');

                hangarGhostAction.textContent = 'LOCKED';
                hangarGhostAction.disabled = true;
                hangarGhostAction.classList.remove('is-active');
                hangarGhostAction.classList.add('is-locked');
            } else {
                hangarGhostBadge.textContent = 'UNLOCKED';
                hangarGhostBadge.classList.remove('ship-card-badge-locked');
                hangarGhostBadge.classList.add('ship-card-badge-unlocked');

                hangarGhostAction.classList.remove('is-locked');
                if (activeShip === 'GHOST') {
                    hangarGhostAction.textContent = 'ACTIVE';
                    hangarGhostAction.disabled = true;
                    hangarGhostAction.classList.add('is-active');
                } else {
                    hangarGhostAction.textContent = 'SELECT';
                    hangarGhostAction.disabled = false;
                    hangarGhostAction.classList.remove('is-active');
                }
            }
        }

        // ========== DYNAMIC SHIP STATS ==========
        // These values should match Ship.js configuration exactly.
        // Base values for percentage calculations: maxHp=100, speedMult=1.0, fireRateMult=1.0
        const SHIP_STATS = {
            HERO: {
                maxHp: 200,       // 200% relative to base 100
                speedMult: 0.75, // 75% speed
                fireRateMult: 1.0 // 100% (lower is faster, so we invert for display)
            },
            PHOENIX: {
                maxHp: 50,       // 50% health
                speedMult: 1.5,  // 150% speed
                fireRateMult: 0.7 // 0.7 = 143% blaster (faster fire rate)
            },
            WARLOCK: {
                maxHp: 100,      // 100% health
                speedMult: 1.5,  // 150% speed (matches Phoenix)
                fireRateMult: 1.0 // 100% blaster
            },
            GHOST: {
                maxHp: 113,      // 113% health
                speedMult: 1.2,  // 120% speed
                fireRateMult: 1.0 // 100% blaster
            }
        };

        // Helper to set a stat bar width
        const setStatBar = (barId, percent, barMax = 200) => {
            const bar = document.getElementById(barId);
            if (bar) bar.style.width = `${Math.min(100, (percent / barMax) * 100)}%`;
        };

        // Calculate blaster percentage (lower fireRateMult = faster = better, so invert)
        const blasterPercent = (fireRateMult) => Math.round((1 / fireRateMult) * 100);

        // Hero stats
        setStatBar('hero-health-bar', SHIP_STATS.HERO.maxHp);
        setStatBar('hero-speed-bar', Math.round(SHIP_STATS.HERO.speedMult * 100), 150);
        setStatBar('hero-blaster-bar', blasterPercent(SHIP_STATS.HERO.fireRateMult), 150);

        // Phoenix stats
        setStatBar('phoenix-health-bar', SHIP_STATS.PHOENIX.maxHp);
        setStatBar('phoenix-speed-bar', Math.round(SHIP_STATS.PHOENIX.speedMult * 100), 150);
        setStatBar('phoenix-blaster-bar', blasterPercent(SHIP_STATS.PHOENIX.fireRateMult), 150);

        // Warlock stats
        setStatBar('warlock-health-bar', SHIP_STATS.WARLOCK.maxHp);
        setStatBar('warlock-speed-bar', Math.round(SHIP_STATS.WARLOCK.speedMult * 100), 150);
        setStatBar('warlock-blaster-bar', blasterPercent(SHIP_STATS.WARLOCK.fireRateMult), 150);

        // Ghost stats
        setStatBar('ghost-health-bar', SHIP_STATS.GHOST.maxHp);
        setStatBar('ghost-speed-bar', Math.round(SHIP_STATS.GHOST.speedMult * 100), 150);
        setStatBar('ghost-blaster-bar', blasterPercent(SHIP_STATS.GHOST.fireRateMult), 150);
    };

    // Ensure hangar reads the latest score/unlock state before opening (fix for sector-success -> hangar)
    const primeHangarStateForCurrentRun = (context = 'MENU') => {
        // Ensure unlocks reflect the best known total, without mutating accrued score.
        // - MENU: use accrued + last completed run
        // - SECTOR_SUCCESS / mid-run: use accrued + current run score (projected)
        const accrued = _readScoreAccrued();
        let projected = accrued;

        if (game && (context === 'SECTOR_SUCCESS' || (game.isPlaying && !game.isGameOver))) {
            projected += Math.max(0, (game.score || 0));
        } else {
            try {
                const lastRun = parseInt(CG.getItem('ALIENSECTOR_LAST_GAME_SCORE') || '0', 10);
                projected += Math.max(0, lastRun);
            } catch (e) { }
        }

        _syncUnlocksFromTotal(projected);
    };


    let hangarReturnTo = 'MENU';
    const showHangar = (returnTo = 'MENU') => {
        // Menu/hangar is a gameplay break
        CG.gameplayStop();
        if (!overlay || !hangarView || !startContent) return;

        hangarReturnTo = returnTo;
        overlay.style.display = 'flex';
        overlay.classList.add('menu-bg');
        overlay.classList.add('overlay-scroll');

        hangarView.style.display = 'flex';
        startContent.style.display = 'none';
        if (leaderboardView) leaderboardView.style.display = 'none';

        if (joystickZone) joystickZone.style.pointerEvents = 'none';
        if (gameOverContent) gameOverContent.style.display = 'none';
        if (levelCompleteContent) levelCompleteContent.style.display = 'none';
        if (gameCompleteContent) gameCompleteContent.style.display = 'none';
        if (victoryStatsContent) victoryStatsContent.style.display = 'none';

        // Use requestAnimationFrame to ensure the hangar view is fully rendered before refreshing UI
        requestAnimationFrame(() => {
            refreshHangarUI();
            // Additional delayed refreshes to handle any remaining timing issues
            setTimeout(() => refreshHangarUI(), 50);
            setTimeout(() => refreshHangarUI(), 150);
        });

        // Animate the stat bars each time the hangar is opened.
        hangarView.classList.remove('stats-animate');
        requestAnimationFrame(() => hangarView.classList.add('stats-animate'));
    };

    const backFromHangar = () => {
        if (!hangarView) return;
        hangarView.classList.remove('stats-animate');
        hangarView.style.display = 'none';
        if (overlay) {
            overlay.classList.add('menu-bg');
            overlay.classList.remove('overlay-scroll');
        }

        if (hangarReturnTo === 'GAMEOVER') {
            if (gameOverContent) gameOverContent.style.display = 'flex';
        } else if (hangarReturnTo === 'VICTORY') {
            if (gameCompleteContent) gameCompleteContent.style.display = 'flex';
        } else if (hangarReturnTo === 'SECTOR_SUCCESS') {
            // Return to sector success screen and reload the ship with new selection
            if (levelCompleteContent) levelCompleteContent.style.display = 'flex';
            // Reload ship configuration based on new selection
            reloadShipFromSelection();
        } else {
            if (startContent) startContent.style.display = 'flex';
            refreshMenuCareerProgress();
            refreshMenuPlayerStats();
        }

        if (joystickZone) joystickZone.style.pointerEvents = 'auto';
    };

    // Reload the ship's configuration when changing ships mid-game (from sector success screen)
    const reloadShipFromSelection = () => {
        if (!game || !game.ship) return;

        const selectedShip = readSelectedShip();
        const winnerUnlocked = readWinnerUnlocked();
        const warlockUnlocked = readWarlockUnlocked();
        const ghostUnlocked = readGhostUnlocked();

        // Determine which ship to use based on selection and unlocks
        let isWinnerShip = false;
        let isWarlockShip = false;
        let isGhostShip = false;

        if (selectedShip === 'GHOST' && ghostUnlocked) {
            isGhostShip = true;
        } else if (selectedShip === 'WARLOCK' && warlockUnlocked) {
            isWarlockShip = true;
        } else if (selectedShip === 'WINNER' && winnerUnlocked) {
            isWinnerShip = true;
        } else if (selectedShip === 'HERO') {
            // Hero ship
        } else {
            // No explicit selection or invalid - use best unlocked
            if (ghostUnlocked) isGhostShip = true;
            else if (warlockUnlocked) isWarlockShip = true;
            else if (winnerUnlocked) isWinnerShip = true;
        }

        // Update ship flags
        game.ship.isWinnerShip = isWinnerShip;
        game.ship.isHardWinnerShip = false;
        game.ship.isWarlockShip = isWarlockShip;
        game.ship.isGhostShip = isGhostShip;
        game.ship.winnerShipUnlocked = winnerUnlocked;
        game.ship.warlockShipUnlocked = warlockUnlocked;
        game.ship.ghostShipUnlocked = ghostUnlocked;

        // Set game.shipType for telemetry tracking
        if (isGhostShip) game.shipType = 'GHOST';
        else if (isWarlockShip) game.shipType = 'WARLOCK';
        else if (isWinnerShip) game.shipType = 'WINNER';
        else game.shipType = 'HERO';

        // Update ship stats based on new selection
        if (isGhostShip) {
            game.ship.maxHp = 113;
            game.ship.speedMult = 1.2;
            game.ship.permanentFireRateMult = 1.0;
        } else if (isWarlockShip) {
            game.ship.maxHp = 100;
            game.ship.speedMult = 1.0;
            game.ship.permanentFireRateMult = 1.0;
        } else if (isWinnerShip) {
            game.ship.maxHp = 50;
            game.ship.speedMult = 1.5;
            game.ship.permanentFireRateMult = 0.7;
        } else {
            // Hero ship
            game.ship.maxHp = 200;
            game.ship.speedMult = 0.75;
            game.ship.permanentFireRateMult = 1.0;
        }

        // Reset HP to new max (full heal on ship change)
        game.ship.hp = game.ship.maxHp;

        // Update mind control radius (Ghost has smaller radius)
        const minDim = Math.min(game.width, game.height);
        const fullRadius = Math.max(120, Math.min(230, minDim * 0.24));
        game.ship.mindControlRadius = isGhostShip ? fullRadius * 0.4125 : fullRadius;
    };

    let leaderboardReturnTo = 'MENU';
    const showLeaderboard = (returnTo = 'MENU', stopGameplay = true) => {
        // Menu/leaderboard is a gameplay break (unless viewing mid-run from sector success)
        if (stopGameplay) CG.gameplayStop();
        leaderboardReturnTo = returnTo;
        if (!overlay || !leaderboardView || !startContent) return;
        overlay.style.display = 'flex';
        overlay.classList.add('menu-bg');
        overlay.classList.add('overlay-scroll');
        leaderboardView.style.display = 'flex';
        if (hangarView) hangarView.style.display = 'none';
        startContent.style.display = 'none';

        if (joystickZone) joystickZone.style.pointerEvents = 'none';
        if (gameOverContent) gameOverContent.style.display = 'none';
        if (levelCompleteContent) levelCompleteContent.style.display = 'none';
        if (gameCompleteContent) gameCompleteContent.style.display = 'none';
        Leaderboard.render('leaderboard-list');
        GlobalLeaderboard.renderGlobalInto('leaderboard-entries').catch(() => { });
    };

    // World record celebration (shown when the player beats the global record in the played difficulty)
    const _normalizeDifficulty = (d) => { const v = String(d || 'NORMAL').toUpperCase(); return v === 'HARD' ? 'HARD' : v === 'EASY' ? 'EASY' : 'NORMAL'; };

    const _ensureWorldRecordCelebrationEl = () => {
        let el = document.getElementById('world-record-celebration');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'world-record-celebration';
        el.innerHTML = `
            <div class="wr-confetti" aria-hidden="true"></div>
            <div class="wr-wrap" role="status" aria-live="polite">
                <div class="wr-title">NEW GLOBAL RECORD</div>
                <p class="wr-sub">Difficulty: <b id="wr-diff">NORMAL</b><br>Score: <b id="wr-score">0</b> (previous best: <b id="wr-prev">0</b>)</p>
            </div>
        `;
        document.body.appendChild(el);
        return el;
    };

    const _spawnWorldRecordConfetti = (confettiEl) => {
        if (!confettiEl) return;
        confettiEl.innerHTML = '';
        const colors = [
            'rgba(255,255,255,0.95)',
            'rgba(0,200,255,0.95)',
            'rgba(255,200,0,0.95)',
            'rgba(176,0,255,0.95)'
        ];
        const pieces = 28;
        for (let i = 0; i < pieces; i++) {
            const p = document.createElement('div');
            p.className = 'wr-piece';
            const left = Math.random() * 100;
            const w = 6 + Math.random() * 7;
            const h = 12 + Math.random() * 14;
            const dur = 1150 + Math.random() * 650;
            const delay = Math.random() * 240;

            p.style.left = left.toFixed(2) + 'vw';
            p.style.width = w.toFixed(1) + 'px';
            p.style.height = h.toFixed(1) + 'px';
            p.style.background = colors[(Math.random() * colors.length) | 0];
            p.style.animationDuration = dur.toFixed(0) + 'ms';
            p.style.animationDelay = delay.toFixed(0) + 'ms';
            p.style.transform = 'rotate(' + ((Math.random() * 360) | 0) + 'deg)';
            confettiEl.appendChild(p);
        }
    };

    const showWorldRecordCelebration = async (difficulty, score, prevBest) => {
        const d = _normalizeDifficulty(difficulty);
        const el = _ensureWorldRecordCelebrationEl();
        const conf = el.querySelector('.wr-confetti');
        const wrap = el.querySelector('.wr-wrap');
        const diffEl = el.querySelector('#wr-diff');
        const scoreEl = el.querySelector('#wr-score');
        const prevEl = el.querySelector('#wr-prev');

        if (diffEl) diffEl.textContent = d;
        if (scoreEl) scoreEl.textContent = String(score);
        if (prevEl) prevEl.textContent = String(prevBest);

        _spawnWorldRecordConfetti(conf);

        // Restart pop animation reliably
        if (wrap) {
            wrap.style.animation = 'none';
            // force reflow
            void wrap.offsetHeight;
            wrap.style.animation = '';
        }

        el.style.display = 'flex';

        try { AudioSys.playGoodJobNewRecord && AudioSys.playGoodJobNewRecord(); } catch (e) { }
        try { AudioSys.playAudience(); } catch (e) { }

        await new Promise(resolve => setTimeout(resolve, 1800));

        el.style.display = 'none';
    };


    // Make available globally for Game.js to use
    window.displayLeaderboard = showLeaderboard;

    const backToStartFromLeaderboard = () => {
        if (!leaderboardView || !startContent) return;
        leaderboardView.style.display = 'none';

        // Return to the correct screen based on where we came from
        if (leaderboardReturnTo === 'SECTOR_SUCCESS') {
            if (levelCompleteContent) levelCompleteContent.style.display = 'flex';
        } else if (leaderboardReturnTo === 'GAMEOVER') {
            if (gameOverContent) gameOverContent.style.display = 'flex';
        } else if (leaderboardReturnTo === 'VICTORY') {
            if (gameCompleteContent) gameCompleteContent.style.display = 'flex';
        } else {
            startContent.style.display = 'flex';
            refreshMenuCareerProgress();
        }

        if (overlay) {
            overlay.classList.add('menu-bg');
            overlay.classList.remove('overlay-scroll');
        }

        if (joystickZone) joystickZone.style.pointerEvents = 'auto';
        AudioSys.stopLeaderboardMusic();
        stopLeaderboardAudioEl();
    };

    // Menu difficulty selector — segmented button group
    const diffSelect = document.getElementById('menu-difficulty');
    if (diffSelect) {
        // Expose a .value property so the rest of the code works unchanged
        diffSelect.value = 'EASY';

        const diffBtns = diffSelect.querySelectorAll('.diff-seg-btn');

        const setActiveDiff = (val) => {
            diffSelect.value = val;
            diffBtns.forEach(b => b.classList.toggle('is-active', b.dataset.diff === val));
            try { CG.setItem(DIFFICULTY_KEY, val); } catch (e) { }
        };

        // Restore persisted difficulty
        try {
            const stored = CG.getItem(DIFFICULTY_KEY);
            if (stored) setActiveDiff(_normalizeDifficulty(stored));
        } catch (e) { }

        // Wire up click handlers
        diffBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                setActiveDiff(btn.dataset.diff);
            });
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault(); e.stopPropagation();
                setActiveDiff(btn.dataset.diff);
            }, { passive: false });
        });
    }

    // Start game with selected difficulty (fix: don't hardcode NORMAL)
    if (startBtn) {
        const handleStart = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            const selectedDiff = diffSelect ? diffSelect.value : 'EASY';
            startGame(selectedDiff);
        };
        startBtn.addEventListener('click', handleStart);
        startBtn.addEventListener('touchstart', handleStart, { passive: false });
    }

    if (hangarBtn) {
        const handleHangar = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            AudioSys.unlock();
            primeHangarStateForCurrentRun('MENU');
            showHangar('MENU');
        };
        hangarBtn.addEventListener('click', handleHangar);
        hangarBtn.addEventListener('touchstart', handleHangar, { passive: false });
    }

    if (leaderboardBtn) {
        const handleLb = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            AudioSys.unlock();
            showLeaderboard();
        };
        leaderboardBtn.addEventListener('click', handleLb);
        leaderboardBtn.addEventListener('touchstart', handleLb, { passive: false });
    }

    if (leaderboardBackBtn) {
        const handleLbBack = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            backToStartFromLeaderboard();
        };
        leaderboardBackBtn.addEventListener('click', handleLbBack);
        leaderboardBackBtn.addEventListener('touchstart', handleLbBack, { passive: false });
    }

    if (hangarBackBtn) {
        const handleHangarBack = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            backFromHangar();
        };
        hangarBackBtn.addEventListener('click', handleHangarBack);
        hangarBackBtn.addEventListener('touchstart', handleHangarBack, { passive: false });
    }

    if (gameOverHangarBtn) gameOverHangarBtn.addEventListener('click', () => { primeHangarStateForCurrentRun('GAMEOVER'); showHangar('GAMEOVER'); });
    if (victoryHangarBtn) victoryHangarBtn.addEventListener('click', () => { primeHangarStateForCurrentRun('VICTORY'); showHangar('VICTORY'); });
    if (sectorSuccessHangarBtn) sectorSuccessHangarBtn.addEventListener('click', () => { primeHangarStateForCurrentRun('SECTOR_SUCCESS'); showHangar('SECTOR_SUCCESS'); });

    if (comebackAcceptBtn) {
        const onAccept = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (game && typeof game.acceptComebackContract === 'function') game.acceptComebackContract();
        };
        comebackAcceptBtn.addEventListener('click', onAccept);
        comebackAcceptBtn.addEventListener('touchstart', onAccept, { passive: false });
    }
    if (comebackSkipBtn) {
        const onSkip = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (game && typeof game.skipComebackContract === 'function') game.skipComebackContract();
        };
        comebackSkipBtn.addEventListener('click', onSkip);
        comebackSkipBtn.addEventListener('touchstart', onSkip, { passive: false });
    }

    if (comebackReturnBtn) {
        const onReturn = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (game && typeof game.returnFromComebackContract === 'function') game.returnFromComebackContract();
        };
        comebackReturnBtn.addEventListener('click', onReturn);
        comebackReturnBtn.addEventListener('touchstart', onReturn, { passive: false });
    }


    if (hangarHeroAction) hangarHeroAction.addEventListener('click', () => {
        setSelectedShip('HERO');
        refreshHangarUI();
    });
    if (hangarWinnerAction) hangarWinnerAction.addEventListener('click', () => {
        if (hangarWinnerAction.disabled) return;
        setSelectedShip('WINNER');
        refreshHangarUI();
    });

    if (hangarWarlockAction) hangarWarlockAction.addEventListener('click', () => {
        if (hangarWarlockAction.disabled) return;
        setSelectedShip('WARLOCK');
        refreshHangarUI();
    });

    const hangarGhostAction = document.getElementById('hangar-ghost-action');
    if (hangarGhostAction) hangarGhostAction.addEventListener('click', () => {
        if (hangarGhostAction.disabled) return;
        setSelectedShip('GHOST');
        refreshHangarUI();
    });

    const gameoverLeaderboardBtn = document.getElementById('gameover-leaderboard-btn');
    if (gameoverLeaderboardBtn) gameoverLeaderboardBtn.addEventListener('click', () => {
        if (gameOverContent) gameOverContent.style.display = 'none';
        showLeaderboard('GAMEOVER');
    });

    const victoryLeaderboardBtn = document.getElementById('victory-leaderboard-btn');
    if (victoryLeaderboardBtn) victoryLeaderboardBtn.addEventListener('click', () => {
        if (gameCompleteContent) gameCompleteContent.style.display = 'none';
        showLeaderboard('VICTORY');
    });

    const sectorSuccessLeaderboardBtn = document.getElementById('sector-success-leaderboard-btn');
    if (sectorSuccessLeaderboardBtn) sectorSuccessLeaderboardBtn.addEventListener('click', () => {
        if (levelCompleteContent) levelCompleteContent.style.display = 'none';
        // Don't stop gameplay when viewing leaderboard from sector success (mid-run)
        showLeaderboard('SECTOR_SUCCESS', false);
    });

    const _globalQual = {
        allowGlobalGameOver: true,
        allowGlobalVictory: true,
        lastKeyGameOver: '',
        lastKeyVictory: '',
        skipKeyGameOver: '',
        skipKeyVictory: '',
        defaultSubmitText: null,
        defaultSubmitTextVictory: null,
        defaultPromptText: null,
        defaultPromptTextVictory: null
    };

    const _scoreKeyNow = () => {
        const score = Math.floor(game.score || 0);
        const difficulty = String(game.difficulty || 'NORMAL').toUpperCase();
        return { score, difficulty, key: `${difficulty}|${score}` };
    };

    const _isVisible = (el) => {
        if (!el) return false;
        const cs = window.getComputedStyle(el);
        return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };

    const _setNamePromptMode = (mode, which) => {
        const isVictory = which === 'victory';

        const hsId = isVictory ? 'high-score-input-victory' : 'high-score-input';
        const inputId = isVictory ? 'player-name-input-victory' : 'player-name-input';
        const btnId = isVictory ? 'submit-score-btn-victory' : 'submit-score-btn';
        const restartId = isVictory ? 'victory-restart-btn' : 'restart-btn';

        const hsDiv = document.getElementById(hsId);
        const inputEl = document.getElementById(inputId);
        const btnEl = document.getElementById(btnId);
        const restartEl = document.getElementById(restartId);
        const promptEl = hsDiv ? hsDiv.querySelector('p') : null;

        if (btnEl) {
            if (isVictory) {
                if (_globalQual.defaultSubmitTextVictory == null) _globalQual.defaultSubmitTextVictory = btnEl.innerText;
            } else {
                if (_globalQual.defaultSubmitText == null) _globalQual.defaultSubmitText = btnEl.innerText;
            }
        }

        if (promptEl) {
            if (isVictory) {
                if (_globalQual.defaultPromptTextVictory == null) _globalQual.defaultPromptTextVictory = promptEl.innerText;
            } else {
                if (_globalQual.defaultPromptText == null) _globalQual.defaultPromptText = promptEl.innerText;
            }
        }

        if (mode === 'checking') {
            if (hsDiv) hsDiv.style.display = 'flex';
            if (restartEl) restartEl.style.display = 'none';

            if (promptEl) promptEl.innerText = 'CHECKING GLOBAL LEADERBOARD...';
            if (inputEl) {
                try { inputEl.blur(); } catch (e) { }
                inputEl.value = '';
                inputEl.style.display = 'none';
            }
            if (btnEl) {
                btnEl.disabled = true;
                btnEl.innerText = 'CHECKING...';
            }
            return;
        }

        if (mode === 'needName') {
            try {
                if (AudioSys.playGoodJobLeaderboards) {
                    const gateKey = isVictory ? 'v' : 'g';
                    const gateScoreKey = gateKey + ':' + String(difficulty) + ':' + String(score);
                    if (!window.__as_lastQualVO || window.__as_lastQualVO !== gateScoreKey) {
                        window.__as_lastQualVO = gateScoreKey;
                        AudioSys.playGoodJobLeaderboards();
                    }
                }
            } catch (e) { }

            if (hsDiv) hsDiv.style.display = 'flex';
            if (restartEl) restartEl.style.display = 'none';

            if (promptEl) promptEl.innerText = isVictory
                ? (_globalQual.defaultPromptTextVictory || promptEl.innerText)
                : (_globalQual.defaultPromptText || promptEl.innerText);

            if (inputEl) inputEl.style.display = '';
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerText = isVictory
                    ? (_globalQual.defaultSubmitTextVictory || btnEl.innerText)
                    : (_globalQual.defaultSubmitText || btnEl.innerText);
            }
            return;
        }

        // mode === 'noNameNeeded'
        if (inputEl) {
            try { inputEl.blur(); } catch (e) { }
            inputEl.value = '';
            inputEl.style.display = 'none';
        }
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerText = isVictory
                ? (_globalQual.defaultSubmitTextVictory || btnEl.innerText)
                : (_globalQual.defaultSubmitText || btnEl.innerText);
        }
        if (promptEl) promptEl.innerText = isVictory
            ? (_globalQual.defaultPromptTextVictory || promptEl.innerText)
            : (_globalQual.defaultPromptText || promptEl.innerText);

        if (hsDiv) hsDiv.style.display = 'none';
        if (restartEl) restartEl.style.display = 'block';
    };

    const _applyGlobalQualGate = async (which) => {
        const isVictory = which === 'victory';
        const hsId = isVictory ? 'high-score-input-victory' : 'high-score-input';
        const hsDiv = document.getElementById(hsId);
        if (!_isVisible(hsDiv)) return;

        const { score, difficulty, key } = _scoreKeyNow();

        // If the player already skipped name entry for this score, don't pop it up again.
        const skipKey = isVictory ? _globalQual.skipKeyVictory : _globalQual.skipKeyGameOver;
        if (skipKey === key) {
            _setNamePromptMode('noNameNeeded', which);
            return;
        }

        if (isVictory) {
            if (_globalQual.lastKeyVictory === key) return;
            _globalQual.lastKeyVictory = key;
        } else {
            if (_globalQual.lastKeyGameOver === key) return;
            _globalQual.lastKeyGameOver = key;
        }

        _setNamePromptMode('checking', which);

        if (!GlobalLeaderboard || typeof GlobalLeaderboard.fetchTopScores !== 'function') {
            if (isVictory) _globalQual.allowGlobalVictory = true;
            else _globalQual.allowGlobalGameOver = true;

            // Player might have pressed SKIP while we were checking.
            const _skipKey = isVictory ? _globalQual.skipKeyVictory : _globalQual.skipKeyGameOver;
            if (_skipKey === key) {
                _setNamePromptMode('noNameNeeded', which);
                return;
            }

            _setNamePromptMode('needName', which);
            return;
        }

        try {
            // FIX: If it is VICTORY, we always qualify. Skip the fetch check.
            let qualifies = true;

            if (!isVictory) {
                const top = await GlobalLeaderboard.fetchTopScores(difficulty, 20);
                if (Array.isArray(top) && top.length >= 20) {
                    const worst = top[top.length - 1];
                    const worstScore = Math.floor(Number(worst && worst.score ? worst.score : 0));
                    qualifies = score >= worstScore;
                }
            } else {
                // Victory always qualifies for global submission
                qualifies = true;
            }

            if (isVictory) _globalQual.allowGlobalVictory = qualifies;
            else _globalQual.allowGlobalGameOver = qualifies;

            // Player might have pressed SKIP while the fetch was in-flight.
            const _skipKey = isVictory ? _globalQual.skipKeyVictory : _globalQual.skipKeyGameOver;
            if (_skipKey === key) {
                _setNamePromptMode('noNameNeeded', which);
                return;
            }

            if (!qualifies) _setNamePromptMode('noNameNeeded', which);
            else _setNamePromptMode('needName', which);
        } catch (e) {
            // If network fails, default to allowing input
            if (isVictory) _globalQual.allowGlobalVictory = true;
            else _globalQual.allowGlobalGameOver = true;

            const _skipKey = isVictory ? _globalQual.skipKeyVictory : _globalQual.skipKeyGameOver;
            if (_skipKey === key) {
                _setNamePromptMode('noNameNeeded', which);
                return;
            }

            _setNamePromptMode('needName', which);
        }
    };

    const _watchGate = (id, which) => {
        const el = document.getElementById(id);
        if (!el) return;
        const obs = new MutationObserver(() => _applyGlobalQualGate(which));
        obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    };
    _watchGate('high-score-input', 'gameover');
    _watchGate('high-score-input-victory', 'victory');

    const skipScoreBtn = document.getElementById('skip-score-btn');
    if (skipScoreBtn) {
        skipScoreBtn.addEventListener('click', () => {
            const { key } = _scoreKeyNow();
            _globalQual.skipKeyGameOver = key;
            _setNamePromptMode('noNameNeeded', 'gameover');
        });
    }

    const skipScoreBtnVictory = document.getElementById('skip-score-btn-victory');
    if (skipScoreBtnVictory) {
        skipScoreBtnVictory.addEventListener('click', () => {
            const { key } = _scoreKeyNow();
            _globalQual.skipKeyVictory = key;
            _setNamePromptMode('noNameNeeded', 'victory');
        });
    }

    const nameInput = document.getElementById('player-name-input');
    const submitScoreBtn = document.getElementById('submit-score-btn');
    if (submitScoreBtn && nameInput) {
        submitScoreBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                const { key } = _scoreKeyNow();
                _globalQual.skipKeyGameOver = key;
                _setNamePromptMode('noNameNeeded', 'gameover');
                return;
            }

            Leaderboard.addScore(name, game.score, game.difficulty);
            Leaderboard.render('leaderboard-list');


            const __wrDiff = _normalizeDifficulty(game.difficulty);
            const __prevWorldBest = GlobalLeaderboard.getWorldBest(__wrDiff);
            let __globalSubmitted = false;

            if (_globalQual.allowGlobalGameOver) {
                try {
                    await GlobalLeaderboard.submitScore({
                        name,
                        score: game.score,
                        difficulty: game.difficulty
                    });
                    __globalSubmitted = true;
                } catch (e) {
                    console.warn('[GlobalLeaderboard] submit failed:', e && e.message ? e.message : e);
                }
            }

            if (__globalSubmitted && game.score > __prevWorldBest) {
                // Update cached world best immediately so other UI reflects it.
                try {
                    if (GlobalLeaderboard._worldBest) GlobalLeaderboard._worldBest[__wrDiff] = game.score;
                } catch (e) { }
                await showWorldRecordCelebration(__wrDiff, game.score, __prevWorldBest);
            }
            const hsDiv = document.getElementById('high-score-input');
            if (hsDiv) hsDiv.style.display = 'none';

            if (gameOverContent) gameOverContent.style.display = 'none';
            showLeaderboard();
        });
    }

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        const handleRestart = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            AudioSys.unlock();
            track('retry');
            if (gameOverContent) gameOverContent.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            game.score = 0;
            game.lives = 5;
            game.scoreMultiplier = 1.0;

            // Check if this is the player's first time
            const tutorialDone = (() => {
                try { return CG.getItem(TUTORIAL_DONE_KEY) === '1'; } catch (e) { return false; }
            })();

            // Start the level first
            game.tutorialActive = !tutorialDone;
            game.startLevel(1);

            // Show the new controls tutorial overlay if first time
            if (!tutorialDone) {
                showControlsTutorial();
            }
        };
        restartBtn.addEventListener('click', handleRestart);
        restartBtn.addEventListener('touchstart', handleRestart, { passive: false });
    }

    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            game.isPlaying = false;
            track('exit_to_menu');
            CG.gameplayStop();
            stopLeaderboardAudioEl();
            AudioSys.stopBeam();
            AudioSys.stopUfoHum();

            if (overlay && startContent) {
                overlay.style.display = 'flex';
                overlay.classList.add('menu-bg');
                startContent.style.display = 'flex';
                if (joystickZone) joystickZone.style.pointerEvents = 'auto';
            }
            if (pauseOverlay) pauseOverlay.style.display = 'none';
            if (leaderboardView) leaderboardView.style.display = 'none';
            if (gameOverContent) gameOverContent.style.display = 'none';
            if (levelCompleteContent) levelCompleteContent.style.display = 'none';
            if (gameCompleteContent) gameCompleteContent.style.display = 'none';
            refreshMenuCareerProgress();
            refreshMenuPlayerStats();
        });
    }

    const victoryNameInput = document.getElementById('player-name-input-victory');
    const victorySubmitScoreBtn = document.getElementById('submit-score-btn-victory');
    const victoryRestartBtn = document.getElementById('victory-restart-btn');
    const victoryExitBtn = document.getElementById('victory-exit-btn');

    if (victorySubmitScoreBtn && victoryNameInput) {
        victorySubmitScoreBtn.addEventListener('click', async () => {
            const name = victoryNameInput.value.trim();
            if (!name) {
                const { key } = _scoreKeyNow();
                _globalQual.skipKeyVictory = key;
                _setNamePromptMode('noNameNeeded', 'victory');
                return;
            }

            Leaderboard.addScore(name, game.score, game.difficulty);
            Leaderboard.render('leaderboard-list');


            const __wrDiff = _normalizeDifficulty(game.difficulty);
            const __prevWorldBest = GlobalLeaderboard.getWorldBest(__wrDiff);
            let __globalSubmitted = false;

            if (_globalQual.allowGlobalVictory) {
                try {
                    await GlobalLeaderboard.submitScore({
                        name,
                        score: game.score,
                        difficulty: game.difficulty
                    });
                    __globalSubmitted = true;
                } catch (e) {
                    console.warn('[GlobalLeaderboard] submit failed:', e && e.message ? e.message : e);
                }
            }

            if (__globalSubmitted && game.score > __prevWorldBest) {
                // Update cached world best immediately so other UI reflects it.
                try {
                    if (GlobalLeaderboard._worldBest) GlobalLeaderboard._worldBest[__wrDiff] = game.score;
                } catch (e) { }
                await showWorldRecordCelebration(__wrDiff, game.score, __prevWorldBest);
            }
            const hsDiv = document.getElementById('high-score-input-victory');
            if (hsDiv) hsDiv.style.display = 'none';

            if (gameCompleteContent) gameCompleteContent.style.display = 'none';
            showLeaderboard();
        });
    }

    if (victoryRestartBtn) {
        const handleVictoryRestart = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            AudioSys.unlock();
            if (gameCompleteContent) gameCompleteContent.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            game.score = 0;
            game.lives = 5;
            game.scoreMultiplier = 1.0;

            // Check if this is the player's first time
            const tutorialDone = (() => {
                try { return CG.getItem(TUTORIAL_DONE_KEY) === '1'; } catch (e) { return false; }
            })();

            // Start the level first
            game.tutorialActive = !tutorialDone;
            game.startLevel(1);

            // Show the new controls tutorial overlay if first time
            if (!tutorialDone) {
                showControlsTutorial();
            }
        };
        victoryRestartBtn.addEventListener('click', handleVictoryRestart);
        victoryRestartBtn.addEventListener('touchstart', handleVictoryRestart, { passive: false });
    }

    if (victoryExitBtn) {
        victoryExitBtn.addEventListener('click', () => {
            AudioSys.unlock();
            startAudioKeepAlive();
            stopLeaderboardAudioEl();

            playWelcomeHomeCutsceneThen(() => {
                game.isPlaying = false;
                CG.gameplayStop();
                AudioSys.stopBeam();
                AudioSys.stopUfoHum();

                if (gameCompleteContent) gameCompleteContent.style.display = 'none';
                if (leaderboardView) leaderboardView.style.display = 'none';
                if (overlay && startContent) {
                    overlay.style.display = 'flex';
                    overlay.classList.add('menu-bg');
                    startContent.style.display = 'flex';
                    if (joystickZone) joystickZone.style.pointerEvents = 'auto';
                }
                refreshMenuCareerProgress();
            });
        });
    }

    const nextLevelBtn = document.getElementById('next-level-btn');
    if (nextLevelBtn) {
        const resetNextLevelBtn = () => {
            nextLevelBtn.disabled = false;
            nextLevelBtn.style.pointerEvents = 'auto';
        };

        if (levelCompleteContent) {
            const obs = new MutationObserver(() => {
                const cs = window.getComputedStyle(levelCompleteContent);
                if (cs && cs.display !== 'none') resetNextLevelBtn();
            });
            obs.observe(levelCompleteContent, { attributes: true, attributeFilter: ['style', 'class'] });
        }

        resetNextLevelBtn();

        const evtName = (window.PointerEvent ? 'pointerup' : 'click');
        const handleNextLevel = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }

            if (nextLevelBtn.disabled) return;
            nextLevelBtn.disabled = true;
            nextLevelBtn.style.pointerEvents = 'none';

            AudioSys.unlock();

            if (levelCompleteContent) levelCompleteContent.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            const nextLevel = Math.min(game.level + 1, 10);
            game.startLevel(nextLevel);
        };
        nextLevelBtn.addEventListener(evtName, handleNextLevel);
        if (evtName !== 'touchstart') {
            nextLevelBtn.addEventListener('touchstart', handleNextLevel, { passive: false });
        }
    }

    const doPause = () => {
        if (game.isPlaying && !game.isGameOver) {
            game.togglePause();
            const diffEl = document.getElementById('pause-difficulty');
            if (diffEl && game.isPaused) {
                diffEl.textContent = 'Difficulty: ' + (game.difficulty || 'NORMAL');
            }
        }
    };


    if (pauseBtn) pauseBtn.addEventListener('click', doPause);

    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (game.isPaused) game.togglePause();
        });
    }

    if (quitBtn) {
        quitBtn.addEventListener('click', () => {
            game.isPlaying = false;
            CG.gameplayStop();
            stopLeaderboardAudioEl();
            AudioSys.stopBeam();
            AudioSys.stopUfoHum();

            if (overlay && startContent) {
                overlay.style.display = 'flex';
                overlay.classList.add('menu-bg');
                startContent.style.display = 'flex';
                if (joystickZone) joystickZone.style.pointerEvents = 'auto';
            }
            if (pauseOverlay) pauseOverlay.style.display = 'none';
            if (leaderboardView) leaderboardView.style.display = 'none';
            if (gameOverContent) gameOverContent.style.display = 'none';
            if (levelCompleteContent) levelCompleteContent.style.display = 'none';
            if (gameCompleteContent) gameCompleteContent.style.display = 'none';
        });
    }

    let lastTime = 0;
    const animate = (timestamp) => {
        if (!lastTime) lastTime = timestamp;
        let dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        // Clamp to avoid huge jumps (tab switch etc)
        if (dt > 0.1) dt = 0.1;

        game.update(dt);
        game.draw();
        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
});
