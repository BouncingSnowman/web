import { CONFIG } from './constants.js?v=6000';
// NOTE: Use the same cache-busted Entities module URL as Game.js to avoid
// browsers mixing cached module variants (e.g., './Entities.js' vs './Entities.js?v=...').
import { Bullet, Particle, Debris, Powerup, randomPowerType } from './Entities.js?v=6004';
import { AudioSys, Joystick, ScreenShake } from './Systems.js?v=6000';
import { CG } from './crazygames.js?v=6000';
import { track } from './Telemetry.js?v=6000';

// Player ship sprite (points UP in the PNG; we rotate it +90° when drawing)
const HERO_SHIP_IMG = new Image();
HERO_SHIP_IMG.src = 'assets/ships/ship_hero1.png?v=6000';

// Winner ship (unlocked by clearing Sector 10)
const WINNER_SHIP_IMG = new Image();
WINNER_SHIP_IMG.src = 'assets/ships/winnership.png?v=6000';

// Elite winner ship (unlocked by clearing Sector 10 on HARD)
const WINNER_SHIP_HARD_IMG = new Image();
WINNER_SHIP_HARD_IMG.src = 'assets/ships/winnership3.png?v=6000';

// Warlock ship (unlocked by clearing Sector 10 twice)
const WARLOCK_SHIP_IMG = new Image();
WARLOCK_SHIP_IMG.src = 'assets/ships/mindship.png?v=6000';

// Ghost ship (unlocked at 1,000,000 accrued score)
const GHOST_SHIP_IMG = new Image();
GHOST_SHIP_IMG.src = 'assets/ships/ghost.png?v=6000';

// Ghost decoy bait image
const GHOSTED_SHIP_IMG = new Image();
GHOSTED_SHIP_IMG.src = 'assets/ships/ghosted.png?v=6000';

// Ghost ship while cloaked (more visible than 12% alpha on mobile)
const GHOSTING_SHIP_IMG = new Image();
GHOSTING_SHIP_IMG.src = 'assets/ships/ghosting.png?v=6000';

const LS_WINNER_SHIP_UNLOCKED = 'ALIENSECTOR_WINNER_SHIP_UNLOCKED';
const LS_WINNER_SHIP_HARD_UNLOCKED = 'ALIENSECTOR_WINNER_SHIP_HARD_UNLOCKED';
const LS_SELECTED_SHIP = 'ALIENSECTOR_SELECTED_SHIP';
const LS_WARLOCK_SHIP_UNLOCKED = 'ALIENSECTOR_WARLOCK_SHIP_UNLOCKED';
const LS_GHOST_SHIP_UNLOCKED = 'ALIENSECTOR_GHOST_SHIP_UNLOCKED';

// DEV/TEST: force-unlock Warlock for testing (set to false before publishing)
const DEV_FORCE_UNLOCK_WARLOCK = false;
const DEV_FORCE_UNLOCK_GHOST = false;


