export const AudioSys = {
    ctx: null,
    noiseBuffer: null,

    // Buffers for loaded sounds
    buffers: {
        ufo: null,
        playerBlaster: null,
        alienBlaster: null,
        bossBlaster: null,
        bossEngine: null,
        bossEntry: null,
        missile: null,
        shipDestruction: null,
        bgMusic: null,
        leaderboardMusic: null
    },

    // Active Sources (for looping sounds we need to stop)
    sources: {
        ufo: null,
        bossEngine: null,
        bgMusic: null,
        leaderboardMusic: null
    },

    // Gain nodes for volume control of active loops
    gains: {
        ufo: null,
        bossEngine: null,
        bgMusic: null,
        leaderboardMusic: null
    },

    // Internal: track async asset loading + queued play attempts
    _assetsLoadingPromise: null,
    _pendingPlays: {},
    _pendingLoops: {},

    // Tracked one-shot sources (for sounds that need to be stoppable)
    _contractSource: null,
    _contractGain: null,

    // NEW: track if a priority voiceover is currently playing
    isVoiceoverPlaying: false,

    // Legacy variables for beam (to prevent crashes on pause)
    beamOsc: null,
    beamGain: null,

    // Mind control hum (Warlock ability)
    mindHumOsc: null,
    mindHumGain: null,
    mindHumFilter: null,

    // iOS Safari kan "suspendera" WebAudio efter video med ljud.
    // Den här ser till att AudioContext är igång innan vi spelar ljud.
    ensureRunning: function () {
        if (!this.ctx) return Promise.resolve();
        if (this.ctx.state === 'suspended') {
            return this.ctx.resume().catch(() => { });
        }
        return Promise.resolve();
    },

    // iOS/iPad fix: Explicitly play a silent sound to "warm up" the audio engine.
    // Call this from a direct user interaction event (touchstart/click).
    unlock: function () {
        if (!this.ctx) this.init();
        this.ensureRunning();

        try {
            // Play a tiny silent buffer. This forces iOS WebAudio to wake up even if assets aren't loaded yet.
            const buffer = this.ctx.createBuffer(1, 1, 22050);
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.ctx.destination);
            source.start(0);
        } catch (e) { }
    },

    init: function () {
        if (this.ctx) return;

        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.ensureRunning();

        // Generate noise buffer for synth effects (hits)
        const bufferSize = this.ctx.sampleRate * 2.0;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        // Start loading audio files (async).
        this.assetsLoaded = false;
        this._assetsLoadingPromise = this.loadAssets()
            .then(() => { this.assetsLoaded = true; })
            .catch(() => { })
            .finally(() => { this._assetsLoadingPromise = null; });
    },

    loadAssets: async function () {
        if (!this.ctx) return;

        const AUDIO_V = 6000;
        const fileMap = {
            ufo: `assets/sounds/UFO.mp3?v=${AUDIO_V}`,
            playerBlaster: `assets/sounds/player_blaster.mp3?v=${AUDIO_V}`,
            alienBlaster: `assets/sounds/alien_blasters.mp3?v=${AUDIO_V}`,
            bossBlaster: `assets/sounds/boss_blaster.mp3?v=${AUDIO_V}`,
            bossEngine: `assets/sounds/boss_engine.mp3?v=${AUDIO_V}`,
            bossEntry: `assets/sounds/Boss_Enters.mp3?v=${AUDIO_V}`,
            missile: `assets/sounds/missile_launch.mp3?v=${AUDIO_V}`,
            shipDestruction: `assets/sounds/shipdestruction.mp3?v=${AUDIO_V}`,
            PlayershipDestruction: `assets/sounds/shipdestruction2.mp3?v=${AUDIO_V}`,
            bgMusic: `assets/sounds/background_sound.mp3?v=${AUDIO_V}`,
            audience: `assets/sounds/audience.mp3?v=${AUDIO_V}`,
            goodjobnewrecord: `assets/sounds/goodjobnewrecord.mp3?v=${AUDIO_V}`,
            goodjobleaderboards: `assets/sounds/goodjobleaderboards.mp3?v=${AUDIO_V}`,
            bonuspointlost: `assets/sounds/bonuspointlost.mp3?v=${AUDIO_V}`,
            nolossesgoodjob: `assets/sounds/nolossesgoodjob.mp3?v=${AUDIO_V}`,
            leaderboardMusic: `assets/sounds/Leaderboard.mp3?v=${AUDIO_V}`,
            playerThruster: `assets/sounds/Playerthruster.mp3?v=${AUDIO_V}`,
            newship: `assets/sounds/newship.mp3?v=${AUDIO_V}`,
            contract: `assets/sounds/contract.mp3?v=${AUDIO_V}`
        };

        // Loading sequentially - exact pattern from stable old build
        for (const [key, path] of Object.entries(fileMap)) {
            try {
                const response = await fetch(path);
                const arrayBuffer = await response.arrayBuffer();
                this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
                console.log(`Loaded audio: ${key}`);
            } catch (e) {
                console.warn(`Failed to load audio: ${path}`, e);
            }
        }
    },

    // --- HELPER TO PLAY ONE-SHOT SOUNDS ---
    playSound: function (bufferKey, volume = 0.5, pitchMod = 1.0) {
        if (typeof window !== 'undefined' && window.__cgMuteAudio) return;
        if (!this.ctx) return;
        if (!this.buffers[bufferKey]) {
            // If the sound is requested before decoding finishes, retry once after load.
            if (this._assetsLoadingPromise && !this._pendingPlays[bufferKey]) {
                this._pendingPlays[bufferKey] = true;
                this._assetsLoadingPromise
                    .then(() => {
                        this._pendingPlays[bufferKey] = false;
                        this.playSound(bufferKey, volume, pitchMod);
                    })
                    .catch(() => { this._pendingPlays[bufferKey] = false; });
            }
            return;
        }

        this.ensureRunning();

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[bufferKey];
        // Pitch modification: 1.0 is normal, >1.0 is higher/faster, <1.0 is lower/slower
        if (pitchMod !== 1.0) source.playbackRate.value = pitchMod;

        const gain = this.ctx.createGain();
        gain.gain.value = volume;

        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);

        return source;
    },

    // --- HELPER TO START LOOPING SOUNDS ---
    startLoop: function (bufferKey, sourceKey, volume = 0.5, fadeIn = 0.5) {
        if (typeof window !== 'undefined' && window.__cgMuteAudio) return;
        if (!this.ctx || this.sources[sourceKey]) return;
        if (!this.buffers[bufferKey]) {
            // If a loop is requested before decoding finishes, retry once after load.
            if (this._assetsLoadingPromise && !this._pendingLoops[sourceKey]) {
                this._pendingLoops[sourceKey] = true;
                this._assetsLoadingPromise
                    .then(() => {
                        this._pendingLoops[sourceKey] = false;
                        this.startLoop(bufferKey, sourceKey, volume, fadeIn);
                    })
                    .catch(() => { this._pendingLoops[sourceKey] = false; });
            }
            return;
        }

        this.ensureRunning();

        const t = this.ctx.currentTime;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[bufferKey];
        source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + fadeIn);

        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);

        this.sources[sourceKey] = source;
        this.gains[sourceKey] = gain;
    },

    // --- HELPER TO STOP LOOPING SOUNDS ---
    stopLoop: function (sourceKey, fadeOut = 0.5) {
        if (!this.sources[sourceKey]) return;

        const t = this.ctx.currentTime;
        const source = this.sources[sourceKey];
        const gain = this.gains[sourceKey];

        this.sources[sourceKey] = null;
        this.gains[sourceKey] = null;

        if (gain) {
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(gain.gain.value, t);
            gain.gain.linearRampToValueAtTime(0, t + fadeOut);
        }
        if (source) {
            source.stop(t + fadeOut + 0.1);
        }
    },

    // --- SPECIFIC TRIGGERS ---

    playBackgroundMusic: function () { this.startLoop('bgMusic', 'bgMusic', 0.55, 2.0); },
    stopBackgroundMusic: function () { this.stopLoop('bgMusic', 1.5); },

    playLeaderboardMusic: function () { this.startLoop('leaderboardMusic', 'leaderboardMusic', 0.4, 1.0); },
    stopLeaderboardMusic: function () { this.stopLoop('leaderboardMusic', 1.0); },

    startBossEngine: function () { this.startLoop('bossEngine', 'bossEngine', 0.6, 1.0); },
    stopBossEngine: function () { this.stopLoop('bossEngine', 1.0); },

    startUfoHum: function () { this.startLoop('ufo', 'ufo', 0.3, 0.5); },
    stopUfoHum: function () { this.stopLoop('ufo', 0.5); },

    // UPDATED: Volume drastically reduced as requested (0.1)
    playPlayerFire: function () { this.playSound('playerBlaster', 0.1); },

    playEnemyFire: function () { this.playSound('alienBlaster', 0.25, 0.9 + Math.random() * 0.2); },
    playBossFire: function () { this.playSound('bossBlaster', 0.5); },
    playBossEntry: function () { this.playSound('bossEntry', 0.8); },
    playMissileLaunch: function () { this.playSound('missile', 0.4); },
    playPlayerExplosion: function () { this.playSound('PlayershipDestruction', 0.99); },
    playAudience() { this.playSound('audience', 0.4); },
    playGoodJobNewRecord() { this.playSound('goodjobnewrecord', 0.9); },
    playGoodJobLeaderboards() { this.playSound('goodjobleaderboards', 0.9); },
    playBonusPointLost() { this.playSound('bonuspointlost', 0.95); },
    playNoLossesGoodJob() {
        const source = this.playSound('nolossesgoodjob', 0.95);
        if (source) {
            this.isVoiceoverPlaying = true;
            source.onended = () => { this.isVoiceoverPlaying = false; };
        }
    },
    playNewShipUnlocked() { this.playSound('newship', 0.95); },

    playContractOffer() {
        // Play contract.mp3 but track it so it can be stopped
        if (typeof window !== 'undefined' && window.__cgMuteAudio) return;
        if (!this.ctx || !this.buffers.contract) return;

        this.stopContractOffer(); // Stop any existing contract sound first

        this.ensureRunning();

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers.contract;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.95;

        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);

        // Track so we can stop it later
        this._contractSource = source;
        this._contractGain = gain;

        // Clean up when done
        source.onended = () => {
            if (this._contractSource === source) {
                this._contractSource = null;
                this._contractGain = null;
            }
        };
    },

    stopContractOffer() {
        if (!this._contractSource) return;
        try {
            const t = this.ctx.currentTime;
            if (this._contractGain) {
                this._contractGain.gain.cancelScheduledValues(t);
                this._contractGain.gain.setValueAtTime(this._contractGain.gain.value, t);
                this._contractGain.gain.linearRampToValueAtTime(0, t + 0.1);
            }
            this._contractSource.stop(t + 0.15);
        } catch (e) { }
        this._contractSource = null;
        this._contractGain = null;
    },

    // --- SHARED EFFECTS ---

    // UPDATED: Pitch shifting logic for small vs large explosions
    playExplosion: function (isLarge = false) {
        if (isLarge) {
            // Massive explosion: Normal pitch (1.0), Loud volume (0.8)
            this.playSound('shipDestruction', 0.35, 1.0);
        } else {
            // Debris/Small Rock: High pitch (1.5x speed), Quiet volume (0.15)
            // This creates a "crunch" sound using the same file
            this.playSound('shipDestruction', 0.15, 1.5);
        }
    },

    playHit: function () {
        if (!this.ctx) return;

        this.ensureRunning();

        const t = this.ctx.currentTime;
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(1000, t);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noiseSrc.start();
        noiseSrc.stop(t + 0.1);
    },

    playVehicleHit: function () { this.playHit(); },
    playRockHit: function () { this.playHit(); },
    playShield: function () { this.playHit(); },

    playRicochet: function () {
        if (!this.ctx) return;

        this.ensureRunning();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.22);
    },

    playThrust: function () {
        if (!this.ctx) return;

        this.ensureRunning();

        // Prefer the real thruster sound if it loaded
        if (this.buffers.playerThruster) {
            // Small pitch variation so it doesn't sound identical every time
            this.playSound('playerThruster', 0.003, 0.95 + Math.random() * 0.1);
            return;
        }

        // Fallback: old synthetic thrust noise (keeps game working if file missing)
        const t = this.ctx.currentTime;
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(300, t);
        noiseFilter.Q.value = 0.7;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.1, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noiseSrc.start();
        noiseSrc.stop(t + 0.3);
    },

    playBeamStart: function () {
        if (!this.ctx || this.beamOsc) return;

        this.ensureRunning();

        const t = this.ctx.currentTime;
        this.beamOsc = this.ctx.createOscillator();
        this.beamGain = this.ctx.createGain();
        this.beamOsc.type = 'sawtooth';
        this.beamOsc.frequency.setValueAtTime(600, t);
        this.beamGain.gain.setValueAtTime(0, t);
        this.beamGain.gain.linearRampToValueAtTime(0.18, t + 0.15);
        this.beamOsc.connect(this.beamGain);
        this.beamGain.connect(this.ctx.destination);
        this.beamOsc.start(t);
    },

    stopBeam: function () {
        if (!this.beamOsc) return;
        const t = this.ctx.currentTime;
        const osc = this.beamOsc;
        const gain = this.beamGain;
        this.beamOsc = null;
        this.beamGain = null;
        if (!gain) {
            osc.stop(t);
            return;
        }
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.1);
        osc.stop(t + 0.12);
    },

    setMindHum: function (progress = 0) {
        // progress: 0..1. Creates/updates a low hum. Only used while mind control is actively affecting a target.
        if (typeof window !== 'undefined' && window.__cgMuteAudio) {
            this.stopMindHum(0.05);
            return;
        }
        if (!this.ctx) return;

        this.ensureRunning();

        const p = Math.max(0, Math.min(1, progress));
        const t = this.ctx.currentTime;

        if (!this.mindHumOsc) {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, t);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.0, t);
            gain.gain.linearRampToValueAtTime(0.02, t + 0.08);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(t);

            this.mindHumOsc = osc;
            this.mindHumFilter = filter;
            this.mindHumGain = gain;
        }

        // Map progress to pitch + volume ("brighter" as you get closer to success).
        const freq = 70 + p * 120;
        const vol = 0.02 + p * 0.08;

        try {
            this.mindHumOsc.frequency.cancelScheduledValues(t);
            this.mindHumOsc.frequency.setValueAtTime(this.mindHumOsc.frequency.value, t);
            this.mindHumOsc.frequency.linearRampToValueAtTime(freq, t + 0.05);
        } catch (e) { }

        if (this.mindHumGain) {
            this.mindHumGain.gain.cancelScheduledValues(t);
            this.mindHumGain.gain.setValueAtTime(this.mindHumGain.gain.value, t);
            this.mindHumGain.gain.linearRampToValueAtTime(vol, t + 0.06);
        }
    },

    stopMindHum: function (fadeOut = 0.15) {
        if (!this.ctx) return;
        if (!this.mindHumOsc) return;

        const t = this.ctx.currentTime;
        const osc = this.mindHumOsc;
        const gain = this.mindHumGain;

        this.mindHumOsc = null;
        this.mindHumGain = null;
        this.mindHumFilter = null;

        try {
            if (gain) {
                gain.gain.cancelScheduledValues(t);
                gain.gain.setValueAtTime(gain.gain.value, t);
                gain.gain.linearRampToValueAtTime(0.0001, t + fadeOut);
            }
            osc.stop(t + fadeOut + 0.05);
        } catch (e) { }
    },

    playMindControlSuccess: function () {
        if (typeof window !== 'undefined' && window.__cgMuteAudio) return;
        if (!this.ctx) return;

        this.ensureRunning();

        const t = this.ctx.currentTime;
        const baseFreq = 220;
        const freqs = [baseFreq, baseFreq * 1.5, baseFreq * 2.0];

        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t + i * 0.05);
            osc.frequency.exponentialRampToValueAtTime(f * 2.4, t + i * 0.05 + 0.18);
            gain.gain.setValueAtTime(0.08, t + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t + i * 0.05);
            osc.stop(t + i * 0.05 + 0.22);
        });
    },

    playLevelClear: function () {
        if (!this.ctx) return;

        this.ensureRunning();

        const t = this.ctx.currentTime;
        const freqs = [440, 660, 880];
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t + i * 0.12);
            gain.gain.setValueAtTime(0.15, t + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t + i * 0.12);
            osc.stop(t + i * 0.12 + 0.26);
        });
    }
};

