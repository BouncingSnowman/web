import { Ship } from './Ship.js?v=6005';
import { Asteroid, Bullet, Particle, Enemy, FloatingText, Debris, Rocket, Powerup } from './Entities.js?v=6004';
import { Galaxy, Star, Planet, Nebula } from './World.js';
import { AudioSys, ScreenShake, Joystick, Leaderboard, safeSetText } from './Systems.js?v=6000';
import { CONFIG } from './constants.js?v=6000';
import { GlobalLeaderboard } from './GlobalLeaderboard.js?v=6000';
import { CG } from './crazygames.js?v=6000';
import { track } from './Telemetry.js?v=6000';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = canvas.width;
        this.height = canvas.height;
        this.ctx = canvas.getContext('2d');

        this.score = 0;
        this.level = 1;
        this.lives = 5;

        this.scoreMultiplier = 1.0;
        // Limits how many times the score multiplier can be increased in a run.
        // (Requested: "never more than 3 multiplier advances")
        this.multiplierAdvances = 0;
        this.perfectLevel = true;

        // Comeback Contract (optional, once per sector): defeat a mini-wave to restore the lost multiplier.
        this.comebackUsedThisSector = false;
        this.comebackOfferActive = false;
        this.comebackAccepted = false;
        this.comebackActive = false;
        this.comebackRestoreMultiplier = 1.0;
        this.comebackRemaining = 0;
        this._comebackSavedState = null;
        this.comebackReturnPending = false;

        this.isPlaying = false;
        this.isPaused = false;

        this.difficulty = 'NORMAL';

        this.bullets = [];
        this.asteroids = [];
        this.particles = [];
        this.debris = [];
        this.enemies = [];
        this.rockets = [];
        this.powerups = [];
        this.floatingTexts = [];
        this.stars = [];
        this.nebulas = [];

        this.planet = null;

        this.asteroidsToSpawn = 0;
        this.levelEndTimer = 0;
        this.bossSpawned = false;
        this.bossSpawnedAt = 0;
        this.level9WaveSpawned = false;
        this.level10UfoSpawned = false;

        this.ufoSpawnCount = 0;
        this.levelTime = 0;
        this.redUfoSpawned = false;
        this.interceptorTimer = 0;
        this.interceptorsSpawnedInLevel = 0;

        this.combatSpawnedThisLevel = false;

        // Comeback Contract resets each sector
        this.comebackUsedThisSector = false;
        this.comebackOfferActive = false;
        this.comebackAccepted = false;
        this.comebackActive = false;
        this.comebackRemaining = 0;
        this._comebackSavedState = null;

        // Sector 10 defender UFOs
        // - One spawns at half asteroids destroyed
        // - One spawns together with the boss (after all asteroids are destroyed)
        this.level10DefenderHalfSpawned = false;
        this.level10DefenderBossSpawned = false;

        // Level 7 repair asteroid scripting
        this.totalLargeAsteroidsThisLevel = 0;
        this.largeAsteroidsDestroyedThisLevel = 0;
        this.level7RepairAsteroidSpawned = false;

        this.input = { keys: { w: false, a: false, s: false, d: false, Fire: false } };

        this.ship = new Ship(this);
        this.bindEvents();

        for (let i = 0; i < 100; i++) this.stars.push(new Star(this.width, this.height));
        for (let i = 0; i < 5; i++) this.nebulas.push(new Nebula(this.width, this.height));
        this.galaxy = new Galaxy(this.width, this.height);

        // Level intro (educational) center text
        this.levelIntroText = '';
        this.levelIntroDuration = 3.0;
        this.levelIntroTimer = 0;

        // Multiplier feedback UI
        this._multiplierToastTimer = null;
        this._multiplierToastHideTimer = null;
        this._multiplierFlashTimer = null;

        // Career milestone toasts (beginner engagement)
        this._careerMilestonesShown = new Set();
    }

    onMultiplierDown(prevMultiplier = null) {
        // Called when the player loses a ship and the multiplier drops.
        this._flashBonusPanels();
        this._showMultiplierToast('MULTIPLIER DOWN');

        // Voiceover: multiplier penalty (delay so it doesn't overlap ship explosion)
        try {
            if (this._bonusLostVoTimer) clearTimeout(this._bonusLostVoTimer);
            this._bonusLostVoTimer = setTimeout(() => {
                try { AudioSys.playBonusPointLost && AudioSys.playBonusPointLost(); } catch (e) { }
            }, 950);
        } catch (e) { }

        // Offer a Comeback Contract (once per sector) to restore the lost multiplier.
        const prev = (typeof prevMultiplier === 'number' && Number.isFinite(prevMultiplier)) ? prevMultiplier : (this.scoreMultiplier + 1);
        if (!this.comebackActive && !this.comebackOfferActive && !this.comebackAccepted && !this.comebackUsedThisSector && this.lives > 0 && prev > this.scoreMultiplier) {
            this._showComebackOffer(prev);
        }
    }

    _showComebackOffer(restoreMultiplier) {
        this.comebackOfferActive = true;
        this.comebackRestoreMultiplier = Math.max(1.0, restoreMultiplier);
        track('comeback_offered', { sector: this.level });

        const ui = document.getElementById('comeback-contract-ui');
        if (!ui) return;
        ui.style.display = 'flex';
        ui.setAttribute('aria-hidden', 'false');

        // Update description to show the multiplier reward and correct contract targets
        const desc = document.getElementById('comeback-contract-desc');
        if (desc) {
            if (this.difficulty === 'HARD') {
                desc.innerHTML = `Defeat 2 interceptors + 2 commando UFO. No points during contract.`
                    + `<div style="margin-top:8px; color:#ffd700; font-weight:900; letter-spacing:0.5px;">Complete to keep your x${this.comebackRestoreMultiplier.toFixed(1)} bonus!</div>`;
            } else {
                desc.innerHTML = `Defeat 1 interceptor + 1 commando UFO. No points during contract.`
                    + `<div style="margin-top:8px; color:#ffd700; font-weight:900; letter-spacing:0.5px;">Complete to keep your x${this.comebackRestoreMultiplier.toFixed(1)} bonus!</div>`;
            }
        }

        // Play voiceover offer (delayed to let the bonuspointlost voiceover finish first)
        // Track the timeout so it can be cancelled if player accepts before it plays
        try {
            if (this._contractVoTimer) clearTimeout(this._contractVoTimer);
            this._contractVoTimer = setTimeout(() => {
                this._contractVoTimer = null;
                try { AudioSys.playContractOffer(); } catch (e) { }
            }, 3200);
        } catch (e) { }

        // Ensure the HUD stays interactive while the offer is up.
        // (Buttons are wired in main.js.)
    }

    _hideComebackOffer() {
        const ui = document.getElementById('comeback-contract-ui');
        if (!ui) return;
        ui.style.display = 'none';
        ui.setAttribute('aria-hidden', 'true');
    }


    _showComebackComplete() {
        const ui = document.getElementById('comeback-complete-ui');
        if (!ui) return;
        ui.style.display = 'flex';
        ui.setAttribute('aria-hidden', 'false');
    }

    _hideComebackComplete() {
        const ui = document.getElementById('comeback-complete-ui');
        if (!ui) return;
        ui.style.display = 'none';
        ui.setAttribute('aria-hidden', 'true');
    }

    returnFromComebackContract() {
        if (!this.comebackReturnPending) return;

        this.comebackReturnPending = false;
        this._hideComebackComplete();

        // Restore paused sector state
        if (this._comebackSavedState) {
            this.asteroids = (this._comebackSavedState.asteroids || []).filter(a => !a.markedForDeletion);
            this.bullets = this._comebackSavedState.bullets || [];
            this.enemies = (this._comebackSavedState.enemies || []).filter(e => !e.markedForDeletion);
            this.enemies.forEach(e => { e._oobTimer = 0; }); // Fresh OOB window after contract
            this.rockets = this._comebackSavedState.rockets || [];
            this.powerups = this._comebackSavedState.powerups || [];
            this.levelTime = this._comebackSavedState.levelTime || 0;
            this.interceptorTimer = this._comebackSavedState.interceptorTimer || 0;
            this.interceptorsSpawnedInLevel = this._comebackSavedState.interceptorsSpawnedInLevel || 0;

            // Always reset levelEndTimer after returning from a contract so that
            // sector completion / victory requires a fresh countdown.
            this.levelEndTimer = 0;

            // On sector 10, refresh the boss engagement timestamp so the
            // 5-second minimum fight time starts from the return, not from
            // the original boss spawn.
            if (this.level === 10 && this.bossSpawned) {
                this.bossSpawnedAt = this.levelTime;
            }
        }
        this._comebackSavedState = null;
        this.comebackRemaining = 0;

        // Reconcile mindControlledAllies from the restored enemies.
        if (this.ship) {
            this.ship.mindControlledAllies = this.enemies.filter(
                e => e && e.isMindControlled && e.mindControlController === this.ship && !e.markedForDeletion
            );
        }

        // Spawn shield to prevent instant rams right after re-entry.
        try {
            if (this.ship && !this.ship.dead) this.ship.activateSpawnShield(3000);
        } catch (e) { }

        this.updateHUD();

        // CrazyGames gameplay state: resume gameplay if the game isn't paused.
        try { if (!this.isPaused) CG.gameplayStart(); } catch (e) { }

        // Nudge audio back on. (Exact hum/engine state will correct on the next update tick.)
        try { AudioSys.playBackgroundMusic(); } catch (e) { }
    }


    acceptComebackContract() {
        if (!this.comebackOfferActive || this.comebackUsedThisSector) return;
        this.comebackOfferActive = false;
        this.comebackAccepted = true;
        this.comebackUsedThisSector = true;
        track('comeback_accepted', { sector: this.level });
        this._hideComebackOffer();
    }

    skipComebackContract() {
        if (!this.comebackOfferActive) return;
        this.comebackOfferActive = false;
        this.comebackAccepted = false;
        this.comebackUsedThisSector = true;
        track('comeback_skipped', { sector: this.level });

        // Stop the contract voiceover (cancel pending timer + stop playing audio)
        if (this._contractVoTimer) { clearTimeout(this._contractVoTimer); this._contractVoTimer = null; }
        try { AudioSys.stopContractOffer(); } catch (e) { }

        this._hideComebackOffer();
    }

    _startComebackContractIfReady() {
        if (!this.comebackAccepted || this.comebackActive) return;
        if (!this.ship || this.ship.dead) return;

        // Stop the contract voiceover now that the player has started playing
        if (this._contractVoTimer) { clearTimeout(this._contractVoTimer); this._contractVoTimer = null; }
        try { AudioSys.stopContractOffer(); } catch (e) { }

        this.comebackAccepted = false;
        this.comebackActive = true;
        this.comebackRemaining = 4;

        // Pause the current sector state and run a contained contract wave.
        this._comebackSavedState = {
            asteroids: this.asteroids,
            bullets: this.bullets,
            enemies: this.enemies,
            rockets: this.rockets,
            powerups: this.powerups,
            levelTime: this.levelTime,
            interceptorTimer: this.interceptorTimer,
            interceptorsSpawnedInLevel: this.interceptorsSpawnedInLevel,
            levelEndTimer: this.levelEndTimer
        };

        this.asteroids = [];
        this.bullets = [];
        this.enemies = [];
        this.rockets = [];
        this.powerups = [];

        // Carry captured allies into the contract arena so they keep fighting.
        // Keep them in the saved state too — on restore they'll come back
        // (unless they died during the contract, in which case markedForDeletion filters them out).
        if (this.ship && this.ship.mindControlledAllies.length > 0) {
            for (const ally of this.ship.mindControlledAllies) {
                if (ally && !ally.markedForDeletion && ally.isMindControlled) {
                    this.enemies.push(ally);
                }
            }
        }

        // Spawn contract targets based on difficulty.
        const isHard = this.difficulty === 'HARD';
        this.comebackRemaining = isHard ? 4 : 2;

        const spawnInterceptor = (x) => {
            const e = new Enemy(this, 'INTERCEPTOR', this.ship);
            e.x = x;
            e.y = 20;
            e.isComebackContract = true;
            return e;
        };
        const spawnCommando = (x) => {
            const u = new Enemy(this, 'UFO_COMMANDO', this.ship);
            u.x = x;
            u.y = 90;
            u.entered = true;
            u.provoked = true;
            u.persistent = true;
            u.ufoMode = 'sniper';
            u.isComebackContract = true;
            return u;
        };

        if (isHard) {
            this.enemies.push(spawnInterceptor(this.width * 0.30));
            this.enemies.push(spawnInterceptor(this.width * 0.70));
            setTimeout(() => {
                if (!this.comebackActive) return;
                this.enemies.push(spawnCommando(this.width * 0.35));
                this.enemies.push(spawnCommando(this.width * 0.65));
            }, 10000);
        } else {
            this.enemies.push(spawnInterceptor(this.width * 0.5));
            setTimeout(() => {
                if (!this.comebackActive) return;
                this.enemies.push(spawnCommando(this.width * 0.5));
            }, 10000);
        }

        this._showMultiplierToast('COMEBACK CONTRACT');
    }

    onComebackContractTargetDown() {
        if (!this.comebackActive) return;
        this.comebackRemaining = Math.max(0, this.comebackRemaining - 1);
        if (this.comebackRemaining <= 0) {
            this._finishComebackContract(true);
        }
    }

    _finishComebackContract(success) {
        if (!this.comebackActive) return;
        this.comebackActive = false;

        // Clear contract entities
        this.asteroids = [];
        this.bullets = [];
        this.enemies = [];
        this.rockets = [];
        this.powerups = [];

        // All contract-arena allies are gone; clear the tracking array.
        // Pre-contract allies (saved state) will be reconciled on restore.
        if (this.ship) this.ship.mindControlledAllies = [];

        this.comebackRemaining = 0;

        if (success) {
            this.scoreMultiplier = Math.max(this.scoreMultiplier, this.comebackRestoreMultiplier);
            this.updateHUD();
            this._showMultiplierToast('MULTIPLIER RESTORED');

            // Hold the return to the sector until the player clicks.
            this.comebackReturnPending = true;
            this._showComebackComplete();

            // CrazyGames gameplay state: contract result is a gameplay break.
            try { CG.gameplayStop(); } catch (e) { }

            // Quiet combat loops during the hold.
            try { AudioSys.stopUfoHum(); } catch (e) { }
            try { AudioSys.stopBossEngine(); } catch (e) { }

            try { CG.happytime(); } catch (e) { }
            return;
        }

        // Restore paused sector state (failure path)
        if (this._comebackSavedState) {
            this.asteroids = this._comebackSavedState.asteroids || [];
            this.bullets = this._comebackSavedState.bullets || [];
            this.enemies = this._comebackSavedState.enemies || [];
            this.enemies.forEach(e => { e._oobTimer = 0; }); // Fresh OOB window after contract
            this.rockets = this._comebackSavedState.rockets || [];
            this.powerups = this._comebackSavedState.powerups || [];
            this.levelTime = this._comebackSavedState.levelTime || 0;
            this.interceptorTimer = this._comebackSavedState.interceptorTimer || 0;
            this.interceptorsSpawnedInLevel = this._comebackSavedState.interceptorsSpawnedInLevel || 0;
            this.levelEndTimer = this._comebackSavedState.levelEndTimer || 0;
        }
        this._comebackSavedState = null;

        // Reconcile mindControlledAllies from the restored enemies.
        if (this.ship) {
            this.ship.mindControlledAllies = this.enemies.filter(
                e => e && e.isMindControlled && e.mindControlController === this.ship && !e.markedForDeletion
            );
        }

        this._showMultiplierToast('CONTRACT FAILED', 2500, true);
    }


    _flashBonusPanels() {
        const p1 = document.getElementById('bonus-panel');
        const p2 = document.getElementById('bonus-panel-desktop');
        const panels = [p1, p2].filter(Boolean);
        if (panels.length === 0) return;

        // Clear any previous flash so it never gets stuck.
        if (this._multiplierFlashTimer) {
            clearTimeout(this._multiplierFlashTimer);
            this._multiplierFlashTimer = null;
        }

        panels.forEach(p => {
            try {
                p.style.transition = 'transform 120ms ease, filter 120ms ease';
                p.style.transform = 'scale(1.06)';
                p.style.filter = 'brightness(1.35)';
            } catch (e) { }
        });

        this._multiplierFlashTimer = setTimeout(() => {
            panels.forEach(p => {
                try {
                    p.style.transform = '';
                    p.style.filter = '';
                } catch (e) { }
            });
            this._multiplierFlashTimer = null;
        }, 260);
    }

    _showMultiplierToast(text, durationMs = 600, centered = false) {
        const el = document.getElementById('multiplier-toast');
        if (!el) return;

        // Reset any previous animations.
        if (this._multiplierToastTimer) {
            clearTimeout(this._multiplierToastTimer);
            this._multiplierToastTimer = null;
        }
        if (this._multiplierToastHideTimer) {
            clearTimeout(this._multiplierToastHideTimer);
            this._multiplierToastHideTimer = null;
        }

        try {
            el.textContent = text;
            el.style.display = 'block';
            el.style.opacity = '0';
            el.style.top = centered ? '45%' : '64px';
            el.style.fontSize = centered ? '28px' : '';
            el.style.transform = 'translate(-50%, -6px) scale(0.98)';
        } catch (e) { }

        // Next tick: fade in
        this._multiplierToastTimer = setTimeout(() => {
            try {
                el.style.opacity = '1';
                el.style.transform = 'translate(-50%, 0px) scale(1)';
            } catch (e) { }

            // Auto-hide after durationMs
            this._multiplierToastHideTimer = setTimeout(() => {
                try {
                    el.style.opacity = '0';
                    el.style.transform = 'translate(-50%, -10px) scale(0.98)';
                } catch (e) { }

                // Fully hide after transition
                setTimeout(() => {
                    try { el.style.display = 'none'; } catch (e) { }
                }, 240);

                this._multiplierToastHideTimer = null;
            }, durationMs);

            this._multiplierToastTimer = null;
        }, 0);
    }

    getLevelIntroText(level) {
        // Keep this short and readable. Empty string disables the intro.
        if (level === 1) return 'Somewhere in the Kuiper Belt';
        if (level === 2) return 'Inner Kuiper Belt Sector';
        if (level === 3) return 'Pluto Sector';
        if (level === 4) return 'Neptune Sector';
        if (level === 5) return 'Uranus Sector';
        if (level === 6) return 'Saturn Sector';
        if (level === 7) return 'Jupiter Sector';
        if (level === 8) return 'Mars Sector';
        if (level === 9) return 'The Moon';
        if (level === 10) return 'Earth';
        return '';
    }

    bindEvents() {
        window.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            if (this.input.keys.hasOwnProperty(k) || ['w', 'a', 's', 'd'].includes(k)) {
                this.input.keys[k] = true;
            }
            // Arrow keys mirror WASD for desktop players
            if (e.key === 'ArrowUp') this.input.keys.w = true;
            if (e.key === 'ArrowDown') this.input.keys.s = true;
            if (e.key === 'ArrowLeft') this.input.keys.a = true;
            if (e.key === 'ArrowRight') this.input.keys.d = true;

            if (e.key === 'Enter') this.input.keys.Fire = true;
            if (k === 'p') this.togglePause();
            // Shield: Spacebar only (desktop)
            if (e.code === 'Space') {
                e.preventDefault();
                this.ship.activateShield();
            }
        });

        window.addEventListener('keyup', e => {
            const k = e.key.toLowerCase();
            if (this.input.keys.hasOwnProperty(k) || ['w', 'a', 's', 'd'].includes(k)) {
                this.input.keys[k] = false;
            }
            if (e.key === 'ArrowUp') this.input.keys.w = false;
            if (e.key === 'ArrowDown') this.input.keys.s = false;
            if (e.key === 'ArrowLeft') this.input.keys.a = false;
            if (e.key === 'ArrowRight') this.input.keys.d = false;
            if (e.key === 'Enter') this.input.keys.Fire = false;
        });

        document.addEventListener('click', (e) => {
            const targetId = e.target.id;

            if (targetId === 'victory-leaderboard-btn') {
                const victoryContent = document.getElementById('game-complete-content');
                const lbView = document.getElementById('leaderboard-view');

                if (victoryContent) victoryContent.style.display = 'none';

                const mainLbBtn = document.getElementById('leaderboard-btn');
                if (mainLbBtn) {
                    mainLbBtn.click();
                } else {
                    if (lbView) lbView.style.display = 'flex';
                    if (typeof window.displayLeaderboard === 'function') window.displayLeaderboard();
                }
            }

            if (['victory-restart-btn', 'victory-exit-btn', 'exit-btn', 'restart-btn', 'leaderboard-back-btn'].includes(targetId)) {
                this.stopVictoryMusic();
            }
        });
    }

    stopVictoryMusic() {
        const audio = document.getElementById('leaderboard-audio-el');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.remove();
        }
    }

    async togglePause() {
        if (!this.isPlaying) return;
        this.isPaused = !this.isPaused;
        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.style.display = this.isPaused ? 'flex' : 'none';

        // CrazyGames gameplay state (pause is a gameplay break)
        if (this.isPaused) CG.gameplayStop();
        else CG.gameplayStart();

        if (this.isPaused) {
            AudioSys.stopUfoHum();
            AudioSys.stopBossEngine();
            AudioSys.stopBackgroundMusic();
            if (AudioSys.stopMindHum) AudioSys.stopMindHum();
        } else {
            // iPad/iOS: AudioContext may have been deeply suspended after a long pause.
            // We must ensure it is fully 'running' before any sounds can play.
            try { AudioSys.unlock(); } catch (e) { }
            if (AudioSys.ctx) {
                try { await AudioSys.ctx.resume(); } catch (e) { }
                // Poll for up to 500ms to confirm it actually resumed (iOS can be sluggish)
                let waited = 0;
                while (AudioSys.ctx.state !== 'running' && waited < 500) {
                    await new Promise(r => setTimeout(r, 50));
                    try { await AudioSys.ctx.resume(); } catch (e) { }
                    waited += 50;
                }
                // Final silent buffer to re-warm the audio pipeline
                try { AudioSys.unlock(); } catch (e) { }
            }

            AudioSys.playBackgroundMusic();
            if (this.enemies.some(e => !e.isMindControlled && (e.type === 'UFO' || e.type === 'UFO_SNIPER' || e.type === 'UFO_COMMANDO'))) AudioSys.startUfoHum();
            if (this.enemies.some(e => !e.isMindControlled && (e.type === 'BOSS' || e.type === 'INTERCEPTOR' || e.type === 'MINIBOSS_INTERCEPTOR'))) AudioSys.startBossEngine();
        }
    }

    startLevel(lvl) {
        this.stopVictoryMusic();
        this.level = lvl;
        track('sector_start', { sector: lvl, ship: this.shipType || 'HERO', difficulty: this.difficulty || 'NORMAL' });

        // Comeback Contract resets each sector (and on new runs).
        this.comebackUsedThisSector = false;
        this.comebackOfferActive = false;
        this.comebackAccepted = false;
        this.comebackActive = false;
        this.comebackRemaining = 0;
        this._comebackSavedState = null;
        this._hideComebackOffer();
        this.comebackReturnPending = false;
        this._hideComebackComplete();

        // Level intro text (fades over 3 seconds)
        this.levelIntroText = this.getLevelIntroText(this.level);
        this.levelIntroTimer = this.levelIntroText ? this.levelIntroDuration : 0;

        // New run: reset multiplier advance limit.
        if (lvl === 1) {
            this.multiplierAdvances = 0;

            // Snapshot the accrued score at run start so _commitAccruedScore
            // can write baseAccrued + runScore (idempotent, safe to call repeatedly).
            try {
                const stored = parseInt(CG.getItem('ALIENSECTOR_SCORE_ACCRUED') || '0', 10);
                this.baseAccruedScore = (Number.isFinite(stored) && stored > 0) ? stored : 0;
            } catch (e) { this.baseAccruedScore = 0; }
        }
        this.perfectLevel = true;
        this.levelEndTimer = 0;
        this.bossSpawned = false;
        this.bossSpawnedAt = 0;
        this.level9WaveSpawned = false;
        this.level10UfoSpawned = false;

        // Reset sector combat state
        this.ufoSpawnCount = 0;
        this.levelTime = 0;
        this.redUfoSpawned = false;
        this.interceptorTimer = 8.0;
        this.interceptorsSpawnedInLevel = 0;
        this.combatSpawnedThisLevel = false;

        // Sector 10 defenders reset
        this.level10DefenderHalfSpawned = false;
        this.level10DefenderBossSpawned = false;

        this.asteroids = [];
        this.bullets = [];
        this.enemies = [];
        this.debris = [];
        this.rockets = [];
        this.powerups = [];
        this.planet = new Planet(this.level);

        const previousShip = this.ship;
        this.ship = new Ship(this);

        // HARD: Do not reset player hull integrity (HP) between sectors.
        // Keep the previous ship HP when starting a new level (level > 1).
        if (this.difficulty === 'HARD' && previousShip && this.level > 1) {
            const prevHp = (typeof previousShip.hp === 'number') ? previousShip.hp : 100;
            this.ship.hp = Math.max(1, Math.min(100, prevHp));
        }

        if (this.difficulty === 'HARD') {
            this.ship.weaponLevel = 1;
        } else {
            // Normal Difficulty:
            // Level 1: Single Blaster (0)
            // Level 2-4: Double Blaster (1)
            // Level 5+: Fast Double Blaster (2)
            if (this.level >= 5) this.ship.weaponLevel = 2;
            else if (this.level >= 2) this.ship.weaponLevel = 1;
            else this.ship.weaponLevel = 1; // Hero always starts with double cannon
        }

        // Ship-specific starting blaster rules
        // - Warlock: always starts with the first double blaster unlocked (never single).
        // - Phoenix: always starts with the fast blasters unlocked (never single).
        // Ensure unlock ships NEVER start with single blaster (Level 0).
        if (this.ship.isGhostShip) {
            this.ship.weaponLevel = Math.max(1, this.ship.weaponLevel);
        } else if (this.ship.isWarlockShip) {
            this.ship.weaponLevel = Math.max(1, this.ship.weaponLevel);
        } else if (this.ship.isWinnerShip) {
            this.ship.weaponLevel = Math.max(2, this.ship.weaponLevel);
        } else if (this.ship.isHardWinnerShip) {
            this.ship.weaponLevel = Math.max(2, this.ship.weaponLevel);
        }



        // Longer spawn shield in Sector 1 and 2
        const _isBeginner = this.difficulty === 'EASY';
        let spawnShieldMs = (this.level <= 2) ? 6000 : 3000;
        // Beginners get 3× spawn shield on Sector 1 (18s) to explore safely (disabled in Hard mode)
        if (_isBeginner && this.level === 1 && this.difficulty !== 'HARD') spawnShieldMs = 18000;
        // Ghost ship: start with phase-cloak instead of the traditional spawn shield
        if (this.ship.isGhostShip) {
            this.ship.activateGhostSpawnCloak(spawnShieldMs);
        } else {
            this.ship.activateSpawnShield(spawnShieldMs);
        }

        // Beginner Sector 1: motivational text + 3 easy UFOs that drop rapid fire
        if (this.level === 1) {
            setTimeout(() => {
                if (this.level === 1 && this.isPlaying) {
                    const ft = new FloatingText(
                        this.width / 2, this.height * 0.32,
                        'CLEAR THE SECTOR CAPTAIN!', '#ffd700'
                    );
                    ft.life = 5.0;
                    ft.vy = 0;
                    this.floatingTexts.push(ft);
                }
            }, 5000);

            // Beginner only: spawn 3 easy UFOs that drop rapid fire (staggered - disabled in Hard mode)
            if (_isBeginner && this.difficulty !== 'HARD') {
                const spawnBeginnerUfo = () => {
                    const ufo = new Enemy(this, 'UFO', this.ship);
                    ufo.hp = 5;
                    ufo.maxHp = 5;
                    ufo.forceDrop = 'DOUBLE_FIRE';
                    ufo.isNewbieDrop = true;
                    this.enemies.push(ufo);
                };
                spawnBeginnerUfo();
                AudioSys.startUfoHum();
                this.combatSpawnedThisLevel = true;
                setTimeout(() => { if (this.level === 1 && this.isPlaying) spawnBeginnerUfo(); }, 6000);
                setTimeout(() => { if (this.level === 1 && this.isPlaying) spawnBeginnerUfo(); }, 12000);
            }
        }

        if (previousShip && this.level > 1 && previousShip.doubleFireTimer > 0) {
            let stacks = 0;
            if (typeof previousShip.rapidFireStacks === 'number') {
                stacks = previousShip.rapidFireStacks;
            } else if (typeof previousShip.fireRateMult === 'number' && previousShip.fireRateMult > 0) {
                stacks = Math.round((1 / previousShip.fireRateMult) - 1);
            }
            stacks = Math.max(0, Math.min(5, stacks));
            if (stacks > 0) {
                this.ship.rapidFireStacks = stacks;
                this.ship.doubleFireTimer = previousShip.doubleFireTimer;
                this.ship.fireRateMult = 1 / (1 + stacks);
            }
        }

        if (this.difficulty === 'HARD' && previousShip && this.level > 1) {
            this.ship.shieldCount = previousShip.shieldCount;
        }

        this.isPlaying = true;
        this.isPaused = false;
        AudioSys.playBackgroundMusic();
        // Gameplay is active
        CG.gameplayStart();

        const calcLevel = Math.min(this.level, 2);
        let baseCount = (this.level === 1 ? 4 : 7 + (calcLevel * 5));
        if (this.difficulty === 'HARD') baseCount = Math.round(baseCount * 1.4);
        // Sector 10: +15% more asteroids.
        if (this.level === 10) baseCount = Math.ceil(baseCount * 1.15);
        this.asteroidsToSpawn = baseCount;

        // Level 7 repair asteroid scripting
        this.totalLargeAsteroidsThisLevel = baseCount;
        this.largeAsteroidsDestroyedThisLevel = 0;
        this.level7RepairAsteroidSpawned = false;

        const initialAsteroids = (this.level === 1) ? 1 : 2;
        for (let i = 0; i < initialAsteroids; i++) {
            this.asteroids.push(new Asteroid(this, Math.random() * this.width, -100, CONFIG.ASTEROID_LARGE_SIZE, 'LARGE'));
            this.asteroidsToSpawn--;
        }

        // Beginners (career < 100k): spawn one gold asteroid per sector that drops rapid fire
        // Hard mode: no gold asteroids at all.
        const _isBeginnerGold = this.difficulty === 'EASY';
        if (_isBeginnerGold && this.difficulty !== 'HARD') {
            const goldSize = CONFIG.ASTEROID_MEDIUM_SIZE * 1.5;
            const goldAst = new Asteroid(this, Math.random() * this.width, -120, goldSize, 'GOLD');
            goldAst.forceDrop = 'DOUBLE_FIRE';
            goldAst.isNewbieDrop = true;
            this.asteroids.push(goldAst);
        }

        // Sector 8: spawn a mini boss + a sniper UFO together with the asteroids.
        if (this.level === 8) {
            // Mini boss from the left
            const mb = new Enemy(this, 'MINIBOSS_INTERCEPTOR', this.ship);
            mb.x = -50;
            mb.y = this.height * 0.30;
            mb.angle = 0;
            this.enemies.push(mb);

            // Sniper UFO from the right
            const sn = new Enemy(this, 'UFO_SNIPER', this.ship);
            sn.x = this.width + 50;
            sn.y = this.height * 0.55;
            sn.angle = Math.PI;
            this.enemies.push(sn);

            this.level10UfoSpawned = true;
            this.floatingTexts.push(new FloatingText(this.width / 2, this.height / 2, 'WARNING: INTERCEPTORS', '#ff4444'));
            AudioSys.startUfoHum();
            this.combatSpawnedThisLevel = true;
        }

        // Hard mode: spawn 1 extra basic UFO in sectors 5–7.
        // Basic UFOs don't drop powerups on Hard, rewarding Warlock's capture mechanic.
        if (this.difficulty === 'HARD' && this.level >= 5 && this.level <= 7) {
            const extraUfo = new Enemy(this, 'UFO', this.ship);
            this.enemies.push(extraUfo);
            AudioSys.startUfoHum();
            this.combatSpawnedThisLevel = true;
        }

        // Failsafe (Final Check): If we are in Sector 2 or higher, force at least Double Blasters.
        // Moved to the very end of initialization to ensure no other logic overwrites it.
        if (this.level >= 2 && this.ship.weaponLevel < 1) {
            console.warn('DEBUG: Force-upgrading weapon level from 0 to 1 for Sector ' + this.level);
            this.ship.weaponLevel = 1;
        }

        console.log(`DEBUG: Level ${this.level} started. Ship WeaponLevel: ${this.ship.weaponLevel}`);

        this.updateHUD();

        const overlay = document.getElementById('center-screen-overlay');
        const levelComp = document.getElementById('level-complete-content');
        const stats = document.getElementById('victory-stats-content');
        const gameComp = document.getElementById('game-complete-content');

        if (levelComp) levelComp.style.display = 'none';
        if (stats) stats.style.display = 'none';
        if (gameComp) gameComp.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    update(dt) {
        if (!this.isPlaying || this.isPaused || this.comebackReturnPending) return;
        // If the player accepted a Comeback Contract, start it as soon as the ship is alive.
        this._startComebackContractIfReady();

        // During a contract, the sector timer is paused.
        if (!this.comebackActive) this.levelTime += dt;

        // Make sure core gameplay loops come back even if they were
        // requested before audio finished decoding.
        AudioSys.playBackgroundMusic();

        ScreenShake.update(dt);

        if (this.levelIntroTimer > 0) {
            this.levelIntroTimer = Math.max(0, this.levelIntroTimer - dt);
        }

        this.stars.forEach(s => s.update(dt));
        this.nebulas.forEach(n => n.update(dt));
        if (this.planet) this.planet.update(dt);

        this.ship.update(dt);

        // If the player died during the contract, fail it and resume the paused sector state.
        if (this.comebackActive && this.ship.dead) {
            this._finishComebackContract(false);
        }
        this.bullets.forEach(b => b.update(dt));
        this.asteroids.forEach(a => a.update(dt));
        this.enemies.forEach(e => e.update(dt));
        this.rockets.forEach(r => r.update(dt));
        this.powerups.forEach(p => p.update(dt));
        this.particles.forEach(p => p.update(dt));
        this.debris.forEach(d => d.update(dt));
        this.floatingTexts.forEach(t => t.update(dt));

        this.checkCollisions();
        if (this.comebackReturnPending) return;
        if (this.comebackActive && this.ship && this.ship.dead) {
            this._finishComebackContract(false);
        }
        if (!this.comebackActive) this.spawnManager(dt);

        this.bullets = this.bullets.filter(b => !b.markedForDeletion);
        this.asteroids = this.asteroids.filter(a => !a.markedForDeletion);
        // Handle forceDrop from Game.js (bypass Entities.js cache issues)
        this.enemies.forEach(e => {
            if (e.markedForDeletion && e.forceDrop && !e._forceDropDone) {
                e._forceDropDone = true;
                const fp = new Powerup(e.x, e.y, e.forceDrop);
                if (e.isNewbieDrop) fp.isNewbieDrop = true;
                this.powerups.push(fp);
            }
        });
        this.enemies = this.enemies.filter(e => !e.markedForDeletion);
        this.rockets = this.rockets.filter(r => !r.markedForDeletion);
        this.powerups = this.powerups.filter(p => !p.markedForDeletion);
        this.particles = this.particles.filter(p => p.life > 0);
        this.floatingTexts = this.floatingTexts.filter(t => t.life > 0);

        const hasUfo = this.enemies.some(e => !e.isMindControlled && (e.type === 'UFO' || e.type === 'UFO_SNIPER' || e.type === 'UFO_COMMANDO'));
        const hasBossEngine = this.enemies.some(e => !e.isMindControlled && (e.type === 'BOSS' || e.type === 'INTERCEPTOR' || e.type === 'MINIBOSS_INTERCEPTOR'));

        // If player is dead with no lives left, stop all enemy sounds immediately
        // This prevents the engine/UFO hum from persisting to the game over screen
        if (this.ship.dead && this.lives <= 0) {
            AudioSys.stopUfoHum();
            AudioSys.stopBossEngine();
            return;
        }

        if (hasUfo) AudioSys.startUfoHum();
        else AudioSys.stopUfoHum();

        if (hasBossEngine) AudioSys.startBossEngine();
        else AudioSys.stopBossEngine();

        // NOTE: levelEndTimer is used as a count-up timer in spawnManager().
        // Do not decrement it here.
    }

    _cashOutMindControlledAllyForRoundEnd() {
        const ship = this.ship;
        if (!ship) return;

        // Cash out all captured allies (Warlock can have multiple).
        for (const ally of ship.mindControlledAllies) {
            if (ally && ally.isMindControlled && !ally.markedForDeletion && typeof ally.cashOutMindControlledAtRoundEnd === 'function') {
                ally.cashOutMindControlledAtRoundEnd();
            }
        }
        ship.mindControlledAllies = [];

        // Clear any in-progress channel state so hum/progress never lingers across sector transitions.
        ship.mindControlTarget = null;
        ship.mindControlHold = 0;
    }

    spawnManager(dt) {
        const maxOnScreen = 6 * this.level + 2;
        const currentLarge = this.asteroids.filter(a => a.type === 'LARGE').length;
        if (this.asteroidsToSpawn > 0 && currentLarge < maxOnScreen && Math.random() < 0.02) {
            const side = Math.floor(Math.random() * 4);
            let x, y;
            if (side === 0) { x = Math.random() * this.width; y = -60; }
            else if (side === 1) { x = this.width + 60; y = Math.random() * this.height; }
            else if (side === 2) { x = Math.random() * this.width; y = this.height + 60; }
            else { x = -60; y = Math.random() * this.height; }
            this.asteroids.push(new Asteroid(this, x, y, CONFIG.ASTEROID_LARGE_SIZE, 'LARGE'));
            this.asteroidsToSpawn--;
        }

        // Hard mode: no gold/repair asteroids.
        if ((this.level === 1 || this.level === 2 || this.level === 7 || this.level === 5) && !this.level7RepairAsteroidSpawned && this.difficulty !== 'HARD') {
            const total = (typeof this.totalLargeAsteroidsThisLevel === 'number') ? this.totalLargeAsteroidsThisLevel : 0;
            const threshold = Math.floor(total * 0.5);
            if (threshold > 0 && this.largeAsteroidsDestroyedThisLevel >= threshold) {
                const minDist = Math.min(this.width, this.height) * 0.35;
                let x = Math.random() * this.width;
                let y = -80;

                // Try a few times to avoid spawning right on top of the player.
                for (let i = 0; i < 10; i++) {
                    const side = Math.floor(Math.random() * 4);
                    if (side === 0) {
                        x = Math.random() * this.width; y = -80;
                    } else if (side === 1) {
                        x = this.width + 80; y = Math.random() * this.height;
                    } else if (side === 2) {
                        x = Math.random() * this.width; y = this.height + 80;
                    } else {
                        x = -80; y = Math.random() * this.height;
                    }

                    if (!this.ship || Math.hypot(x - this.ship.x, y - this.ship.y) >= minDist) break;
                }

                const goldSize = CONFIG.ASTEROID_MEDIUM_SIZE * 1.5;
                this.asteroids.push(new Asteroid(this, x, y, goldSize, 'GOLD'));
                this.level7RepairAsteroidSpawned = true;
                this.floatingTexts.push(new FloatingText(this.width / 2, this.height * 0.28, 'REPAIR ASTEROID DETECTED', '#ffd700'));
            }
        }

        // Compute early so interceptor/UFO spawns can check whether the field is already clear.
        const noAsteroids = this.asteroidsToSpawn <= 0 && this.asteroids.length === 0;

        // Don't spawn interceptors once the asteroid field is fully cleared — avoids
        // phantom interceptors that block sector completion on an empty screen.
        if (this.level >= 4 && this.level !== 9 && this.level !== 10 && !noAsteroids) {
            this.interceptorTimer -= dt;
            if (this.interceptorTimer <= 0) {
                const activeInterceptors = this.enemies.filter(e => e.type === 'INTERCEPTOR').length;
                let maxInterceptorsForLevel = (this.level === 9) ? 3 : (this.level === 10 ? 4 : 1);
                if (activeInterceptors < 2 && this.interceptorsSpawnedInLevel < maxInterceptorsForLevel) {
                    this.enemies.push(new Enemy(this, 'INTERCEPTOR', this.ship));
                    this.combatSpawnedThisLevel = true;
                    this.interceptorsSpawnedInLevel++;
                }
                // Beginners get slower interceptor spawns in S4-S5 to reduce the death wall
                const _beg = this.difficulty === 'EASY';
                const baseTimer = (this.level >= 4 && this.level <= 7) ? 14.0 : 15.0;
                this.interceptorTimer = (_beg && this.level <= 5) ? 22.0 : baseTimer;
            }
        }
        if ((this.level === 7 || this.level === 8 || this.level === 9) && !this.redUfoSpawned && this.levelTime >= 10.0) {
            const ufo = new Enemy(this, 'UFO_SNIPER', this.ship);
            ufo.ufoMode = 'sniper';
            ufo.provoked = true;
            ufo.x = (this.ship.x > this.width / 2) ? 80 : this.width - 80;
            ufo.y = Math.random() * (this.height - 160) + 80;
            ufo.destY = ufo.y;
            ufo.timer = 0;
            ufo.direction = (ufo.x < this.width / 2) ? 1 : -1;
            ufo.vx = 120 * ufo.direction;

            const minDim = Math.min(this.width, this.height);
            ufo.ufoDesiredRange = minDim * 0.45;
            ufo.ufoMinRange = minDim * 0.30;
            ufo.ufoMaxRange = minDim * 0.65;
            ufo.ufoOrbitDir = (Math.random() > 0.5) ? 1 : -1;
            ufo.ufoRocketCooldown = 3.8;
            ufo.ufoRocketTimer = 2.0;
            ufo.ufoSniperSpeed = 168;

            this.enemies.push(ufo);
            this.combatSpawnedThisLevel = true;
            this.redUfoSpawned = true;
            AudioSys.startUfoHum();
        }
        const _skipS1Ufo = (this.level === 1 && this.difficulty === 'EASY');
        if (this.level >= 1 && this.level !== 10 && this.level !== 9 && !noAsteroids && !_skipS1Ufo) {
            if (this.ufoSpawnCount < 1 && Math.random() < 0.08) {
                let ufo = (this.level >= 5) ? new Enemy(this, 'UFO_SNIPER', this.ship) : new Enemy(this, 'UFO', this.ship);
                if (this.level >= 5) ufo.ufoMode = 'sniper';
                this.enemies.push(ufo);
                this.combatSpawnedThisLevel = true;
                this.ufoSpawnCount++;
                AudioSys.startUfoHum();
            }
        }
        const noEnemies = this.enemies.filter(e => !e.isMindControlled).length === 0;
        if (this.level === 10) {
            const spawnLevel10CommandoDefender = (slot) => {
                // "Replace one with a sniper UFO"
                // Slot 'half' -> Commando
                // Slot 'boss' -> Sniper
                const type = (slot === 'boss') ? 'UFO_SNIPER' : 'UFO_COMMANDO';
                const u = new Enemy(this, type, this.ship);
                // Spawn immediately in combat mode (no entry swoop), and keep them around.
                u.entered = true;
                u.provoked = true;
                u.persistent = true;

                // Make sure they move and behave like a proper commando sniper.
                u.ufoMode = 'sniper';
                u.ufoSniperAngle = Math.random() * Math.PI * 2;
                u.ufoSniperRadius = 220;
                u.ufoSniperSpeed = 185;
                u.hp = 120; u.maxHp = 120;

                // Spawn positions: left/right to avoid immediate overlap.
                if (slot === 'half') {
                    u.x = this.width * 0.25;
                    u.y = 90;
                } else {
                    u.x = this.width * 0.75;
                    u.y = 90;
                }
                this.enemies.push(u);
                AudioSys.startUfoHum();
            };

            // Sector 10: spawn 1 commando UFO defender when half the large asteroids are destroyed.
            // It is persistent and will keep fighting even after the boss arrives.
            if (!this.level10DefenderHalfSpawned) {
                const total = Math.max(0, (this.totalLargeAsteroidsThisLevel || 0));
                const destroyed = Math.max(0, (this.largeAsteroidsDestroyedThisLevel || 0));
                if (total > 0 && destroyed >= Math.ceil(total * 0.5)) {
                    spawnLevel10CommandoDefender('half');
                    this.level10DefenderHalfSpawned = true;
                }
            }

            if (noAsteroids && !this.bossSpawned) {
                // Failsafe: track how long the asteroid field has been clear.
                // If boss somehow didn't spawn in 5 seconds, force it.
                if (!this._noAsteroidsTimer) this._noAsteroidsTimer = 0;
                this._noAsteroidsTimer += dt;

                this.enemies.push(new Enemy(this, 'BOSS', this.ship));

                // Spawn the second commando defender together with the boss.
                if (!this.level10DefenderBossSpawned) {
                    spawnLevel10CommandoDefender('boss');
                    this.level10DefenderBossSpawned = true;
                }

                const escort2 = new Enemy(this, 'MINIBOSS_INTERCEPTOR', this.ship);
                escort2.x = this.width * 0.35; escort2.y = -80;
                this.enemies.push(escort2);
                this.bossSpawned = true;
                this.bossSpawnedAt = this.levelTime;
                AudioSys.playBossEntry();
                AudioSys.startBossEngine();
                this.floatingTexts.push(new FloatingText(this.width / 2, this.height / 2, 'WARNING: BOSS', '#ff0000'));
                return;
            } else if (!noAsteroids) {
                this._noAsteroidsTimer = 0;
            }
            if (this.bossSpawned && noEnemies) {
                // Require at least 5 seconds after boss spawn before victory can trigger.
                // Prevents instant-win edge cases where the boss is removed too quickly.
                const timeSinceBoss = this.levelTime - this.bossSpawnedAt;
                if (timeSinceBoss < 5.0) return;
                if (this.levelEndTimer <= 0) this._cashOutMindControlledAllyForRoundEnd();
                this.levelEndTimer += dt;
                if (this.levelEndTimer > 5.0) this.gameVictory();
            }
        } else if (this.level === 9) {
            if (this.asteroidsToSpawn <= 0 && this.asteroids.every(a => a.type !== 'LARGE') && !this.level9WaveSpawned) {
                for (let i = 0; i < 2; i++) {
                    const e = new Enemy(this, 'MINIBOSS_INTERCEPTOR', this.ship);
                    e.x = (i === 0) ? this.width * 0.3 : this.width * 0.7; e.y = -50;
                    this.enemies.push(e);
                }
                this.floatingTexts.push(new FloatingText(this.width / 2, this.height / 2, 'WARNING: ELITE INTERCEPTORS', '#ff00ff'));
                this.level9WaveSpawned = true;
            }
            if (this.level9WaveSpawned && noEnemies) {
                // Auto-skip comeback offer — sector is already clear.
                if (this.comebackOfferActive) this.skipComebackContract();
                if (this.levelEndTimer <= 0) this._cashOutMindControlledAllyForRoundEnd();
                this.levelEndTimer += dt;
                if (this.levelEndTimer > 5.0) this.levelComplete();
            }
        } else if (this.level === 8) {
            // Sector 8 commandos spawn at level start together with the asteroids.
            // Level clear requires both the asteroid field and all hostile enemies to be gone.
            if (this.level10UfoSpawned && noAsteroids && noEnemies) {
                // Auto-skip comeback offer — sector is already clear.
                if (this.comebackOfferActive) this.skipComebackContract();
                if (this.levelEndTimer <= 0) this._cashOutMindControlledAllyForRoundEnd();
                this.levelEndTimer += dt;
                if (this.levelEndTimer > 5.0) this.levelComplete();
            }
        }
        else {
            if (noAsteroids && noEnemies) {
                // Auto-skip comeback offer — sector is already clear.
                if (this.comebackOfferActive) this.skipComebackContract();
                if (this.levelEndTimer <= 0) this._cashOutMindControlledAllyForRoundEnd();
                this.levelEndTimer += dt;
                if (this.levelEndTimer > 5.0) this.levelComplete();
            }
        }

        // Failsafe: if sector has been "empty" for 8+ seconds but levelComplete hasn't
        // fired (unexpected edge case), force the transition.
        if (noAsteroids && noEnemies && this.levelEndTimer > 8.0 && this.level < 10) {
            console.warn('DEBUG: Failsafe triggered — forcing level completion after', this.levelEndTimer.toFixed(1), 's');
            this.levelComplete();
        }
    }

    levelComplete() {
        // Safety net: if a comeback offer is still active, auto-skip it first.
        if (this.comebackOfferActive) {
            this.skipComebackContract();
        }

        this.isPlaying = false;
        CG.gameplayStop();

        // Signal positive event to CrazyGames algorithm (boosts game placement)
        try { CG.happytime(); } catch (e) { }

        // Celebration text
        this.floatingTexts.push(new FloatingText(
            this.width / 2, this.height * 0.35,
            'SECTOR COMPLETE!', '#4ade80'
        ));

        // Multiplier rules (needed early to determine achievement delay)
        const prevMult = this.scoreMultiplier;
        let gainedMult = false;
        if (this.perfectLevel && this.scoreMultiplier < 4.0) {
            gainedMult = (Math.min(4.0, this.scoreMultiplier + 1.0) > prevMult);
        }

        // Delay for achievement toasts if a voiceover will play
        const achievementDelayMs = gainedMult ? 2500 : 0;

        // Save accrued score progress at each sector clear (idempotent)
        this._commitAccruedScore(Math.floor(this.score), achievementDelayMs);
        track('sector_clear', { sector: this.level, score: Math.floor(this.score) });

        // Track best sector reached
        try {
            const prevBest = parseInt(CG.getItem('ALIENSECTOR_BEST_SECTOR') || '0', 10) || 0;
            if (this.level > prevBest) CG.setItem('ALIENSECTOR_BEST_SECTOR', String(this.level));
        } catch (e) { }

        // First-clear bonus: grant +1 life the first time the player ever clears Sector 1
        if (this.level === 1) {
            try {
                if (CG.getItem('ALIENSECTOR_FIRST_CLEAR') !== '1') {
                    CG.setItem('ALIENSECTOR_FIRST_CLEAR', '1');
                    this.lives++;
                    if (this.difficulty === 'EASY' && this.lives > 5) this.lives = 5;

                    // Achievement Toast
                    this.showAchievementToast('FIRST SECTOR CLEARED', achievementDelayMs);

                    setTimeout(() => {
                        if (!this.isPlaying || this.level !== 1) return; // guard stale timer
                        this.floatingTexts.push(new FloatingText(
                            this.width / 2, this.height * 0.45,
                            '+1 LIFE — NICE WORK CAPTAIN!', '#44ff44'
                        ));
                    }, 800);
                }
            } catch (e) { }
        }

        // Crowd reaction when a sector is cleared
        AudioSys.playAudience();

        AudioSys.stopBackgroundMusic();
        AudioSys.stopUfoHum();
        AudioSys.stopBossEngine();
        if (AudioSys.stopMindHum) AudioSys.stopMindHum();

        // Multiplier rules:
        // - Multiplier only increases on sector clear (+1), capped at x4.
        // - Multiplier deductions happen immediately on ship loss (handled in Ship.js).

        // No-loss bonus: only increase multiplier if the player took no losses this sector.
        if (this.perfectLevel && this.scoreMultiplier < 4.0) {
            this.scoreMultiplier = Math.min(4.0, this.scoreMultiplier + 1.0);
            const actuallyGained = this.scoreMultiplier > prevMult;

            // Voiceover for no-loss bonus (only if it actually increased)
            if (actuallyGained) {
                try { AudioSys.playNoLossesGoodJob && AudioSys.playNoLossesGoodJob(); } catch (e) { }
            }
        }

        const overlay = document.getElementById('center-screen-overlay');
        const levelCompleteContent = document.getElementById('level-complete-content');
        if (overlay && levelCompleteContent) {
            overlay.style.display = 'flex';
            levelCompleteContent.style.display = 'flex';

            safeSetText('level-complete-title', `SECTOR ${this.level} CLEAR`);
            safeSetText('level-complete-score', Math.floor(this.score));
            safeSetText('level-complete-multiplier', `x${this.scoreMultiplier.toFixed(1)}`);

            const bonusRow = document.getElementById('level-complete-bonus-row');
            if (bonusRow) bonusRow.setAttribute('aria-hidden', 'false');

            // Show the change so players notice the reward immediately.
            const gained = this.scoreMultiplier > prevMult;
            if (gained) {
                safeSetText(
                    'level-complete-multiplier-note',
                    `+1 (x${prevMult.toFixed(1)} → x${this.scoreMultiplier.toFixed(1)})`
                );
            } else {
                safeSetText('level-complete-multiplier-note', 'MAX (x4.0)');
            }

            // Between-sector motivation: show the next ship unlock progress.
            // _commitAccruedScore was already called above, so storage has the correct total.
            const nextShipEl = document.getElementById('next-ship-unlock');
            if (nextShipEl) {
                let msg = '';
                try {
                    const accrued = parseInt(CG.getItem('ALIENSECTOR_SCORE_ACCRUED') || '0', 10) || 0;
                    if (accrued > 0) {
                        const WINNER_UNLOCK_AT = 15000;
                        const WARLOCK_UNLOCK_AT = 100000;
                        const GHOST_UNLOCK_AT = 1000000;

                        msg = `Career Score: ${accrued.toLocaleString('en-US')}`;
                        let nextAt = 0;
                        let nextName = '';
                        if (accrued < WINNER_UNLOCK_AT) { nextAt = WINNER_UNLOCK_AT; nextName = 'Ship Upgrade'; }
                        else if (accrued < WARLOCK_UNLOCK_AT) { nextAt = WARLOCK_UNLOCK_AT; nextName = 'Ship Upgrade'; }
                        else if (accrued < GHOST_UNLOCK_AT) { nextAt = GHOST_UNLOCK_AT; nextName = 'Ship Upgrade'; }

                        if (nextAt > 0) {
                            const remaining = Math.max(0, nextAt - accrued);
                            msg += ` \u00b7 ${remaining.toLocaleString('en-US')} to ${nextName}`;
                        }
                    }
                } catch (e) { }

                if (msg) {
                    nextShipEl.style.display = 'block';
                    nextShipEl.textContent = msg;
                    nextShipEl.classList.add('ship-progress-pulse');
                } else {
                    nextShipEl.style.display = 'none';
                    nextShipEl.textContent = '';
                }
            }
        }
    }

    gameVictory() {
        this.isPlaying = false;
        CG.gameplayStop();

        // Proud VO is played when Phoenix is newly unlocked by accrued score.
        let shouldPlayProudVoice = false;
        // Celebrate a special achievement
        CG.happytime();
        AudioSys.playLevelClear();
        AudioSys.stopBackgroundMusic();
        AudioSys.stopUfoHum();
        AudioSys.stopBossEngine();
        if (AudioSys.stopMindHum) AudioSys.stopMindHum();

        const overlay = document.getElementById('center-screen-overlay');
        const statsContent = document.getElementById('victory-stats-content');
        const victoryContent = document.getElementById('game-complete-content');
        this.statsShown = false;

        const showMissionAccomplished = () => {
            if (statsContent) statsContent.style.display = 'none';
            if (victoryContent) victoryContent.style.display = 'flex';

            const lbAudio = new Audio('assets/sounds/Leaderboard.mp3');
            lbAudio.id = 'leaderboard-audio-el';
            lbAudio.volume = 0.7;
            lbAudio.loop = false;
            try {
                const muted = !!window.__cgMuteAudio;
                lbAudio.muted = muted;
                if (muted) lbAudio.volume = 0;
            } catch (e) { }
            document.body.appendChild(lbAudio);
            lbAudio.play().catch(e => console.log('Music play blocked:', e));

            const finalScore = Math.floor(this.score);
            safeSetText('victory-score', finalScore);

            const isQualifying = true;

            if (isQualifying) {
                document.getElementById('high-score-input-victory').style.display = 'flex';
                document.getElementById('victory-restart-btn').style.display = 'none';
                document.getElementById('victory-leaderboard-btn').style.display = 'none';
                document.getElementById('victory-exit-btn').style.display = 'none';

                if (shouldPlayProudVoice) {
                    shouldPlayProudVoice = false;
                    try {
                        const existing = document.getElementById('proudvoice-audio-el');
                        if (existing) existing.remove();
                        const proud = new Audio('assets/sounds/proudvoice.mp3');
                        proud.id = 'proudvoice-audio-el';
                        proud.loop = false;
                        proud.volume = 0.9;
                        try {
                            const muted = !!window.__cgMuteAudio;
                            proud.muted = muted;
                            if (muted) proud.volume = 0;
                        } catch (e) { }
                        proud.onended = () => {
                            try { proud.remove(); } catch (e) { }
                        };
                        document.body.appendChild(proud);
                        proud.play().catch(() => { });
                    } catch (e) { }
                }

                setTimeout(() => document.getElementById('player-name-input-victory')?.focus(), 100);
            } else {
                document.getElementById('high-score-input-victory').style.display = 'none';
                document.getElementById('victory-restart-btn').style.display = 'block';
                document.getElementById('victory-leaderboard-btn').style.display = 'block';
                document.getElementById('victory-exit-btn').style.display = 'block';
            }
        };

        const showStatsPage = () => {
            if (this.statsShown) return;
            this.statsShown = true;

            if (overlay && statsContent) {
                overlay.style.display = 'flex';
                statsContent.style.display = 'flex';

                const bonus = this.lives * 500;
                this.score = Math.floor(this.score + bonus);

                // Accrued score is used for ship unlocks (every 50k total).
                const unlockResult = this._commitAccruedScore(this.score);
                shouldPlayProudVoice = !!(unlockResult.justUnlockedWinner && this.ship && !this.ship.isWinnerShip && !this.ship.isHardWinnerShip);

                safeSetText('stat-lives', this.lives);
                safeSetText('stat-bonus', `+${bonus}`);
                safeSetText('stat-total', this.score);

                // Show career progress on victory stats
                const victoryNextShipEl = document.getElementById('victory-next-ship');
                if (victoryNextShipEl) {
                    let msg = '';
                    try {
                        const accrued = unlockResult.totalAfter || 0;
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
                            progressMsg += ` \u00b7 ${remaining.toLocaleString('en-US')} to ${nextName}`;
                        }
                        msg = progressMsg;
                    } catch (e) { }

                    if (msg) {
                        victoryNextShipEl.textContent = msg;
                        victoryNextShipEl.style.display = 'block';
                        victoryNextShipEl.classList.add('ship-progress-pulse');
                    } else {
                        victoryNextShipEl.style.display = 'none';
                    }
                }

                const btn = document.getElementById('stats-continue-btn');
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.onclick = () => {
                    showMissionAccomplished();
                };
            }
        };

        // No intro/outro videos. Go straight to the victory stats.
        showStatsPage();
    }

    showAchievementToast(text, delayMs = 0) {
        if (delayMs > 0) {
            setTimeout(() => this.showAchievementToast(text, 0), delayMs);
            return;
        }

        const toast = document.getElementById('achievement-toast');
        const textEl = document.getElementById('achievement-text');
        if (!toast || !textEl) return;

        textEl.textContent = text;
        toast.style.display = 'block';

        // Force reflow
        toast.offsetHeight;

        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';

        // Play appropriate celebratory sound
        try {
            if (text.includes('UNLOCKED')) AudioSys.playNewShipUnlocked();
            else AudioSys.playAudience();
        } catch (e) { }

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -10px)';
            setTimeout(() => {
                if (toast.style.opacity === '0') toast.style.display = 'none';
            }, 500);
        }, 5000);
    }

    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        const shake = ScreenShake.getOffset();
        this.ctx.save();
        this.ctx.translate(shake.x, shake.y);

        this.galaxy.draw(this.ctx, this.level);
        this.stars.forEach(s => s.draw(this.ctx));
        this.nebulas.forEach(n => n.draw(this.ctx));

        if (this.planet) this.planet.draw(this.ctx);

        this.debris.forEach(d => d.draw(this.ctx));
        this.particles.forEach(p => p.draw(this.ctx));
        this.powerups.forEach(p => p.draw(this.ctx));
        this.asteroids.forEach(a => a.draw(this.ctx));
        this.enemies.forEach(e => e.draw(this.ctx));
        this.rockets.forEach(r => r.draw(this.ctx));
        this.ship.draw(this.ctx);
        this.bullets.forEach(b => b.draw(this.ctx));
        this.floatingTexts.forEach(t => t.draw(this.ctx));

        this.ctx.restore();

        // Draw level intro text on top (not affected by screen shake)
        if (this.levelIntroTimer > 0 && this.levelIntroText) {
            const t = this.levelIntroTimer / this.levelIntroDuration;
            const alpha = Math.max(0, Math.min(1, t * t));

            // Half the previous size, and higher up on screen
            const size = Math.max(12, Math.min(21, Math.round(Math.min(this.width, this.height) * 0.03)));
            const y = this.height * 0.33;

            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = `bold ${size}px 'Segoe UI'`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowColor = 'rgba(0,0,0,0.65)';
            this.ctx.shadowBlur = 10;
            this.ctx.fillText(this.levelIntroText, this.width / 2, y);
            this.ctx.restore();
        }
    }

    _commitAccruedScore(runScore, achievementDelayMs = 0) {
        const LS_SCORE_ACCRUED = 'ALIENSECTOR_SCORE_ACCRUED';
        const LS_WINNER_SHIP_UNLOCKED = 'ALIENSECTOR_WINNER_SHIP_UNLOCKED';
        const LS_WARLOCK_SHIP_UNLOCKED = 'ALIENSECTOR_WARLOCK_SHIP_UNLOCKED';
        const LS_GHOST_SHIP_UNLOCKED = 'ALIENSECTOR_GHOST_SHIP_UNLOCKED';
        const LS_SELECTED_SHIP = 'ALIENSECTOR_SELECTED_SHIP';
        const WINNER_UNLOCK_AT = 15000;
        const WARLOCK_UNLOCK_AT = 100000;
        const GHOST_UNLOCK_AT = 1000000;

        const add = Math.max(0, Math.floor(runScore || 0));
        // Use the base snapshot captured at run start — this makes the call
        // idempotent: base + currentRunScore is always the correct total,
        // no matter how many times we call it during the same run.
        const base = (typeof this.baseAccruedScore === 'number') ? this.baseAccruedScore : 0;
        let hadWinner = false;
        let hadWarlock = false;
        let hadGhost = false;
        try {
            hadWinner = CG.getItem(LS_WINNER_SHIP_UNLOCKED) === '1';
            hadWarlock = CG.getItem(LS_WARLOCK_SHIP_UNLOCKED) === '1';
            hadGhost = CG.getItem(LS_GHOST_SHIP_UNLOCKED) === '1';
        } catch (e) { }

        const nextTotal = Math.max(0, base + add);
        const winnerNow = nextTotal >= WINNER_UNLOCK_AT;
        const warlockNow = nextTotal >= WARLOCK_UNLOCK_AT;
        const ghostNow = nextTotal >= GHOST_UNLOCK_AT;

        try {
            CG.setItem(LS_SCORE_ACCRUED, String(nextTotal));
            if (winnerNow) CG.setItem(LS_WINNER_SHIP_UNLOCKED, '1');
            if (warlockNow) CG.setItem(LS_WARLOCK_SHIP_UNLOCKED, '1');
            if (ghostNow) CG.setItem(LS_GHOST_SHIP_UNLOCKED, '1');

            // Save the score from this run so the hangar can show it when returning to menu
            CG.setItem('ALIENSECTOR_LAST_GAME_SCORE', String(add));

            // If nothing is selected yet, auto-equip the first newly unlocked ship.
            const currentSel = CG.getItem(LS_SELECTED_SHIP);
            if (!currentSel) {
                if (!hadWinner && winnerNow) CG.setItem(LS_SELECTED_SHIP, 'WINNER');
                else if (!hadWarlock && warlockNow) CG.setItem(LS_SELECTED_SHIP, 'WARLOCK');
                else if (!hadGhost && ghostNow) CG.setItem(LS_SELECTED_SHIP, 'GHOST');
            }
        } catch (e) { }

        // Trigger toasts for newly unlocked ships during the run
        if (!hadWinner && winnerNow) this.showAchievementToast('PHOENIX UNLOCKED', achievementDelayMs);
        else if (!hadWarlock && warlockNow) this.showAchievementToast('WARLOCK UNLOCKED', achievementDelayMs);
        else if (!hadGhost && ghostNow) this.showAchievementToast('GHOST UNLOCKED', achievementDelayMs);

        return {
            totalBefore: base,
            totalAfter: nextTotal,
            justUnlockedWinner: !hadWinner && winnerNow,
            justUnlockedWarlock: !hadWarlock && warlockNow,
            justUnlockedGhost: !hadGhost && ghostNow
        };
    }

    checkCollisions() {
        this.bullets.forEach(b => {
            if (b.markedForDeletion) return;
            const damage = (3.0 * Math.pow(b.life / CONFIG.BULLET_LIFETIME, 2)) * (b.damageMult || 1.0);
            this.asteroids.forEach(a => {
                if (!a.markedForDeletion && Math.hypot(b.x - a.x, b.y - a.y) < a.size + 10) {
                    b.markedForDeletion = true; a.takeDamage(damage, !b.isEnemy);
                }
            });
            if (!b.isEnemy && !this.ship.isGhostCloaked) {
                this.enemies.forEach(e => {
                    if (!e.markedForDeletion && !e.isMindControlled && Math.hypot(b.x - e.x, b.y - e.y) < 25) {
                        b.markedForDeletion = true; e.takeDamage(damage);
                    }
                });
                this.rockets.forEach(r => {
                    if (!r.markedForDeletion && Math.hypot(b.x - r.x, b.y - r.y) < 20) {
                        b.markedForDeletion = true; r.explode();
                    }
                });
            } else if (!this.ship.dead && Date.now() > this.ship.invulnerableUntil && !this.ship.isGhostCloaked) {
                if (Math.hypot(b.x - this.ship.x, b.y - this.ship.y) < CONFIG.SHIP_SIZE + 5) {
                    b.markedForDeletion = true;
                    if (this.ship.isShieldActive || this.ship.isSpawnShieldActive) AudioSys.playRicochet();
                    else this.ship.takeDamage(25);
                }
            }
        });

        // --- FIX: ADDED ROCKET VS SHIP COLLISION CHECK ---
        this.rockets.forEach(r => {
            const rocketIsEnemy = (r.isEnemy !== false);

            // Enemy rockets hit the player ship (skip if Ghost is cloaked/phasing)
            if (rocketIsEnemy && !this.ship.isGhostCloaked) {
                if (!r.markedForDeletion && Math.hypot(this.ship.x - r.x, this.ship.y - r.y) < 25) {
                    r.explode();
                    if (this.ship.isShieldActive || this.ship.isSpawnShieldActive) {
                        AudioSys.playRicochet();
                        ScreenShake.trigger(5, 0.2);
                    } else {
                        this.ship.takeDamage(20);
                    }
                }
            } else if (!rocketIsEnemy) {
                // Friendly rockets (mind-controlled allies) hit enemy ships
                this.enemies.forEach(e => {
                    if (r.markedForDeletion) return;
                    if (!e.markedForDeletion && !e.isMindControlled && Math.hypot(r.x - e.x, r.y - e.y) < 28) {
                        r.explode();
                        e.takeDamage(40);
                    }
                });
            }

            // Rockets can hit asteroids (friendly rockets should award score)
            this.asteroids.forEach(a => {
                if (!r.markedForDeletion && !a.markedForDeletion && Math.hypot(r.x - a.x, r.y - a.y) < a.size + 16) {
                    r.explode(); a.takeDamage(999, !rocketIsEnemy);
                }
            });
        });
        // -------------------------------------------------

        if (!this.ship.dead && Date.now() > this.ship.invulnerableUntil && !this.ship.isGhostCloaked) {
            this.asteroids.forEach(a => {
                if (!a.markedForDeletion) {
                    const dx = this.ship.x - a.x;
                    const dy = this.ship.y - a.y;
                    const dist = Math.hypot(dx, dy);
                    const minDist = a.size + CONFIG.SHIP_SIZE;

                    if (dist < minDist) {
                        // Collision detected. Determine if it's a "safe bump" or a crash.
                        // Relative velocity: Ship V - Asteroid V
                        const relVx = this.ship.vx - a.vx;
                        const relVy = this.ship.vy - a.vy;
                        const relSpeed = Math.hypot(relVx, relVy);
                        const safeThreshold = 120; // User requested "very low collision speed"

                        // If shield is up, we always explode (ramming is a viable tactic).
                        // If shield is DOWN, we check for safe bump.
                        const shieldUp = this.ship.isShieldActive || this.ship.isSpawnShieldActive;

                        if (!shieldUp && relSpeed < safeThreshold) {
                            // SAFE BUMP
                            AudioSys.playRockHit(); // "Thud" instead of "Blip"

                            // Push apart based on overlap + a little extra Bounce
                            const angle = Math.atan2(dy, dx);
                            const pushForce = 80;

                            if (a.type === 'LARGE') {
                                // HEAVY BUMP: Player bounces off the asteroid (asteroid stays put).
                                // Apply more force to the ship since it takes all the energy.
                                this.ship.vx += Math.cos(angle) * (pushForce * 1.8);
                                this.ship.vy += Math.sin(angle) * (pushForce * 1.8);

                                // Nudge ONLY the ship out of overlap
                                const overlap = minDist - dist;
                                if (overlap > 0) {
                                    this.ship.x += Math.cos(angle) * overlap;
                                    this.ship.y += Math.sin(angle) * overlap;
                                }
                            } else {
                                // LIGHT BUMP: Both objects push apart (shared mass).
                                this.ship.vx += Math.cos(angle) * pushForce;
                                this.ship.vy += Math.sin(angle) * pushForce;

                                a.vx -= Math.cos(angle) * pushForce;
                                a.vy -= Math.sin(angle) * pushForce;

                                // Shared nudge
                                const overlap = minDist - dist;
                                if (overlap > 0) {
                                    this.ship.x += Math.cos(angle) * overlap * 0.5;
                                    this.ship.y += Math.sin(angle) * overlap * 0.5;
                                    a.x -= Math.cos(angle) * overlap * 0.5;
                                    a.y -= Math.sin(angle) * overlap * 0.5;
                                }
                            }
                        }
                        else {
                            // CRASH / SHIELD RAM
                            if (shieldUp) {
                                a.explode();
                                AudioSys.playExplosion(a.type === 'LARGE');
                                ScreenShake.trigger(5, 0.2);
                            } else {
                                this.ship.takeDamage(34);
                                a.explode();
                            }
                        }
                    }
                }
            });
            this.enemies.forEach(e => {
                if (!e.markedForDeletion && !e.isMindControlled && Math.hypot(this.ship.x - e.x, this.ship.y - e.y) < 30) {
                    if (this.ship.isShieldActive || this.ship.isSpawnShieldActive) {
                        if (e.type === 'BOSS') { e.takeDamage(50); this.ship.vx *= -0.8; this.ship.vy *= -0.8; AudioSys.playRicochet(); ScreenShake.trigger(10, 0.4); }
                        else { e.explode(); AudioSys.playExplosion(true); ScreenShake.trigger(5, 0.2); }
                    } else {
                        // During a comeback contract, crashing into an enemy must count as
                        // failure even if the enemy would die — ship dies, enemy survives.
                        if (this.comebackActive) {
                            this.ship.takeDamage(999);
                        } else {
                            this.ship.takeDamage(999); e.takeDamage(10);
                        }
                    }
                }
            });
            this.powerups.forEach(p => {
                if (!p.markedForDeletion && Math.hypot(this.ship.x - p.x, this.ship.y - p.y) < 30) {
                    p.markedForDeletion = true;
                    track('powerup_pickup', { type: p.type, sector: this.level });
                    if (p.type === 'SHIELD') { this.ship.shieldCount++; this.floatingTexts.push(new FloatingText(this.ship.x, this.ship.y - 40, '+1 SHIELD', '#00aaff')); }
                    else if (p.type === 'DOUBLE_FIRE') {
                        this.ship.rapidFireStacks = Math.min(2, (this.ship.rapidFireStacks || 0) + 1);
                        this.ship.doubleFireTimer = (this.ship.doubleFireTimer > 0) ? this.ship.doubleFireTimer + 15 : 15;
                        // User Request: "1x double the speed on rapidfire is fast enough".
                        // So we cap the multiplier at 0.5 (2x speed) even if stacks are higher (e.g. for spread).
                        this.ship.fireRateMult = Math.max(0.5, 1 / (1 + this.ship.rapidFireStacks));
                        // Newbie powerups should not award score to prevent veteran exploit
                        // (open a new browser → get beginner drops → inflate leaderboard score).
                        // EASY mode has its own leaderboard, so scoring is allowed there.
                        const isNewbiePowerup = this.difficulty !== 'EASY' && !!(p.isNewbieDrop);
                        if (!isNewbiePowerup) {
                            const basePoints = 1000;
                            const points = Math.floor(basePoints * this.scoreMultiplier);
                            this.score += points;
                            const scoreColor = (this.scoreMultiplier > 1.0) ? '#ffd700' : '#ff4500';
                            this.floatingTexts.push(new FloatingText(this.ship.x, this.ship.y - 40, `RAPID FIRE! +${points}`, scoreColor));
                        } else {
                            this.floatingTexts.push(new FloatingText(this.ship.x, this.ship.y - 40, `RAPID FIRE!`, '#ff4500'));
                        }
                    }
                    else if (p.type === 'REPAIR') {
                        // REPAIR: heal instantly + grant GOLD spawn shield for protection.
                        this.ship.hp = this.ship.maxHp;
                        this.ship.activateSpawnShield(4000, true);
                    }
                    else if (p.type === 'LIFE') { this.lives++; if (this.difficulty === 'EASY' && this.lives > 5) this.lives = 5; this.floatingTexts.push(new FloatingText(this.ship.x, this.ship.y - 40, '+1 LIFE', '#44ff44')); }
                    AudioSys.playShield();
                }
            });
        }
    }

    updateHUD() {
        safeSetText('score-display', Math.floor(this.score));
        safeSetText('lives-display', this.lives);
        safeSetText('level-display', this.level);

        // Desktop HUD mirrors (only present on desktop)
        safeSetText('score-display-desktop', Math.floor(this.score));
        safeSetText('lives-display-desktop', this.lives);
        safeSetText('level-display-desktop', this.level);
        safeSetText('shield-display', this.ship.shieldCount);

        const shieldMob = document.getElementById('shield-count-mobile');
        if (shieldMob) shieldMob.innerText = this.ship.shieldCount;

        let topScore = GlobalLeaderboard?.getWorldBest(this.difficulty) || Leaderboard?.getScores().filter(s => s.difficulty === this.difficulty)[0]?.score || 0;
        safeSetText('highscore-display', Math.floor(topScore));
        safeSetText('highscore-display-desktop', Math.floor(topScore));

        const active = this.scoreMultiplier > 1.0;

        const bonusDisplay = document.getElementById('bonus-display');
        if (bonusDisplay) {
            bonusDisplay.innerText = `x${this.scoreMultiplier.toFixed(1)}`;
            document.getElementById('bonus-panel')?.classList.toggle('bonus-active', active);
            bonusDisplay.classList.toggle('bonus-text-active', active);
        }

        const bonusDisplayDesktop = document.getElementById('bonus-display-desktop');
        if (bonusDisplayDesktop) {
            bonusDisplayDesktop.innerText = `x${this.scoreMultiplier.toFixed(1)}`;
            document.getElementById('bonus-panel-desktop')?.classList.toggle('bonus-active', active);
            bonusDisplayDesktop.classList.toggle('bonus-text-active', active);
        }

        // Desktop hearts row (optional)
        const hearts = document.getElementById('lives-hearts-desktop');
        if (hearts) {
            const n = Math.max(0, Math.min(10, this.lives | 0));
            let html = '';
            for (let i = 0; i < n; i++) html += '<span class="hud-heart">❤</span>';
            hearts.innerHTML = html;
        }

        // Check career milestones for beginner engagement toasts
        this._checkCareerMilestones();
    }

    _checkCareerMilestones() {
        const milestones = [10000, 25000, 50000];
        const total = (this.baseAccruedScore || 0) + Math.floor(this.score);
        for (const m of milestones) {
            if (total >= m && !this._careerMilestonesShown.has(m)) {
                this._careerMilestonesShown.add(m);
                const label = m >= 1000 ? `${(m / 1000)}K` : String(m);
                this.floatingTexts.push(
                    new FloatingText(this.width / 2, this.height * 0.3, `\u2B50 ${label} CAREER POINTS!`, '#ffd700')
                );
            }
        }
    }

    endGame() {
        this.isPlaying = false;
        CG.gameplayStop();
        AudioSys.stopBackgroundMusic(); AudioSys.stopUfoHum(); AudioSys.stopBossEngine();
        if (AudioSys.stopMindHum) AudioSys.stopMindHum();
        const finalScore = Math.floor(this.score);
        track('game_over', { sector: this.level, score: finalScore, ship: this.shipType || 'HERO', difficulty: this.difficulty || 'NORMAL' });
        // Accrued score is used for ship unlocks (every 50k total).
        this._commitAccruedScore(finalScore);
        safeSetText('final-score', finalScore);
        safeSetText('final-level', this.level);

        // Personal best tracking
        const pbEl = document.getElementById('gameover-personal-best');
        if (pbEl) {
            try {
                const storedBest = parseInt(CG.getItem('ALIENSECTOR_PERSONAL_BEST') || '0', 10) || 0;
                if (finalScore > storedBest) {
                    CG.setItem('ALIENSECTOR_PERSONAL_BEST', String(finalScore));
                    pbEl.style.display = 'block';
                    pbEl.style.color = '#ffd700';
                    pbEl.textContent = '★ NEW PERSONAL BEST!';
                } else if (storedBest > 0) {
                    pbEl.style.display = 'block';
                    pbEl.style.color = '#aaa';
                    pbEl.textContent = `Personal Best: ${storedBest.toLocaleString('en-US')}`;
                } else {
                    pbEl.style.display = 'none';
                }
            } catch (e) { pbEl.style.display = 'none'; }
        }
        // Track best sector reached
        try {
            const prevBestSector = parseInt(CG.getItem('ALIENSECTOR_BEST_SECTOR') || '0', 10) || 0;
            if (this.level > prevBestSector) CG.setItem('ALIENSECTOR_BEST_SECTOR', String(this.level));
        } catch (e) { }

        document.getElementById('center-screen-overlay').style.display = 'flex';
        document.getElementById('game-over-content').style.display = 'flex';
        const isHigh = Leaderboard.isHighScore(this.score, this.difficulty);
        document.getElementById('high-score-input').style.display = isHigh ? 'flex' : 'none';
        document.getElementById('restart-btn').style.display = isHigh ? 'none' : 'block';
        if (isHigh) setTimeout(() => document.getElementById('player-name-input')?.focus(), 100);

        // Show next ship unlock progress on game-over to motivate retries
        const nextShipEl = document.getElementById('gameover-next-ship');
        if (nextShipEl) {
            try {
                const accrued = parseInt(CG.getItem('ALIENSECTOR_SCORE_ACCRUED') || '0', 10) || 0;
                const WINNER_UNLOCK_AT = 15000;
                const WARLOCK_UNLOCK_AT = 100000;
                const GHOST_UNLOCK_AT = 1000000;

                let nextAt = 0;
                let nextName = '';
                if (accrued < WINNER_UNLOCK_AT) { nextAt = WINNER_UNLOCK_AT; nextName = 'PHOENIX'; }
                else if (accrued < WARLOCK_UNLOCK_AT) { nextAt = WARLOCK_UNLOCK_AT; nextName = 'WARLOCK'; }
                else if (accrued < GHOST_UNLOCK_AT) { nextAt = GHOST_UNLOCK_AT; nextName = 'GHOST'; }

                if (nextAt > 0) {
                    const remaining = Math.max(0, nextAt - accrued);
                    const shipImages = { 'PHOENIX': 'assets/ships/winnership.png', 'WARLOCK': 'assets/ships/mindship.png', 'GHOST': 'assets/ships/ghost.png' };
                    const imgSrc = shipImages[nextName] || '';
                    const progress = Math.min(100, (accrued / nextAt) * 100);
                    nextShipEl.style.display = 'block';
                    nextShipEl.innerHTML = `
                      <div style="display:flex; align-items:center; gap:12px; justify-content:center; margin-top:6px;">
                        <img src="${imgSrc}" alt="${nextName}" style="width:48px; height:48px; object-fit:contain; filter:drop-shadow(0 0 8px rgba(136,255,255,0.5));">
                        <div style="text-align:left;">
                          <div style="color:#88ffff; font-weight:900; letter-spacing:1px;">UNLOCK ${nextName}</div>
                          <div style="background:rgba(255,255,255,0.1); border-radius:4px; height:6px; width:160px; margin-top:4px; overflow:hidden;">
                            <div style="background:linear-gradient(90deg,#ffd700,#ffaa00); height:100%; width:${progress.toFixed(1)}%;"></div>
                          </div>
                          <div style="color:#aaa; font-size:11px; margin-top:2px;">${remaining.toLocaleString('en-US')} pts to go</div>
                        </div>
                      </div>`;
                } else {
                    nextShipEl.style.display = 'none';
                }
            } catch (e) {
                nextShipEl.style.display = 'none';
            }
        }
    }
}