export class Ship {
    constructor(game) {
        this.game = game;
        this.x = game.width / 2;
        this.y = game.height / 2;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2;

        // Visual banking (roll) based on turn rate (visual only)
        this.roll = 0;
        this.rollTarget = 0;

        // Base HP is scaled per selected ship type below.
        this.maxHp = 100;
        this.hp = this.maxHp;

        this.shieldCount = 3;
        this.isShieldActive = false;
        this.shieldTimer = 0;

        this.isSpawnShieldActive = false;
        this.spawnShieldTimer = 0;

        // Spawn shield style: normally green; REPAIR uses gold variant.
        this.spawnShieldIsGold = false;

        // REPAIR powerup: heal to full when the (green) spawn shield times out.
        this.repairHealPending = false;

        this.dead = false;
        this.visible = true;
        this.lastShot = 0;
        this.muzzleFlash = 0;
        this.invulnerableUntil = 0;
        this.respawnTimer = 0;
        this.gameOverTimer = 0;

        this.damageFlash = 0;

        this.fireRateMult = 1.0;
        // Permanent bonus unlocked by beating Sector 10 (does not affect rapid-fire color logic)
        this.permanentFireRateMult = 1.0;
        this.doubleFireTimer = 0;
        this.rapidFireStacks = 0;
        this.weaponLevel = 0;

        // Ship unlock + selection
        this.winnerShipUnlocked = false;
        // NOTE: We currently ship only ONE winner ship (Phoenix) for both difficulties.
        // The hard-winner variant exists as an asset but is not used yet.
        this.hardWinnerShipUnlocked = false;
        this.warlockShipUnlocked = false;
        this.ghostShipUnlocked = false;

        this.isWinnerShip = false;
        this.isHardWinnerShip = false;
        this.isWarlockShip = false;
        this.isGhostShip = false;

        // Ghost ship ability state (decoy + cloak + phase)
        this.isGhostCloaked = false;
        this.ghostCloakTimer = 0;
        this.ghostDecoyX = 0;
        this.ghostDecoyY = 0;
        this.ghostDecoyAngle = 0;
        this.ghostDecoyRoll = 0;
        // apparentX/Y: used by enemies to target the decoy instead of real ship
        this.apparentX = undefined;
        this.apparentY = undefined;

        let selectedShip = '';
        let hasStoredSelection = false;
        try {
            this.winnerShipUnlocked = CG.getItem(LS_WINNER_SHIP_UNLOCKED) === '1';
            // Hard-winner is currently disabled (same reward on all difficulties)
            this.hardWinnerShipUnlocked = false;
            this.warlockShipUnlocked = CG.getItem(LS_WARLOCK_SHIP_UNLOCKED) === '1';
            this.ghostShipUnlocked = CG.getItem(LS_GHOST_SHIP_UNLOCKED) === '1';

            const rawSel = CG.getItem(LS_SELECTED_SHIP);
            if (rawSel) {
                hasStoredSelection = true;
                selectedShip = String(rawSel).toUpperCase();
            }
        } catch (e) { }

        // DEV/TEST: force-unlock Warlock for testing on any domain
        if (DEV_FORCE_UNLOCK_WARLOCK) {
            this.warlockShipUnlocked = true;
            try { CG.setItem(LS_WARLOCK_SHIP_UNLOCKED, '1'); } catch (e) { }
        }
        if (DEV_FORCE_UNLOCK_GHOST) {
            this.ghostShipUnlocked = true;
            try { CG.setItem(LS_GHOST_SHIP_UNLOCKED, '1'); } catch (e) { }
        }

        const selectBestUnlocked = () => {
            // Ghost > Warlock > Phoenix > Hero
            if (this.ghostShipUnlocked) this.isGhostShip = true;
            else if (this.warlockShipUnlocked) this.isWarlockShip = true;
            else if (this.winnerShipUnlocked) this.isWinnerShip = true;
        };

        // Default selection behavior:
        // - If no explicit selection exists, auto-equip the best unlocked ship.
        if (!hasStoredSelection) {
            selectBestUnlocked();
        } else {
            if (selectedShip === 'GHOST') {
                if (this.ghostShipUnlocked) this.isGhostShip = true;
                else selectBestUnlocked();
            }
            else if (selectedShip === 'WARLOCK') {
                if (this.warlockShipUnlocked) this.isWarlockShip = true;
                else selectBestUnlocked();
            }
            else if (selectedShip === 'WINNER') {
                if (this.winnerShipUnlocked) this.isWinnerShip = true;
                else selectBestUnlocked();
            } else {
                // HERO or unknown selection: fall back to hero ship.
            }
        }

        // Ship balance (health, speed, blaster output)
        // HERO:    200% health, 75% speed, standard blaster
        // PHOENIX:  50% health, 130% speed, faster blaster 
        // WARLOCK:  100% health, 100% speed, standard blaster
        // GHOST:    113% health, 120% speed, standard blaster
        this.speedMult = 1.0;

        if (this.isGhostShip) {
            this.maxHp = 113;
            this.speedMult = 1.2;
            this.permanentFireRateMult = 1.0;
        }
        else if (this.isWarlockShip) {
            this.maxHp = 100;
            this.speedMult = 1.5;
            this.permanentFireRateMult = 1.0;
        }
        else if (this.isWinnerShip) {
            this.maxHp = 50;
            this.speedMult = 1.5;
            // Faster blaster output (same behavior as the previous Phoenix balance)
            this.permanentFireRateMult = 0.7;
        }
        else {
            // Standard ship
            this.maxHp = 200;
            this.speedMult = 0.75;
            this.permanentFireRateMult = 1.0;
        }

        this.hp = this.maxHp;

        // Ghost ship starts with extra shields (phase-cloak charges)
        if (this.isGhostShip) this.shieldCount = 7;

        // Mind control ability state (Warlock + Ghost)
        const minDim = Math.min(this.game.width, this.game.height);
        const fullRadius = Math.max(120, Math.min(230, minDim * 0.24));
        this.mindControlRadius = this.isGhostShip ? fullRadius * 0.4125 : fullRadius;
        this.mindControlHoldTime = 0.5;
        this.mindControlHold = 0;
        this.mindControlTarget = null;
        this.mindControlledAllies = [];
    }

    activateShield() {
        if (
            this.dead ||
            this.isShieldActive ||
            this.isSpawnShieldActive ||
            this.shieldCount <= 0
        ) return;

        // Ghost ship: cloak + decoy instead of normal shield
        if (this.isGhostShip) {
            if (this.isGhostCloaked) return; // already cloaked
            this.shieldCount--;
            this.isGhostCloaked = true;
            this.ghostCloakTimer = 5.0; // 5 seconds
            // Freeze decoy at current position
            this.ghostDecoyX = this.x;
            this.ghostDecoyY = this.y;
            this.ghostDecoyAngle = this.angle;
            this.ghostDecoyRoll = this.roll;
            // Set apparent position for enemy targeting
            this.apparentX = this.x;
            this.apparentY = this.y;
            AudioSys.playShield();
            this.game.updateHUD();
            return;
        }

        this.shieldCount--;
        this.isShieldActive = true;
        this.shieldTimer = CONFIG.SHIELD_DURATION;
        this.shieldDuration = CONFIG.SHIELD_DURATION;
        this.hp = this.maxHp; // Heal to full on shield use
        AudioSys.playShield();
        this.game.updateHUD();
    }

    activateSpawnShield(durationMs, isGold = false) {
        this.isSpawnShieldActive = true;
        this.spawnShieldTimer = durationMs;
        this.spawnShieldDuration = durationMs;
        this.spawnShieldIsGold = !!isGold;
        AudioSys.playShield();
    }

    // Ghost ship: use the phase-cloak as spawn protection (free, no charge consumed).
    activateGhostSpawnCloak(durationMs) {
        if (!this.isGhostShip) return;
        this.isGhostCloaked = true;
        this.ghostCloakTimer = durationMs / 1000; // convert ms to seconds
        // Freeze decoy at spawn position
        this.ghostDecoyX = this.x;
        this.ghostDecoyY = this.y;
        this.ghostDecoyAngle = this.angle;
        this.ghostDecoyRoll = this.roll;
        this.apparentX = this.x;
        this.apparentY = this.y;
        AudioSys.playShield();
    }