export const ScreenShake = {
    intensity: 0,
    duration: 0,
    timer: 0,

    trigger(power = 5, time = 0.3) {
        this.intensity = power;
        this.duration = time;
        this.timer = time;
    },

    update(dt) {
        if (this.timer > 0) {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.intensity = 0;
                this.timer = 0;
            }
        }
    },

    getOffset() {
        if (this.intensity <= 0) return { x: 0, y: 0 };
        const progress = this.timer / this.duration;
        const currentIntensity = this.intensity * progress;
        return {
            x: (Math.random() - 0.5) * currentIntensity,
            y: (Math.random() - 0.5) * currentIntensity
        };
    }
};

export const Joystick = {
    active: false,
    baseEl: null,
    stickEl: null,
    zoneEl: null,
    touchId: null,
    x: 0,
    y: 0,
    angle: 0,
    power: 0,

    initialized: false,

    init: function () {
        if (this.initialized) return;
        this.initialized = true;

        this.baseEl = document.getElementById('joystick-base');
        this.stickEl = document.getElementById('joystick-stick');
        this.zoneEl = document.getElementById('joystick-zone');
        if (!this.zoneEl) return;

        this.baseEl.style.transform = 'translate(-50%, -50%)';
        this.zoneEl.style.touchAction = 'none';

        this.stickEl.style.position = 'absolute';
        this.stickEl.style.left = '50%';
        this.stickEl.style.top = '50%';
        this.stickEl.style.transform = 'translate(-50%, -50%)';

        this.zoneEl.addEventListener('touchstart', (e) => this.handleStart(e, false), { passive: false });
        this.zoneEl.addEventListener('touchmove', (e) => this.handleMove(e, false), { passive: false });
        this.zoneEl.addEventListener('touchend', (e) => this.handleEnd(e, false), { passive: false });
        this.zoneEl.addEventListener('touchcancel', (e) => this.handleEnd(e, false), { passive: false });

        this.zoneEl.addEventListener('mousedown', (e) => this.handleStart(e, true));
        window.addEventListener('mousemove', (e) => this.handleMove(e, true));
        window.addEventListener('mouseup', (e) => this.handleEnd(e, true));
    },

    handleStart: function (e, isMouse) {
        if (!this.zoneEl) return;

        e.preventDefault();
        this.active = true;

        let clientX, clientY;
        if (isMouse) {
            clientX = e.clientX;
            clientY = e.clientY;
        } else {
            const touch = e.changedTouches[0];
            this.touchId = touch.identifier;
            clientX = touch.clientX;
            clientY = touch.clientY;
        }

        const rect = this.zoneEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        this.baseEl.style.display = 'block';
        this.baseEl.style.left = `${x}px`;
        this.baseEl.style.top = `${y}px`;

        this.stickEl.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';

        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.power = 0;
    },

    handleMove: function (e, isMouse) {
        if (!this.active) return;
        e.preventDefault();

        let clientX, clientY;
        if (isMouse) {
            clientX = e.clientX;
            clientY = e.clientY;
        } else {
            let touch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    touch = e.changedTouches[i];
                    break;
                }
            }
            if (!touch) return;
            clientX = touch.clientX;
            clientY = touch.clientY;
        }

        const rect = this.zoneEl.getBoundingClientRect();
        const baseX = parseFloat(this.baseEl.style.left);
        const baseY = parseFloat(this.baseEl.style.top);

        let dx = (clientX - rect.left) - baseX;
        let dy = (clientY - rect.top) - baseY;

        const maxDist = 60;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.angle = Math.atan2(dy, dx);
        this.power = Math.min(dist / maxDist, 1.0);

        if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
        }

        this.stickEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;

        this.x = dx / maxDist;
        this.y = dy / maxDist;
    },

    handleEnd: function (e, isMouse) {
        if (!this.active) return;
        if (!isMouse) {
            let ended = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    ended = true;
                    break;
                }
            }
            if (!ended) return;
        }

        this.active = false;
        this.touchId = null;
        this.x = 0;
        this.y = 0;
        this.power = 0;

        this.baseEl.style.display = 'none';
    }
};