    shoot() {
        if (this.dead || this.isGhostCloaked) return;

        const now = Date.now() / 1000;

        let baseRate = CONFIG.FIRE_RATE_SLOW;
        if (this.weaponLevel >= 5) {
            baseRate = CONFIG.FIRE_RATE_FAST;
        } else if (this.weaponLevel >= 2) {
            baseRate = CONFIG.FIRE_RATE_NORMAL;
        }

        const rate = baseRate * this.fireRateMult * this.permanentFireRateMult;
        if (now - this.lastShot <= rate) return;

        this.lastShot = now;
        this.muzzleFlash = 1.0;

        // --- NEW AUDIO ---
        AudioSys.playPlayerFire();
        // -----------------

        const forcedPlayerBulletColor = this.isGhostShip
            ? '#0044ff'
            : (this.isWinnerShip
                ? '#ffff00'
                : (this.isWarlockShip ? '#0088ff' : null));
        const bulletScale = this.isGhostShip ? 1.2 : 1.0;

        // Single cannon
        if (this.weaponLevel === 0) {
            this.game.bullets.push(
                new Bullet(
                    this.x + Math.cos(this.angle) * CONFIG.SHIP_SIZE,
                    this.y + Math.sin(this.angle) * CONFIG.SHIP_SIZE,
                    this.angle,
                    forcedPlayerBulletColor || (this.fireRateMult < 1.0 ? '#ffff00' : '#00ffff'),
                    1.0,
                    false,
                    bulletScale
                )
            );
            return;
        }

        // Double cannons
        const color = forcedPlayerBulletColor
            ? forcedPlayerBulletColor
            : (this.weaponLevel >= 2 || this.fireRateMult < 1.0
                ? '#ffff00'
                : '#39ff14');
        const damage = this.weaponLevel >= 2 ? 1.25 : 1.0;
        const offset = 10;

        // Left gun
        this.game.bullets.push(
            new Bullet(
                this.x +
                Math.cos(this.angle) * CONFIG.SHIP_SIZE +
                Math.sin(this.angle) * offset,
                this.y +
                Math.sin(this.angle) * CONFIG.SHIP_SIZE -
                Math.cos(this.angle) * offset,
                this.angle,
                color,
                damage,
                false,
                bulletScale
            )
        );

        // Right gun
        this.game.bullets.push(
            new Bullet(
                this.x +
                Math.cos(this.angle) * CONFIG.SHIP_SIZE -
                Math.sin(this.angle) * offset,
                this.y +
                Math.sin(this.angle) * CONFIG.SHIP_SIZE +
                Math.cos(this.angle) * offset,
                this.angle,
                color,
                damage,
                false,
                bulletScale
            )
        );



        // Spread Blaster (activates at 2+ stacks of Rapid Fire)
        // Standard rapid fire just added rate. Stacked rapid fire now adds spread.
        if (this.rapidFireStacks >= 2) {
            const spreadAngle = 0.16; // Narrower spread (~9 degrees)

            // Left spread
            this.game.bullets.push(
                new Bullet(
                    this.x + Math.cos(this.angle) * CONFIG.SHIP_SIZE + Math.sin(this.angle) * offset,
                    this.y + Math.sin(this.angle) * CONFIG.SHIP_SIZE - Math.cos(this.angle) * offset,
                    this.angle - spreadAngle,
                    color,
                    damage,
                    false,
                    bulletScale
                )
            );

            // Right spread
            this.game.bullets.push(
                new Bullet(
                    this.x + Math.cos(this.angle) * CONFIG.SHIP_SIZE - Math.sin(this.angle) * offset,
                    this.y + Math.sin(this.angle) * CONFIG.SHIP_SIZE + Math.cos(this.angle) * offset,
                    this.angle + spreadAngle,
                    color,
                    damage,
                    false,
                    bulletScale
                )
            );
        }
    }

    respawn() {
        this.x = this.game.width / 2;
        this.y = this.game.height / 2;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2;

        // Reset visual banking
        this.roll = 0;
        this.rollTarget = 0;

        this.hp = this.maxHp; // Reset to maxHp
        this.dead = false;
        this.visible = true;

        // Beginner boost: 5s respawn shield for EASY mode or players with career score below 50k
        const isBeginner = (this.game && this.game.difficulty === 'EASY');
        this.activateSpawnShield(isBeginner ? 5000 : 3000);

        this.respawnTimer = 0;
        this.gameOverTimer = 0;
        this.fireRateMult = 1.0;
        this.doubleFireTimer = 0;
        this.rapidFireStacks = 0;
        this.damageFlash = 0;
    }

    update(dt) {
        // Dead state: respawn or end game
        if (this.dead) {
            // Ensure mind-control hum never leaks across pause/death states.
            if (AudioSys.stopMindHum) AudioSys.stopMindHum();
            this.mindControlTarget = null;
            this.mindControlHold = 0;
            if (this.gameOverTimer > 0) {
                this.gameOverTimer -= dt;
                if (this.gameOverTimer <= 0) {
                    this.game.endGame();
                }
                return;
            }

            if (this.respawnTimer > 0) {
                this.respawnTimer -= dt;
                if (this.respawnTimer <= 0) this.respawn();
            }
            return;
        }

        if (this.damageFlash > 0) this.damageFlash--;

        // DAMAGE VFX
        const damageRatio = this.hp / this.maxHp;
        if (!this.isShieldActive && !this.isSpawnShieldActive) {
            if (damageRatio < 0.9 && Math.random() < 0.25) {
                this.game.particles.push(
                    new Particle(
                        this.x + (Math.random() - 0.5) * 20,
                        this.y + (Math.random() - 0.5) * 20,
                        'smoke',
                        'rgba(150,150,150,0.4)',
                        0.6
                    )
                );
            }
            if (damageRatio < 0.5) {
                if (Math.random() < 0.35) {
                    this.game.particles.push(
                        new Particle(
                            this.x + (Math.random() - 0.5) * 12,
                            this.y + (Math.random() - 0.5) * 12,
                            'smoke',
                            'rgba(50,50,50,0.75)',
                            0.9
                        )
                    );
                }
                if (Math.random() < 0.15) {
                    this.game.particles.push(
                        new Particle(
                            this.x + (Math.random() - 0.5) * 10,
                            this.y + (Math.random() - 0.5) * 10,
                            'spark',
                            '#ff5500',
                            0.4
                        )
                    );
                }
            }
            if (damageRatio < 0.25) {
                if (Math.random() < 0.5) {
                    this.game.particles.push(
                        new Particle(
                            this.x + (Math.random() - 0.5) * 10,
                            this.y + (Math.random() - 0.5) * 4,
                            'smoke',
                            'rgba(255,60,0,0.6)',
                            0.7
                        )
                    );
                }
                if (Math.random() < 0.5) {
                    this.game.particles.push(
                        new Particle(
                            this.x + (Math.random() - 0.5) * 8,
                            this.y + (Math.random() - 0.5) * 8,
                            'smoke',
                            '#000000',
                            1.2
                        )
                    );
                }
                if (Math.random() < 0.4) {
                    this.game.particles.push(
                        new Particle(
                            this.x + (Math.random() - 0.5) * 10,
                            this.y + (Math.random() - 0.5) * 10,
                            'spark',
                            '#ffff00',
                            0.6
                        )
                    );
                }
            }
        }

        // Powerup timer
        if (this.doubleFireTimer > 0) {
            this.doubleFireTimer -= dt;
            if (this.doubleFireTimer <= 0) {
                this.doubleFireTimer = 0;
                this.fireRateMult = 1.0;
                this.rapidFireStacks = 0;
            }
        }

        // Shield timers
        if (this.isShieldActive) {
            this.shieldTimer -= dt * 1000;
            if (this.shieldTimer <= 0) this.isShieldActive = false;
        }
        if (this.isSpawnShieldActive) {
            this.spawnShieldTimer -= dt * 1000;
            if (this.spawnShieldTimer <= 0) {
                this.spawnShieldTimer = 0;
                this.isSpawnShieldActive = false;
                this.spawnShieldIsGold = false;

                if (this.repairHealPending) {
                    this.repairHealPending = false;
                    this.hp = this.maxHp; // Heal to full
                }
            }
        }

        // Ghost cloak timer
        if (this.isGhostCloaked) {
            this.ghostCloakTimer -= dt;
            if (this.ghostCloakTimer <= 0) {
                this.isGhostCloaked = false;
                this.ghostCloakTimer = 0;
                this.apparentX = undefined;
                this.apparentY = undefined;
                // Brief spawn shield on uncloak so the Ghost isn't instantly vulnerable
                this.activateSpawnShield(2000);

                // Uncloak flash VFX
                for (let i = 0; i < 12; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const sp = 80 + Math.random() * 120;
                    this.game.particles.push(
                        new Particle(this.x, this.y, 'spark', '#88ffff', Math.cos(a) * sp, Math.sin(a) * sp, 0.5)
                    );
                }
            }
        }

        if (this.muzzleFlash > 0) this.muzzleFlash -= dt * 10;

        const keys = this.game.input.keys;

        // For banking: remember angle before turning this frame
        const prevAngle = this.angle;

        // Joystick controls (mobile)
        if (Joystick.active && Joystick.power > 0.05) {
            let diff = Joystick.angle - this.angle;
            while (diff <= -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            const turnSpeed = 10.0;
            if (Math.abs(diff) < turnSpeed * dt) {
                this.angle = Joystick.angle;
            } else {
                this.angle += Math.sign(diff) * turnSpeed * dt;
            }

            const thrust = (CONFIG.THRUST_POWER * this.speedMult) * Math.pow(Joystick.power, 2);
            this.vx += Math.cos(this.angle) * thrust * dt;
            this.vy += Math.sin(this.angle) * thrust * dt;

            // Thrust VFX + sound
            if (Joystick.power > 0.15) {
                this.spawnThrustParticles();
                if (Math.random() > 0.85) AudioSys.playThrust();
            }
        }
        else {
            // Keyboard controls (desktop)
            if (keys.a) this.angle -= CONFIG.ROTATION_SPEED * dt;
            if (keys.d) this.angle += CONFIG.ROTATION_SPEED * dt;

            if (keys.w) {
                this.vx += Math.cos(this.angle) * (CONFIG.THRUST_POWER * this.speedMult) * dt;
                this.vy += Math.sin(this.angle) * (CONFIG.THRUST_POWER * this.speedMult) * dt;
                this.spawnThrustParticles();
                if (Math.random() > 0.85) AudioSys.playThrust();
            }

            if (keys.s) {
                const reversePower = (CONFIG.THRUST_POWER * this.speedMult) * 0.45;
                this.vx -= Math.cos(this.angle) * reversePower * dt;
                this.vy -= Math.sin(this.angle) * reversePower * dt;

                if (Math.random() > 0.5) {
                    const pVx =
                        Math.cos(this.angle) * 120 +
                        (Math.random() - 0.5) * 40;
                    const pVy =
                        Math.sin(this.angle) * 120 +
                        (Math.random() - 0.5) * 40;
                    const x =
                        this.x +
                        Math.cos(this.angle) * (CONFIG.SHIP_SIZE * 0.8);
                    const y =
                        this.y +
                        Math.sin(this.angle) * (CONFIG.SHIP_SIZE * 0.8);
                    this.game.particles.push(
                        new Particle(x, y, 'thrust', '#ffffff', pVx, pVy)
                    );
                }
                if (Math.random() > 0.8) AudioSys.playThrust();
            }
        }

        // Visual banking from turn rate (does not affect aim or physics)
        let d = this.angle - prevAngle;
        while (d <= -Math.PI) d += Math.PI * 2;
        while (d > Math.PI) d -= Math.PI * 2;

        const angularVelocity = d / Math.max(dt, 0.000001);

        const maxRoll = 0.35;      // radians
        const rollStrength = 0.28; // how much turn rate becomes roll
        const rollLerp = 14.0;     // smoothing speed

        this.rollTarget = Math.max(-maxRoll, Math.min(maxRoll, angularVelocity * rollStrength));
        this.roll += (this.rollTarget - this.roll) * Math.min(1, rollLerp * dt);

        // AUTO-FIRE
        const isMobileUA = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        );
        const isTouch = navigator.maxTouchPoints > 1;
        const isDesktop = document.body.classList.contains('desktop');
        const isJoystickMode = !isDesktop;

        if (keys.Fire || isMobileUA || isTouch || isJoystickMode || isDesktop) {
            this.shoot();
        }

        // Integrate movement
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // Time-independent friction
        // We want the same decay per second regardless of framerate.
        // Math.pow(FRICTION, dt * 60) approximates the per-frame decay applied 60 times a second.
        const frictionFactor = Math.pow(CONFIG.FRICTION, dt * 60);
        this.vx *= frictionFactor;
        this.vy *= frictionFactor;

        // Speed Cap
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > CONFIG.MAX_SPEED) {
            const scale = CONFIG.MAX_SPEED / speed;
            this.vx *= scale;
            this.vy *= scale;
        }