export const Leaderboard = {
    key: 'astroCommanderScores',

    init() {
        try {
            if (!localStorage.getItem(this.key)) {
                localStorage.setItem(this.key, JSON.stringify([]));
            }
        } catch (e) {
            console.warn('Leaderboard init failed', e);
        }
    },

    getScores() {
        try {
            const data = localStorage.getItem(this.key);
            if (!data) return [];

            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed)) return [];

            // Backwards compatible: old entries may not have difficulty
            return parsed.map((s) => {
                const difficulty = String(s?.difficulty || 'NORMAL').toUpperCase();
                return {
                    name: s?.name || 'Pilot',
                    score: Number(s?.score || 0),
                    difficulty: difficulty === 'HARD' ? 'HARD' : difficulty === 'EASY' ? 'EASY' : 'NORMAL'
                };
            });
        } catch (e) {
            console.warn('Leaderboard read failed', e);
            return [];
        }
    },

    saveScore(name, score, difficulty = 'NORMAL') {
        const scores = this.getScores();
        const d = String(difficulty || 'NORMAL').toUpperCase();
        const cleanScore = Math.floor(Number(score || 0));

        scores.push({
            name,
            score: cleanScore,
            difficulty: d === 'HARD' ? 'HARD' : d === 'EASY' ? 'EASY' : 'NORMAL'
        });

        // Keep a top-10 list PER difficulty.
        // This keeps Leaderboard.isHighScore() (which is per-difficulty) consistent with what we store.
        const easys = scores.filter(s => s.difficulty === 'EASY').sort((a, b) => b.score - a.score).slice(0, 10);
        const normals = scores.filter(s => s.difficulty === 'NORMAL').sort((a, b) => b.score - a.score).slice(0, 20);
        const hards = scores.filter(s => s.difficulty === 'HARD').sort((a, b) => b.score - a.score).slice(0, 10);

        const trimmed = easys.concat(normals).concat(hards).sort((a, b) => b.score - a.score);

        try {
            localStorage.setItem(this.key, JSON.stringify(trimmed));
        } catch (e) {
            console.warn('Leaderboard save failed', e);
        }
    },

    addScore(name, score, difficulty = 'NORMAL') {
        this.saveScore(name, score, difficulty);
    },

    isHighScore(score, difficulty = 'NORMAL') {
        const d = String(difficulty || 'NORMAL').toUpperCase();
        const scores = this.getScores().filter(s => s.difficulty === (d === 'HARD' ? 'HARD' : d === 'EASY' ? 'EASY' : 'NORMAL'));
        const limit = (d === 'HARD') ? 10 : (d === 'EASY') ? 10 : 20;
        if (scores.length < limit) return true;
        return score > scores[scores.length - 1].score;
    },

    render(elementId) {
        const listEl = document.getElementById(elementId) || document.getElementById('leaderboard-entries');
        const loadingEl = document.getElementById('leaderboard-loading');

        if (loadingEl) loadingEl.style.display = 'none';
        if (listEl) listEl.style.display = 'block';
        if (!listEl) return;

        const scores = this.getScores();
        if (scores.length === 0) {
            listEl.innerHTML = '<p class="no-scores">No scores yet. Be the first!</p>';
            return;
        }

        listEl.innerHTML = scores.map((s, i) => {
            const mode = (s && s.difficulty === 'HARD') ? 'HARD' : (s && s.difficulty === 'EASY') ? 'EASY' : 'NORMAL';
            const modeStyle = mode === 'HARD'
                ? 'display:inline-block;min-width:64px;text-align:center;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#ff5555;'
                : mode === 'EASY'
                    ? 'display:inline-block;min-width:64px;text-align:center;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#44ff44;'
                    : 'display:inline-block;min-width:64px;text-align:center;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#88aaff;';

            return `<div class="score-row">
                <span class="score-rank">${i + 1}.</span>
                <span class="score-name">${s.name}</span>
                <span style="${modeStyle}">${mode}</span>
                <span class="score-value">${Math.floor(s.score)}</span>
            </div>`;
        }).join('');
    },

    reset() {
        try {
            localStorage.setItem(this.key, JSON.stringify([]));
        } catch (e) {
            console.warn('Leaderboard reset failed', e);
        }
    }
};

export function safeSetText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}