        // Boundaries
        if (this.x < CONFIG.SHIP_SIZE) {
            this.x = CONFIG.SHIP_SIZE;
            this.vx *= -0.5;
        }
        if (this.x > this.game.width - CONFIG.SHIP_SIZE) {
            this.x = this.game.width - CONFIG.SHIP_SIZE;
            this.vx *= -0.5;
        }
        if (this.y < CONFIG.SHIP_SIZE) {
            this.y = CONFIG.SHIP_SIZE;
            this.vy *= -0.5;
        }
        if (this.y > this.game.height - CONFIG.SHIP_SIZE) {
            this.y = this.game.height - CONFIG.SHIP_SIZE;
            this.vy *= -0.5;
        }

        // Warlock mind control (only does anything if Warlock is equipped)
        this.updateMindControl(dt);

        // Blink while invulnerable
        if (Date.now() < this.invulnerableUntil) {
            this.visible = Math.floor(Date.now() / 100) % 2 === 0;
        } else {
            this.visible = true;
        }
    }

    _isEligibleMindControlEnemy(e) {
        if (!e) return false;
        if (e.markedForDeletion) return false;
        if (e.isMindControlled) return false;
        // No boss control
        if (e.type === 'BOSS' || e.type === 'MINIBOSS_INTERCEPTOR') return false;
        // Interceptors are immune; only UFO variants can be controlled.
        if (e.type !== 'UFO' && e.type !== 'UFO_SNIPER' && e.type !== 'UFO_COMMANDO') return false;
        return true;
    }

    _hasAnyEligibleMindControlEnemy() {
        if (!this.game || !this.game.enemies) return false;
        for (const e of this.game.enemies) {
            if (this._isEligibleMindControlEnemy(e)) return true;
        }
        return false;
    }

    // Mind control ability (Warlock + Ghost). Ghost can capture even while cloaked.
    updateMindControl(dt) {
        const canMindControl = this.isWarlockShip || this.isGhostShip;
        if (!canMindControl || this.dead) {
            if (AudioSys.stopMindHum) AudioSys.stopMindHum();
            this.mindControlTarget = null;
            this.mindControlHold = 0;
            return;
        }

        // Clear stale ally refs
        this.mindControlledAllies = this.mindControlledAllies.filter(
            a => a && !a.markedForDeletion && a.isMindControlled
        );

        // Hold lock on the current target if it's still in range.
        let target = this.mindControlTarget;
        if (!this._isEligibleMindControlEnemy(target)) {
            target = null;
            this.mindControlTarget = null;
            this.mindControlHold = 0;
        }

        if (target) {
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist > this.mindControlRadius) {
                target = null;
                this.mindControlTarget = null;
                this.mindControlHold = 0;
            }
        }

        // Acquire a new target (nearest eligible enemy inside radius)
        if (!target) {
            let best = null;
            let bestD = Infinity;
            for (const e of this.game.enemies) {
                if (!this._isEligibleMindControlEnemy(e)) continue;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d <= this.mindControlRadius && d < bestD) {
                    best = e;
                    bestD = d;
                }
            }
            if (best) {
                this.mindControlTarget = best;
                this.mindControlHold = 0;
                target = best;
            }
        }

        if (target) {
            this.mindControlHold += dt;
            const progress = Math.max(0, Math.min(1, this.mindControlHold / this.mindControlHoldTime));

            // Hum only when we're actually affecting a target (inside radius).
            if (AudioSys.setMindHum) AudioSys.setMindHum(progress);

            if (this.mindControlHold >= this.mindControlHoldTime) {
                this._applyMindControl(target);
            }
        } else {
            if (AudioSys.stopMindHum) AudioSys.stopMindHum();
        }
    }

    _applyMindControl(enemy) {
        if (!enemy || enemy.markedForDeletion) return;
        if (enemy.type === 'BOSS' || enemy.type === 'MINIBOSS_INTERCEPTOR') return;
        // Interceptors are immune; only UFO variants can be controlled.
        if (enemy.type !== 'UFO' && enemy.type !== 'UFO_SNIPER' && enemy.type !== 'UFO_COMMANDO') return;

        // Ghost: only one ally at a time — old ally explodes with cashout score + powerup drop.
        // Warlock: unlimited allies — just add to the array, never destroy old ones.
        if (this.isGhostShip && this.mindControlledAllies.length > 0) {
            const old = this.mindControlledAllies[0];
            if (old && old !== enemy && old.isMindControlled) {
                old.cashOutMindControlledAtRoundEnd(); // awards score + VFX + explosion
                // Drop a random powerup from the exploded ally (not during comeback contracts)
                const inComeback = !!(this.game && this.game.comebackActive);
                if (this.game && this.game.powerups && !inComeback) {
                    this.game.powerups.push(new Powerup(old.x, old.y, randomPowerType(this.game)));
                }
            }
            this.mindControlledAllies = [];
        }

        // If this was a comeback contract target, count it as downed
        // (capturing counts the same as destroying for contract purposes)
        if (enemy.isComebackContract && this.game && typeof this.game.onComebackContractTargetDown === 'function') {
            this.game.onComebackContractTargetDown();
            enemy.isComebackContract = false; // Clear so it doesn't double-count if destroyed later
        }

        enemy.isMindControlled = true;
        enemy.mindControlController = this;
        enemy.mindControlExpiresAt = Date.now() + 600000;
        enemy._mindControlBlasterCd = 0;
        enemy._mindControlRocketCd = 0;

        // Success VFX (purple burst)
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 120 + Math.random() * 220;
            this.game.particles.push(
                new Particle(enemy.x, enemy.y, 'spark', '#b000ff', Math.cos(a) * sp, Math.sin(a) * sp, 0.7)
            );
        }
        this.game.particles.push(new Particle(enemy.x, enemy.y, 'shockwave', 'rgba(176,0,255,0.55)', 0, 0, 1.2));

        if (AudioSys.playMindControlSuccess) AudioSys.playMindControlSuccess();
        if (AudioSys.stopMindHum) AudioSys.stopMindHum();

        this.mindControlledAllies.push(enemy);
        this.mindControlTarget = null;
        this.mindControlHold = 0;
    }

    spawnThrustParticles() {
        for (let i = 0; i < 2; i++) {
            const pVx =
                -(Math.cos(this.angle) * 150 +
                    (Math.random() - 0.5) * 60);
            const pVy =
                -(Math.sin(this.angle) * 150 +
                    (Math.random() - 0.5) * 60);
            const x =
                this.x -
                Math.cos(this.angle) * (CONFIG.SHIP_SIZE - 2);
            const y =
                this.y -
                Math.sin(this.angle) * (CONFIG.SHIP_SIZE - 2);
            this.game.particles.push(
                new Particle(x, y, 'thrust', '#00ffff', pVx, pVy)
            );
        }
    }

    draw(ctx) {
        if (!this.visible || this.dead) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.damageFlash > 0) {
            ctx.translate(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8
            );
        }

        // Shield effects
        if (this.isShieldActive) {
            const t = Date.now();
            const alpha = 0.4 + Math.sin(t * 0.01) * 0.1;
            const shimmer = 0.25 + Math.sin(t * 0.03) * 0.15;
            const progress = Math.max(0, Math.min(1,
                this.shieldTimer / (this.shieldDuration || 1)));
            const startAngle = -Math.PI / 2;

            // Inner cyan ring — depleting arc
            ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 32;
            ctx.shadowColor = '#00ffff';
            ctx.beginPath();
            ctx.arc(0, 0, CONFIG.SHIP_SIZE + 15,
                startAngle, startAngle + progress * Math.PI * 2);
            ctx.stroke();

            // Outer shimmer ring (full circle)
            ctx.strokeStyle = `rgba(180, 255, 255, ${shimmer})`;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 24;
            ctx.shadowColor = '#88ffff';
            ctx.beginPath();
            ctx.arc(0, 0, CONFIG.SHIP_SIZE + 23, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (this.isSpawnShieldActive) {
            const t = Date.now();
            const alpha = 0.5 + Math.sin(t * 0.02) * 0.2;

            if (this.spawnShieldIsGold) {
                const shimmer = 0.25 + Math.sin(t * 0.03) * 0.15;
                const progress = Math.max(0, Math.min(1,
                    this.spawnShieldTimer / (this.spawnShieldDuration || 1)));

                // Inner gold ring — depleting arc (countdown indicator)
                const startAngle = -Math.PI / 2;
                ctx.strokeStyle = `rgba(255,215,0,${alpha})`;
                ctx.lineWidth = 4;
                ctx.shadowBlur = 32;
                ctx.shadowColor = '#ffd700';
                ctx.beginPath();
                ctx.arc(0, 0, CONFIG.SHIP_SIZE + 19,
                    startAngle, startAngle + progress * Math.PI * 2);
                ctx.stroke();

                // Outer shimmer ring (full circle)
                ctx.strokeStyle = `rgba(255,245,180,${shimmer})`;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 24;
                ctx.shadowColor = '#ffeaa7';
                ctx.beginPath();
                ctx.arc(0, 0, CONFIG.SHIP_SIZE + 27, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                const shimmer = 0.25 + Math.sin(t * 0.03) * 0.15;
                const progress = Math.max(0, Math.min(1,
                    this.spawnShieldTimer / (this.spawnShieldDuration || 1)));
                const startAngle = -Math.PI / 2;

                // Inner green ring — depleting arc
                ctx.strokeStyle = `rgba(57,255,20,${alpha})`;
                ctx.lineWidth = 4;
                ctx.shadowBlur = 32;
                ctx.shadowColor = '#39ff14';
                ctx.beginPath();
                ctx.arc(0, 0, CONFIG.SHIP_SIZE + 18,
                    startAngle, startAngle + progress * Math.PI * 2);
                ctx.stroke();

                // Outer shimmer ring (full circle)
                ctx.strokeStyle = `rgba(180, 255, 180, ${shimmer})`;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 24;
                ctx.shadowColor = '#88ff88';
                ctx.beginPath();
                ctx.arc(0, 0, CONFIG.SHIP_SIZE + 26, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // Warlock mind control ring (purple pulsing radius)
        // Only show when capture is possible: no ally captured and at least one eligible saucer exists.
        // Ghost ship: always show the ring (it can recapture even with an existing ally).
        const canShowRing = this.isGhostShip || this.isWarlockShip || this.mindControlledAllies.length === 0;
        if ((this.isWarlockShip || this.isGhostShip) && canShowRing && this._hasAnyEligibleMindControlEnemy()) {
            const t = Date.now();
            const pulse = 0.5 + Math.sin(t * 0.006) * 0.5;
            const active = !!this.mindControlTarget;
            const progress = active ? Math.max(0, Math.min(1, this.mindControlHold / this.mindControlHoldTime)) : 0;

            const baseAlpha = 0.12 + pulse * 0.10;
            const alpha = active ? (0.18 + progress * 0.40) : baseAlpha;

            const ringColor = this.isGhostShip ? '0,220,200' : '176,0,255';

            ctx.strokeStyle = `rgba(${ringColor},${alpha})`;
            ctx.lineWidth = active ? (2.5 + progress * 3.5) : 2;
            ctx.shadowBlur = active ? (24 + progress * 28) : 18;
            ctx.shadowColor = `rgba(${ringColor},0.9)`;
            ctx.beginPath();
            ctx.arc(0, 0, this.mindControlRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Progress arc while actively bending a mind (3s hold)
            if (active) {
                const start = -Math.PI / 2;
                const end = start + progress * Math.PI * 2;
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(255,255,255,${0.10 + progress * 0.35})`;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(0, 0, this.mindControlRadius, start, end);
                ctx.stroke();
            }

            // Reset glow for ship sprite draw
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        // Keep aim direction correct
        ctx.rotate(this.angle);

        // Apply banking as a subtle skew + squash (visual only)
        const bank = this.roll;
        const skewX = bank * 0.6;
        const scaleY = Math.max(0.7, 1 - Math.abs(bank) * 0.25);
        ctx.transform(1, 0, skewX, scaleY, 0, 0);

        const isFlashing = this.damageFlash > 0;

        // Player ship render

        // Draw sprite if available, otherwise fall back to the original vector ship
        const renderSize = CONFIG.SHIP_SIZE * 3.2;
        const shipImg = (this.isGhostShip && this.isGhostCloaked)
            ? GHOSTING_SHIP_IMG
            : this.isGhostShip
                ? GHOST_SHIP_IMG
                : (this.isWarlockShip
                    ? WARLOCK_SHIP_IMG
                    : (this.isHardWinnerShip
                        ? WINNER_SHIP_HARD_IMG
                        : (this.isWinnerShip ? WINNER_SHIP_IMG : HERO_SHIP_IMG)));

        if (shipImg.complete && shipImg.naturalWidth > 0) {
            ctx.save();

            // Sprite is authored facing up; rotate it so it faces forward (local +X)
            ctx.rotate(Math.PI / 2);

            const half = renderSize * 0.5;
            ctx.globalAlpha = this.isGhostCloaked ? 0.55 : 1.0;
            ctx.globalCompositeOperation = 'source-over';
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            // Warlock: add a subtle red glow (similar vibe as UFOs, but a bit less intense).
            if (this.isWarlockShip) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(0, 201, 245, 0.8)';

                // A couple slightly offset draws makes the glow feel more "outer".
                ctx.globalAlpha = 0.26;
                ctx.drawImage(shipImg, -half, -half, renderSize, renderSize);
                ctx.globalAlpha = 0.14;
                ctx.drawImage(shipImg, -half + 1.2, -half, renderSize, renderSize);
                ctx.drawImage(shipImg, -half - 1.2, -half, renderSize, renderSize);
                ctx.drawImage(shipImg, -half, -half + 1.2, renderSize, renderSize);
                ctx.drawImage(shipImg, -half, -half - 1.2, renderSize, renderSize);
                ctx.restore();

                // Reset for the crisp body pass.
                ctx.globalAlpha = this.isGhostCloaked ? 0.55 : 1.0;
                ctx.globalCompositeOperation = 'source-over';
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
            }

            // Ghost ship: ghostly cyan glow
            if (this.isGhostShip && !this.isGhostCloaked) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(100, 255, 230, 0.7)';
                ctx.globalAlpha = 0.20;
                ctx.drawImage(shipImg, -half, -half, renderSize, renderSize);
                ctx.globalAlpha = 0.10;
                ctx.drawImage(shipImg, -half + 1.2, -half, renderSize, renderSize);
                ctx.drawImage(shipImg, -half - 1.2, -half, renderSize, renderSize);
                ctx.restore();

                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
            }

            ctx.drawImage(shipImg, -half, -half, renderSize, renderSize);

            // Hit flash: additive sprite pass (no rectangles, so no blinking squares)
            if (isFlashing) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.65;
                ctx.drawImage(shipImg, -half, -half, renderSize, renderSize);
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
            }

            ctx.restore();
        } else {
            const hullDark = isFlashing ? '#ffffff' : '#112233';
            const hullMid = isFlashing ? '#ffffff' : '#224466';
            const hullLight = isFlashing ? '#ffffff' : '#4488aa';
            const accent = isFlashing ? '#ff0000' : '#00ffff';

            if (isFlashing) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#ff0000';
            } else {
                ctx.shadowBlur = 0;
            }

            // Wings
            const wingGrad = ctx.createLinearGradient(0, 0, 0, 25);
            wingGrad.addColorStop(0, hullMid);
            wingGrad.addColorStop(1, hullDark);
            ctx.fillStyle = isFlashing ? '#ffffff' : wingGrad;

            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-15, -22);
            ctx.lineTo(-22, -18);
            ctx.lineTo(-15, -5);
            ctx.lineTo(-15, 5);
            ctx.lineTo(-22, 18);
            ctx.lineTo(-15, 22);
            ctx.closePath();
            ctx.fill();

            // Wing accents
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-18, -20);
            ctx.lineTo(-12, -10);
            ctx.moveTo(-18, 20);
            ctx.lineTo(-12, 10);
            ctx.stroke();

            // Body
            const bodyGrad = ctx.createLinearGradient(-10, 0, 20, 0);
            bodyGrad.addColorStop(0, hullDark);
            bodyGrad.addColorStop(1, hullLight);
            ctx.fillStyle = bodyGrad;

            ctx.beginPath();
            ctx.moveTo(25, 0);
            ctx.lineTo(-5, -7);
            ctx.lineTo(-12, -5);
            ctx.lineTo(-12, 5);
            ctx.lineTo(-5, 7);
            ctx.closePath();
            ctx.fill();

            // Cockpit
            ctx.fillStyle = isFlashing ? '#ffcccc' : '#aaddff';
            ctx.beginPath();
            ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Muzzle flashes
        if (this.muzzleFlash > 0) {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffff';
            ctx.beginPath();
            ctx.arc(15, -7, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(15, 7, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Ghost decoy bait (drawn at the frozen position using ghosted.png)
        if (this.isGhostCloaked && this.isGhostShip) {
            const baitImg = GHOSTED_SHIP_IMG;
            if (baitImg.complete && baitImg.naturalWidth > 0) {
                ctx.save();
                ctx.translate(this.ghostDecoyX, this.ghostDecoyY);
                ctx.rotate(this.ghostDecoyAngle);

                const bank = this.ghostDecoyRoll;
                const skewX = bank * 0.6;
                const scaleY = Math.max(0.7, 1 - Math.abs(bank) * 0.25);
                ctx.transform(1, 0, skewX, scaleY, 0, 0);

                ctx.rotate(Math.PI / 2);
                const rSize = CONFIG.SHIP_SIZE * 3.2;
                const h = rSize * 0.5;

                ctx.drawImage(baitImg, -h, -h, rSize, rSize);
                ctx.restore();
            }
        }
    }

    takeDamage(amount) {
        if (
            this.dead ||
            this.isShieldActive ||
            this.isSpawnShieldActive ||
            Date.now() < this.invulnerableUntil
        )
            return;

        this.hp -= amount;
        this.damageFlash = 6;
        ScreenShake.trigger(15, 0.25);

        // Not dead yet → give invulnerability
        if (this.hp > 0) {
            this.invulnerableUntil = Date.now() + 1000;
            return;
        }

        // ----------- DEATH ----------
        this.dead = true;
        this.visible = false;
        this.game.lives--;
        track('death', { sector: this.game.level, score: Math.floor(this.game.score) });

        // If dying during a comeback contract, fail it immediately
        if (this.game.comebackActive) {
            this.game._finishComebackContract(false);
        }

        // Multiplier penalty: losing a ship reduces multiplier by 1 (down to min 1.0)
        // immediately and affects score for the rest of the current sector.
        try {
            const before = (typeof this.game.scoreMultiplier === 'number') ? this.game.scoreMultiplier : 1.0;
            const after = Math.max(1.0, before - 1.0);
            this.game.scoreMultiplier = after;
            if (after < before && typeof this.game.onMultiplierDown === 'function') {
                this.game.onMultiplierDown(before);
            }
        } catch (e) { }
        this.game.perfectLevel = false;
        this.game.updateHUD();

        // --- NEW AUDIO ---
        AudioSys.playPlayerExplosion();
        // -----------------

        for (let i = 0; i < 30; i++) {
            this.game.debris.push(new Debris(this.x, this.y));
        }

        if (this.game.lives > 0) {
            this.respawnTimer = 2.0;
        } else {
            if (this.game.level === 10) {
                this.gameOverTimer = 3.0;
            } else {
                this.game.endGame();
            }
        }
    }
}
