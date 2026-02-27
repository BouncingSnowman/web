import { CONFIG, BULLET_COLORS } from './constants.js?v=6000';
import { AudioSys, ScreenShake } from './Systems.js?v=6000';

// ----------------------------------------------------------------------------------------------------
// SPRITES
// ----------------------------------------------------------------------------------------------------
// UFO sprites (loaded lazily by the browser). We use cache-busting so updates roll out reliably.
const UFO_IMG_1 = new Image();
UFO_IMG_1.src = 'assets/ships/UFO1.png?v=6000';

const UFO_IMG_2 = new Image();
UFO_IMG_2.src = 'assets/ships/UFO2.png?v=6000';

const UFO_IMG_3 = new Image();
UFO_IMG_3.src = 'assets/ships/UFO3.png?v=6000';

const ENEMY_INTERCEPTOR_IMG = new Image();
ENEMY_INTERCEPTOR_IMG.src = 'assets/ships/ship_enemyintercept.png?v=6000';

const BOSS_SHIP_IMG = new Image();
BOSS_SHIP_IMG.src = 'assets/ships/ship_boss.png?v=6000';

const MINIBOSS_SHIP_IMG = new Image();
MINIBOSS_SHIP_IMG.src = 'assets/ships/ship_miniboss.png?v=6000';

// Asteroids (big/large) sprites
const ASTEROID_FIRE_IMG = new Image();
ASTEROID_FIRE_IMG.src = 'assets/asteroids/asteroid_fire_80x80.png?v=6000';

const ASTEROID_ROCK_IMG = new Image();
ASTEROID_ROCK_IMG.src = 'assets/asteroids/rock_80x80.png?v=6000';

const ASTEROID_NOFIRE_IMG = new Image();
ASTEROID_NOFIRE_IMG.src = 'assets/asteroids/asteroid_nofire_80x80.png?v=6000';

const ASTEROID_NOFIRE2_IMG = new Image();
ASTEROID_NOFIRE2_IMG.src = 'assets/asteroids/asteroid_nofire2_80x80.png?v=6000';

// ----------------------------------------------------------------------------------------------------
// RANDOM POWERUP PICKER
// ----------------------------------------------------------------------------------------------------
export function randomPowerType(game) {
    // 1. PRIO: LIFE (Only if lives <= 2 — never in Hard mode)
    if (game.lives <= 2 && game.difficulty !== 'HARD') {
        return 'LIFE';
    }

    // 2. PRIO: SHIELD (Only if shields are low — below 3)
    // Ghost ship starts with 7 but won't get refills until dropping below 3.
    if (game.ship && game.ship.shieldCount <= 2) {
        return 'SHIELD';
    }

    // 3. PRIO: REPAIR (Only if ship is damaged below 75%)
    // Checks if current HP is less than 75% of Max HP (user requested threshold)
    if (game.ship && game.ship.hp < (game.ship.maxHp * 0.75)) {
        return 'REPAIR';
    }

    // 4. PRIO: RAPID FIRE (Default if all needs are met)
    return 'DOUBLE_FIRE';
}

// ----------------------------------------------------------------------------------------------------
// PARTICLES
// ----------------------------------------------------------------------------------------------------
export class Particle {
    constructor(x, y, type, color, arg1, arg2) {
        this.x = x; this.y = y; this.type = type; this.color = color;
        this.life = 1.0;
        const angle = Math.random() * Math.PI * 2;

        if (type === 'shockwave') {
            this.size = 2; this.growth = 150 * arg1; this.life = 0.4;
            this.vx = 0; this.vy = 0;
        } else if (type === 'smoke') {
            const speed = Math.random() * 30;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = Math.random() * 5 + 2;
            this.growth = 15;
            this.life = arg1 || (0.8 + Math.random() * 0.5);
        } else if (type === 'spark') {
            const speed = Math.random() * 100;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = Math.random() * 2 + 1;
            this.life = arg1 || 0.5;
            this.drag = 0.9;
        } else if (type === 'thrust') {
            this.vx = arg1; this.vy = arg2;
            this.size = Math.random() * 3 + 2;
            this.life = 0.4;
            this.drag = 0.9;
        } else {
            const scale = arg1 || 1.0;
            const speed = Math.random() * 250 * scale;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = Math.random() * 3 + 1;
            this.drag = 0.92;
        }
        this.maxLife = this.life;
    }

    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
        if (this.type === 'shockwave' || this.type === 'smoke') this.size += this.growth * dt;

        if (this.type === 'smoke') { this.vx *= 0.95; this.vy *= 0.95; }
        else if (this.type !== 'shockwave') {
            this.vx *= this.drag || 0.95; this.vy *= this.drag || 0.95;
            if (this.type !== 'thrust') this.size *= 0.95;
        }
    }

    draw(ctx) {
        ctx.save();
        const lifeRatio = Math.max(0, this.life / this.maxLife);
        const alpha = Math.max(0, lifeRatio);

        if (this.type === 'shockwave') {
            ctx.strokeStyle = this.color; ctx.lineWidth = 3 * lifeRatio;
            ctx.globalAlpha = alpha;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.stroke();
        }
        else if (this.type === 'thrust') {
            let r, g, b;
            if (lifeRatio > 0.7) { r = 200; g = 240; b = 255; }
            else if (lifeRatio > 0.3) { r = 0; g = 200; b = 255; }
            else { r = 100; g = 0; b = 255; }
            ctx.fillStyle = `rgba(${r},${g},${b},${lifeRatio})`;
            ctx.shadowBlur = 10 * lifeRatio; ctx.shadowColor = `rgba(${r},${g},${b},1)`;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size * lifeRatio, 0, Math.PI * 2); ctx.fill();
        }
        else if (this.type === 'spark') {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 10; ctx.shadowColor = this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        }
        else {
            ctx.fillStyle = this.color; ctx.globalAlpha = alpha;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

export function createExplosion(game, x, y, scale, color, hasShockwave = false) {
    for (let i = 0; i < 10 * scale; i++) game.particles.push(new Particle(x, y, 'spark', color, 0.5));
    for (let i = 0; i < 5 * scale; i++) game.particles.push(new Particle(x, y, 'smoke', 'rgba(100,100,100,0.5)', 0.8));
    if (hasShockwave) game.particles.push(new Particle(x, y, 'shockwave', '#ffffff', scale));
}

// ----------------------------------------------------------------------------------------------------
// DEBRIS
// ----------------------------------------------------------------------------------------------------
export class Debris {
    constructor(x, y) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 150 + 50;
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 15;
        this.life = 2.0 + Math.random();
        this.width = 4 + Math.random() * 4;
        this.length = 10 + Math.random() * 15;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rotation += this.rotSpeed * dt; this.life -= dt;
        this.vx *= 0.98; this.vy *= 0.98;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
        ctx.globalAlpha = Math.max(0, this.life / 3);
        ctx.shadowBlur = 10; ctx.shadowColor = '#00aaff';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);
        ctx.restore();
    }
}

// ----------------------------------------------------------------------------------------------------
// POWERUPS
// ----------------------------------------------------------------------------------------------------
export class Powerup {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.vy = 40; this.life = 45.0; this.markedForDeletion = false; this.animTimer = 0;
    }

    update(dt) {
        this.y += this.vy * dt; this.life -= dt; this.animTimer += dt;
        this.x += Math.sin(this.animTimer * 2) * 0.5;
        if (this.life <= 0) this.markedForDeletion = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const pulse = 1.0 + Math.sin(this.animTimer * 8) * 0.2;
        ctx.scale(pulse, pulse);

        if (this.type === 'DOUBLE_FIRE') {
            ctx.shadowBlur = 15; ctx.shadowColor = '#ff4500';
            ctx.fillStyle = 'rgba(40, 10, 0, 0.9)'; ctx.strokeStyle = '#ff7b1a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(-4, -8); ctx.lineTo(2, -2); ctx.lineTo(-1, -2);
            ctx.lineTo(4, 6); ctx.lineTo(-2, 0); ctx.lineTo(1, 0);
            ctx.fill();
        }
        else if (this.type === 'REPAIR') {
            ctx.shadowBlur = 18; ctx.shadowColor = '#44ff44';
            ctx.fillStyle = 'rgba(10, 40, 10, 0.9)';
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            ctx.strokeStyle = '#eaffea';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-6, 6);
            ctx.lineTo(6, -6);
            ctx.stroke();
            ctx.fillStyle = '#eaffea';
            ctx.beginPath(); ctx.arc(-6, 6, 2.6, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(6, -6, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        else if (this.type === 'LIFE') {
            ctx.shadowBlur = 15; ctx.shadowColor = '#44ff44';
            ctx.fillStyle = 'rgba(10, 40, 10, 0.9)';
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#44ff44';
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.bezierCurveTo(6, -15, 16, -2, 0, 12);
            ctx.bezierCurveTo(-16, -2, -6, -15, 0, -5);
            ctx.fill();
        }
        else {
            ctx.shadowBlur = 15; ctx.shadowColor = '#00aaff';
            ctx.fillStyle = 'rgba(0, 20, 40, 0.8)'; ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#00aaff';
            ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6);
        }
        ctx.restore();
    }
}

// ----------------------------------------------------------------------------------------------------
// BULLET
// ----------------------------------------------------------------------------------------------------
export class Bullet {
    constructor(x, y, angle, color = '#00ffff', damageMult = 1.0, isEnemy = false, scale = 1.0) {
        this.x = x; this.y = y; this.angle = angle; this.color = color;
        this.damageMult = damageMult; this.isEnemy = isEnemy;
        this.scale = scale;
        let speed = CONFIG.BULLET_SPEED;
        if (isEnemy) speed = 350;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = isEnemy ? 3.0 : CONFIG.BULLET_LIFETIME;
        this.markedForDeletion = false;
    }

    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
        if (this.life <= 0) this.markedForDeletion = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const lifeRatio = Math.max(0, this.life / CONFIG.BULLET_LIFETIME);
        ctx.globalAlpha = 0.2 + (0.8 * lifeRatio);

        const baseRgb = BULLET_COLORS[this.color] || { r: 255, g: 255, b: 255 };
        const strokeR = Math.floor(baseRgb.r * lifeRatio);
        const strokeG = Math.floor(baseRgb.g * lifeRatio);
        const strokeB = Math.floor(baseRgb.b * lifeRatio);
        const finalStroke = `rgb(${strokeR}, ${strokeG}, ${strokeB})`;

        // Tint core toward bullet color (blend 40% color + 60% white when scale > 1)
        const tint = Math.min(1, Math.max(0, (this.scale - 1.0) * 2)); // 0 at scale 1, 1 at scale 1.5+
        const coreR = Math.floor((255 * (1 - tint * 0.55) + baseRgb.r * tint * 0.55) * lifeRatio);
        const coreG = Math.floor((255 * (1 - tint * 0.55) + baseRgb.g * tint * 0.55) * lifeRatio);
        const coreB = Math.floor((255 * (1 - tint * 0.55) + baseRgb.b * tint * 0.55) * lifeRatio);
        const finalCore = `rgb(${coreR}, ${coreG}, ${coreB})`;

        ctx.shadowBlur = (15 + 10 * (this.scale - 1)) * lifeRatio;
        ctx.shadowColor = finalStroke;

        ctx.beginPath();
        const anim = 0.8 + (0.2 * lifeRatio);
        const s = this.scale;
        ctx.ellipse(0, 0, 18 * anim * s, 4 * anim * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = finalCore;
        ctx.fill();

        ctx.lineWidth = 2 * lifeRatio * s;
        ctx.strokeStyle = finalStroke;
        ctx.stroke();
        ctx.restore();
    }
}

// ----------------------------------------------------------------------------------------------------
// ROCKET
// ----------------------------------------------------------------------------------------------------
export class Rocket {
    constructor(game, x, y, target, isEnemy = true) {
        this.game = game;
        this.x = x; this.y = y; this.target = target;
        this.isEnemy = isEnemy;
        this.speed = 50;
        this.maxSpeed = CONFIG.ROCKET_SPEED;
        const targetAngle = Math.atan2(target.y - y, target.x - x);
        const side = Math.random() > 0.5 ? 1 : -1;
        this.angle = targetAngle + (side * (1.5 + Math.random() * 0.5));
        this.markedForDeletion = false;
        this.life = 11.0;
        this.turnRate = 0.0;
        this.wobblePhase = Math.random() * 10;

        AudioSys.playMissileLaunch();
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) {
            this.markedForDeletion = true;
            return;
        }

        const accel = (this.life > 5.0) ? 100 : 250;
        if (this.speed < this.maxSpeed) this.speed += accel * dt;
        if (this.turnRate < 3.5) this.turnRate += dt * 0.5;

        this.wobblePhase += dt * 15;
        const stability = this.turnRate / 3.5;
        const wobble = Math.sin(this.wobblePhase) * (1 - stability) * 3.0 * dt;

        if (this.target && !this.target.dead && !this.target.markedForDeletion) {
            // Ghost decoy: if target is a cloaked Ghost ship, home toward decoy position
            const tx = (this.target.isGhostCloaked && this.target.apparentX !== undefined) ? this.target.apparentX : this.target.x;
            const ty = (this.target.isGhostCloaked && this.target.apparentY !== undefined) ? this.target.apparentY : this.target.y;
            const targetAngle = Math.atan2(ty - this.y, tx - this.x);
            let diff = targetAngle - this.angle;
            while (diff <= -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) < this.turnRate * dt) this.angle = targetAngle;
            else this.angle += Math.sign(diff) * this.turnRate * dt;
        }

        this.angle += wobble;
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        if (Math.random() > 0.2) {
            this.game.particles.push(new Particle(this.x, this.y, 'smoke', 'rgba(100, 50, 0, 0.5)', 0.5));
            this.game.particles.push(new Particle(this.x, this.y, 'spark', '#ff5500', 0.2));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = '#cccccc'; ctx.fillRect(-5, -3, 10, 6);
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3); ctx.fill();

        ctx.fillStyle = '#555555';
        ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(-8, -6); ctx.lineTo(-2, -3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-5, 3); ctx.lineTo(-8, 6); ctx.lineTo(-2, 3); ctx.fill();

        ctx.shadowBlur = 10; ctx.shadowColor = '#ffaa00';
        ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(-5, 0, 2, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    explode() {
        this.markedForDeletion = true;
        AudioSys.playExplosion(false);
    }
}

// ----------------------------------------------------------------------------------------------------
// ASTEROID
// ----------------------------------------------------------------------------------------------------
export class Asteroid {
    constructor(game, x, y, size, type, vx, vy) {
        this.game = game;
        this.x = x; this.y = y; this.size = size; this.type = type;
        this.trail = [];

        if (vx !== undefined && vy !== undefined) {
            this.vx = vx; this.vy = vy;
        } else {
            const centerX = game.width / 2;
            const centerY = game.height / 2;
            const angleToCenter = Math.atan2(centerY - this.y, centerX - this.x);
            const variance = (Math.random() - 0.5) * 1.5;
            const angle = angleToCenter + variance;

            const speed = Math.random() * 50 + 20 + (game.level * 5);
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }

        this.hp = (type === 'LARGE') ? 3 : 1;
        this.sprite = null;
        // Use sprite asteroids for LARGE and the spawned MEDIUM "chunks".
        // - LARGE: never use the glowing asteroid (too noisy when many are on-screen)
        // - MEDIUM: allow glowing sometimes
        if (type === 'LARGE') {
            const pool = [ASTEROID_ROCK_IMG, ASTEROID_NOFIRE_IMG, ASTEROID_NOFIRE2_IMG];
            this.sprite = pool[(Math.random() * pool.length) | 0];
        } else if (type === 'MEDIUM') {
            const glowChance = 0.20;
            if (Math.random() < glowChance) {
                this.sprite = ASTEROID_FIRE_IMG;
                // The glowing (fire) asteroid sprite reads too large. Scale it down.
                this.size *= 0.8;
            } else {
                const pool = [ASTEROID_ROCK_IMG, ASTEROID_NOFIRE_IMG, ASTEROID_NOFIRE2_IMG];
                this.sprite = pool[(Math.random() * pool.length) | 0];
            }
        }

        if (type === 'GOLD') this.hp = 2;
        this.markedForDeletion = false;
        this.hitFlash = 0;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 1.0;

        let hue = Math.random() > 0.5 ? 210 : 20;
        let sat = 15; let light = 35;
        if (this.type === 'GOLD') { hue = 45; sat = 80; light = 50; }

        this.rockColorLight = `hsl(${hue}, ${sat}%, ${light}%)`;
        this.rockColorDark = `hsl(${hue}, ${sat}%, ${light - 15}%)`;
        this.rockColorSide = `hsl(${hue}, ${sat + 5}%, ${light - 20}%)`;

        this.corePoints = [];
        const coreVerts = 8 + Math.floor(Math.random() * 6);
        for (let i = 0; i < coreVerts; i++) {
            this.corePoints.push({
                angle: (i / coreVerts) * Math.PI * 2,
                baseR: this.size * (0.5 + Math.random() * 0.35),
                r: 0, pulsePhase: Math.random() * Math.PI * 2
            });
        }

        this.chunks = [];
        const numChunks = 6 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numChunks; i++) {
            const baseAngle = (i / numChunks) * Math.PI * 2;
            const dist = Math.random() * this.size * 0.2;
            const cx = Math.cos(baseAngle) * dist;
            const cy = Math.sin(baseAngle) * dist;
            const points = [];
            const verts = 4 + Math.floor(Math.random() * 3);
            const blockRad = this.size * (0.3 + Math.random() * 0.25);
            for (let j = 0; j < verts; j++) {
                const vAngle = (j / verts) * Math.PI * 2 + Math.random() * 0.5;
                const r = blockRad * (0.7 + Math.random() * 0.5);
                points.push({ x: Math.cos(vAngle) * r, y: Math.sin(vAngle) * r });
            }
            this.chunks.push({ points: points, x: cx, y: cy, rotation: (Math.random() - 0.5) * 0.5 });
        }
    }

    update(dt) {
        const speedFactor = (this.game && this.game.difficulty === 'HARD') ? 1.2 : 1.0;

        this.x += this.vx * dt * speedFactor;
        this.y += this.vy * dt * speedFactor;
        this.rotation += this.rotSpeed * dt;
        if (this.hitFlash > 0) this.hitFlash--;

        // Wrap buffer: keep it tight so asteroids don't linger off-screen in the "twilight zone".
        // Needs to be at least ~radius to avoid visible popping.
        const buffer = this.size + 4;
        let wrapped = false;
        if (this.x > this.game.width + buffer) { this.x = -buffer; wrapped = true; this.vx += (Math.random() - 0.5) * 20; this.vy += (Math.random() - 0.5) * 20; }
        else if (this.x < -buffer) { this.x = this.game.width + buffer; wrapped = true; this.vx += (Math.random() - 0.5) * 20; this.vy += (Math.random() - 0.5) * 20; }
        if (this.y > this.game.height + buffer) { this.y = -buffer; wrapped = true; this.vx += (Math.random() - 0.5) * 20; this.vy += (Math.random() - 0.5) * 20; }
        else if (this.y < -buffer) { this.y = this.game.height + buffer; wrapped = true; this.vx += (Math.random() - 0.5) * 20; this.vy += (Math.random() - 0.5) * 20; }

        if (!wrapped) {
            this.trail.push({ x: this.x + (Math.random() - 0.5) * 4, y: this.y + (Math.random() - 0.5) * 4 });
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) * speedFactor;
            const targetLength = Math.max(15, Math.floor(speed / 1.5));
            while (this.trail.length > targetLength) this.trail.shift();
        } else {
            this.trail = [];
            const cx = this.game.width / 2;
            const cy = this.game.height / 2;
            const dx = cx - this.x;
            const dy = cy - this.y;
            const angle = Math.atan2(dy, dx);
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            this.vx = this.vx * 0.8 + Math.cos(angle) * speed * 0.2;
            this.vy = this.vy * 0.8 + Math.sin(angle) * speed * 0.2;
        }

        const time = Date.now() * 0.005;
        this.corePoints.forEach(p => p.r = p.baseR + Math.sin(time + p.pulsePhase) * 3);
    }

    draw(ctx) {
        ctx.save();

        if (this.trail.length > 2) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (let i = 0; i < this.trail.length - 1; i++) {
                const p1 = this.trail[i]; const p2 = this.trail[i + 1];
                const ratio = i / (this.trail.length - 1);
                const alpha = ratio * 0.1;
                const w = this.size * 1.0 * ratio;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(220, 120, 40, ${alpha})`; ctx.lineWidth = w; ctx.stroke();
            }
        }

        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Sprite asteroids (LARGE + spawned MEDIUM chunks).
        if ((this.type === 'LARGE' || this.type === 'MEDIUM') && this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0) {
            const d = this.size * 2;
            ctx.drawImage(this.sprite, -this.size, -this.size, d, d);
            if (this.hitFlash > 0) {
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.restore();
            return;
        }

        if (this.hitFlash > 0) {
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 20; ctx.shadowColor = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill();
        } else {
            const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size * 0.8);
            if (this.type === 'GOLD') {
                coreGrad.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
                coreGrad.addColorStop(1, 'rgba(100, 80, 0, 0.2)');
                ctx.shadowColor = '#ffd700';
            } else {
                coreGrad.addColorStop(0, 'rgba(255, 235, 59, 0.5)');
                coreGrad.addColorStop(1, 'rgba(62, 39, 35, 0.1)');
                ctx.shadowColor = 'rgba(255, 87, 34, 0.5)';
            }
            ctx.fillStyle = coreGrad; ctx.shadowBlur = 10;

            ctx.beginPath();
            const startX = Math.cos(this.corePoints[0].angle) * this.corePoints[0].r;
            const startY = Math.sin(this.corePoints[0].angle) * this.corePoints[0].r;
            ctx.moveTo(startX, startY);
            for (let i = 1; i < this.corePoints.length; i++) {
                const p = this.corePoints[i];
                ctx.lineTo(Math.cos(p.angle) * p.r, Math.sin(p.angle) * p.r);
            }
            ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;

            this.chunks.forEach(chunk => {
                ctx.save();
                ctx.translate(chunk.x, chunk.y); ctx.rotate(chunk.rotation);
                const depth = 4;
                ctx.fillStyle = this.rockColorSide;
                ctx.beginPath();
                ctx.moveTo(chunk.points[0].x + depth, chunk.points[0].y + depth);
                for (let i = 1; i < chunk.points.length; i++) ctx.lineTo(chunk.points[i].x + depth, chunk.points[i].y + depth);
                ctx.closePath(); ctx.fill();

                ctx.fillStyle = this.rockColorLight;
                ctx.beginPath();
                ctx.moveTo(chunk.points[0].x, chunk.points[0].y);
                for (let i = 1; i < chunk.points.length; i++) ctx.lineTo(chunk.points[i].x, chunk.points[i].y);
                ctx.closePath(); ctx.fill();

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.restore();
            });
        }
        ctx.restore();
    }

    explode(awardScore = true) {
        this.markedForDeletion = true;

        if (this.game && this.type === 'LARGE' && typeof this.game.largeAsteroidsDestroyedThisLevel === 'number') {
            this.game.largeAsteroidsDestroyedThisLevel++;
        }

        let points = (this.type === 'GOLD') ? 250 : 50;
        if (this.type === 'LARGE') {
            points = 100;
            createExplosion(this.game, this.x, this.y, 2.5, '#ffaa55', true);
            for (let i = 0; i < 3; i++) {
                const a = (Math.PI / 2) * i;
                this.game.asteroids.push(new Asteroid(this.game, this.x, this.y, CONFIG.ASTEROID_MEDIUM_SIZE, 'MEDIUM',
                    this.vx + Math.cos(a) * 120, this.vy + Math.sin(a) * 120));
            }
        }
        else if (this.type === 'GOLD') {
            createExplosion(this.game, this.x, this.y, 2.0, '#ffd700', true);
            const dropType = this.forceDrop || 'REPAIR';
            const gp = new Powerup(this.x, this.y, dropType);
            if (this.isNewbieDrop) gp.isNewbieDrop = true;
            this.game.powerups.push(gp);
        }
        else {
            createExplosion(this.game, this.x, this.y, 1.5, '#ffaa55');
        }

        if (awardScore && (!this.isNewbieDrop || (this.game && this.game.difficulty === 'EASY'))) {
            points = Math.floor(points * this.game.scoreMultiplier);
            this.game.score += points;
            const scoreColor = (this.game && this.game.scoreMultiplier > 1.0) ? "#ffd700" : "#fff";
            this.game.floatingTexts.push(new FloatingText(this.x, this.y, `+${points}`, scoreColor));
            this.game.updateHUD();
        }
        AudioSys.playExplosion(this.type === 'LARGE');
    }

    takeDamage(amount = 1, awardScore = true) {
        this.hp -= amount;
        this.hitFlash = 4;
        if (this.hp <= 0) {
            this.markedForDeletion = true;
            this.explode(awardScore);
        } else {
            AudioSys.playRockHit();
            createExplosion(this.game, this.x, this.y, 0.5, '#aaaaaa', false);
        }
    }
}

// ----------------------------------------------------------------------------------------------------
// ENEMIES
// ----------------------------------------------------------------------------------------------------
export class Enemy {
    constructor(game, type, target) {
        this.game = game;
        this.type = type;
        this.target = target;

        this.markedForDeletion = false;
        this._oobTimer = 0;
        this.hp = 20;
        this.flash = 0;
        this.timer = 0;
        this.missileCooldown = 0;
        this.retaliationTimer = 0;
        this.blasterCooldown = 7.0;
        this.knockback = { x: 0, y: 0 };
        this.entered = false;
        this.provoked = false;

        // When true, UFO variants will not auto-retreat/despawn (used for boss defenders).
        this.persistent = false;

        // Mind control (Warlock ability). When controlled, the enemy becomes an ally for a short time.
        this.isMindControlled = false;
        this.mindControlController = null;
        this.mindControlExpiresAt = 0;
        this._mindControlOrbitPhase = Math.random() * Math.PI * 2;
        this._mindControlBlasterCd = 0;
        this._mindControlRocketCd = 0;

        if (type === 'UFO' || type === 'UFO_SNIPER' || type === 'UFO_COMMANDO') {
            this.direction = Math.random() > 0.5 ? 1 : -1;
            this.x = this.direction === 1 ? -50 : game.width + 50;
            this.y = Math.random() * (game.height * 0.6) + (game.height * 0.2);
            this.destX = this.direction === 1 ? game.width + 150 : -150;
            this.destY = this.y;
            this.vx = 100 * this.direction;
            // Keep existing speed tuning: red UFOs were a bit faster.
            if (type !== 'UFO') this.vx *= 1.2;
            this.angle = 0;
            this.hp = (type === 'UFO') ? 21 : 35;
            this.maxHp = this.hp;
        }
        else if (type === 'BOSS') {
            this.x = game.width / 2; this.y = -100;
            this.angle = Math.PI / 2;
            this.hp = 400; this.maxHp = 400;
            this.rocketTimer = 1.0; this.blasterCooldown = 1.5;
            this.persistent = true; // Boss must never be auto-deleted by OOB safety net
        }
        else if (type === 'MINIBOSS_INTERCEPTOR') {
            this.x = Math.random() * game.width; this.y = -70;
            this.angle = 0;
            this.hp = 100;
            this.maxHp = 100;
            this.rocketTimer = 3.0;
        }
        else {
            this.x = Math.random() * game.width; this.y = -50;
            this.angle = 0; this.hp = 60;
            this.maxHp = 60;
            this.rocketTimer = 10.0;
            this.phase = Math.random() * Math.PI * 2; // Desync movement
        }
    }

    // ------------------------------
    // Type helpers
    // ------------------------------
    isUfo() {
        return this.type === 'UFO' || this.type === 'UFO_SNIPER' || this.type === 'UFO_COMMANDO';
    }

    isUfoSniperLike() {
        return this.type === 'UFO_SNIPER' || this.type === 'UFO_COMMANDO';
    }

    getUfoVariant() {
        if (this.type === 'UFO_SNIPER') return 'sniper';
        if (this.type === 'UFO_COMMANDO') return 'commando';
        return 'standard';
    }

    // ------------------------------
    // Mind control ally AI (Warlock)
    // ------------------------------
    _updateMindControlled(dt) {
        // Break control when the timer runs out.
        if (this.mindControlExpiresAt && Date.now() >= this.mindControlExpiresAt) {
            this._mindControlSelfDestruct();
            return;
        }

        // Pick a hostile target (enemy ships first, then asteroids).
        let target = null;
        let bestD = Infinity;

        for (const e of this.game.enemies) {
            if (e === this || e.markedForDeletion || e.isMindControlled) continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < bestD) {
                bestD = d;
                target = e;
            }
        }

        if (!target) {
            for (const a of this.game.asteroids) {
                if (a.markedForDeletion) continue;
                const d = Math.hypot(a.x - this.x, a.y - this.y);
                if (d < bestD) {
                    bestD = d;
                    target = a;
                }
            }
        }

        this.target = target;

        // UFOs should roam the level under control (not orbit the player).
        if (this.isUfo()) {
            const w = this.game.width;
            const h = this.game.height;
            const buffer = 90;

            if (!Number.isFinite(this._mcSteerTimer)) this._mcSteerTimer = 0;
            this._mcSteerTimer -= dt;

            if (target) {
                // Aim at the target for weapons.
                this.angle = Math.atan2(target.y - this.y, target.x - this.x);

                if (this.type === 'UFO') {
                    // Standard UFO: strafe across the screen, but steer its lane toward the target.
                    const baseSpeed = 165;
                    if (this._mcSteerTimer <= 0) {
                        this.direction = (target.x > this.x) ? 1 : -1;
                        this.vx = baseSpeed * this.direction;
                        this._mcSteerTimer = 0.9 + Math.random() * 0.8;
                    }
                    if (!Number.isFinite(this.destY)) this.destY = this.y;
                    this.destY += (target.y - this.destY) * Math.min(1, 1.2 * dt);

                    this.x += this.vx * dt;
                    this.y = this.destY + Math.sin(this.timer * 1.5) * 80;
                } else {
                    // Sniper/commando UFOs: orbit/harass the target, similar to their hostile behavior.
                    const minDim = Math.min(w, h);
                    const desired = Number.isFinite(this.ufoDesiredRange) ? this.ufoDesiredRange : (minDim * 0.40);
                    const minRange = Number.isFinite(this.ufoMinRange) ? this.ufoMinRange : (minDim * 0.25);
                    const maxRange = Number.isFinite(this.ufoMaxRange) ? this.ufoMaxRange : (minDim * 0.85);
                    const orbitDir = (this.ufoOrbitDir === -1) ? -1 : 1;

                    const dx = this.x - target.x;
                    const dy = this.y - target.y;
                    const dist = Math.max(0.001, Math.hypot(dx, dy));
                    const toUfoAngle = Math.atan2(dy, dx);

                    const tangentAngle = toUfoAngle + orbitDir * (Math.PI / 2);
                    const baseSpeed = Number.isFinite(this.ufoSniperSpeed) ? this.ufoSniperSpeed : 170;
                    const radialSpeed = baseSpeed * 0.9;

                    let radial = 0;
                    if (dist < minRange) radial = 1;
                    else if (dist > maxRange) radial = -1;
                    else if (Math.abs(dist - desired) > (minDim * 0.03)) radial = (dist < desired) ? 1 : -1;

                    const vx = Math.cos(tangentAngle) * baseSpeed + Math.cos(toUfoAngle) * radial * radialSpeed;
                    const vy = Math.sin(tangentAngle) * baseSpeed + Math.sin(toUfoAngle) * radial * radialSpeed;

                    this.x += vx * dt;
                    this.y += vy * dt;
                    this.destY = this.y;
                }

                // Wrap around the playfield so controlled UFOs keep roaming.
                if (this.x > w + buffer) this.x = -buffer;
                else if (this.x < -buffer) this.x = w + buffer;
                if (this.y > h + buffer) this.y = -buffer;
                else if (this.y < -buffer) this.y = h + buffer;

                // Weapon cadence (friendly).
                this._mindControlBlasterCd = (this._mindControlBlasterCd || 0) - dt;
                this._mindControlRocketCd = (this._mindControlRocketCd || 0) - dt;

                if (this._mindControlBlasterCd <= 0) {
                    this.fireBlaster();
                    this._mindControlBlasterCd = (this.type === 'UFO') ? (2.1 + Math.random() * 0.9) : (1.7 + Math.random() * 0.7);
                }
                if (this._mindControlRocketCd <= 0) {
                    this.game.rockets.push(new Rocket(this.game, this.x, this.y, target, false));
                    this._mindControlRocketCd = (this.type === 'UFO') ? (6.8 + Math.random() * 2.4) : (5.6 + Math.random() * 2.0);
                }
            }
            else {
                // No targets: patrol the level.
                if (!Number.isFinite(this.direction)) this.direction = (Math.random() > 0.5) ? 1 : -1;
                if (!Number.isFinite(this.vx)) this.vx = 140 * this.direction;
                if (!Number.isFinite(this.destY)) this.destY = this.y;

                if (this._mcSteerTimer <= 0) {
                    this._mcSteerTimer = 1.4 + Math.random() * 1.2;
                    if (Math.random() < 0.35) this.direction *= -1;
                    this.vx = (140 + Math.random() * 60) * this.direction;
                    const ny = 80 + Math.random() * (h - 160);
                    this.destY += (ny - this.destY) * 0.35;
                }

                this.x += this.vx * dt;
                this.y = this.destY + Math.sin(this.timer * 1.5) * 80;

                if (this.x > w + buffer) this.x = -buffer;
                else if (this.x < -buffer) this.x = w + buffer;
                if (this.y > h + buffer) this.y = -buffer;
                else if (this.y < -buffer) this.y = h + buffer;
            }

            return;
        }

        // Fallback for any other enemy type (shouldn't happen now that interceptors are immune).
        const ship = this.mindControlController || this.game.ship;
        if (!ship) return;

        if (!Number.isFinite(this._mindControlOrbitPhase)) this._mindControlOrbitPhase = Math.random() * Math.PI * 2;
        this._mindControlOrbitPhase += dt * 0.9;

        const orbitR = 120;
        const followX = ship.x + Math.cos(this._mindControlOrbitPhase) * orbitR;
        const followY = ship.y + Math.sin(this._mindControlOrbitPhase) * orbitR;

        const dx = followX - this.x;
        const dy = followY - this.y;
        const dist = Math.max(0.001, Math.hypot(dx, dy));
        const speed = 240;
        this.x += (dx / dist) * speed * dt;
        this.y += (dy / dist) * speed * dt;

        const margin = 70;
        this.x = Math.max(-margin, Math.min(this.game.width + margin, this.x));
        this.y = Math.max(-margin, Math.min(this.game.height + margin, this.y));

        if (target) {
            this.angle = Math.atan2(target.y - this.y, target.x - this.x);

            this._mindControlBlasterCd = (this._mindControlBlasterCd || 0) - dt;
            this._mindControlRocketCd = (this._mindControlRocketCd || 0) - dt;

            if (this._mindControlBlasterCd <= 0) {
                this.fireBlaster();
                this._mindControlBlasterCd = 1.6 + Math.random() * 0.7;
            }
            if (this._mindControlRocketCd <= 0) {
                this.game.rockets.push(new Rocket(this.game, this.x, this.y, target, false));
                this._mindControlRocketCd = 6.0 + Math.random() * 2.0;
            }
        }
    }

    // When a sector ends, cash out the controlled ally so the player isn't punished
    // for capturing instead of killing. Awards score but never drops powerups.
    cashOutMindControlledAtRoundEnd() {
        if (!this.isMindControlled || this.markedForDeletion) return 0;

        let reward = 500;
        if (this.type === 'UFO') reward = 1000;
        if (this.type === 'UFO_SNIPER') reward = 1400;
        if (this.type === 'UFO_COMMANDO') reward = 1400;
        if (this.type === 'MINIBOSS_INTERCEPTOR') reward = 1300;
        if (this.type === 'BOSS') reward = 2500;

        // Ghost ship bonus: 2x cashout (smaller capture radius = higher risk = higher reward)
        if (this.mindControlController && this.mindControlController.isGhostShip) {
            reward *= 2;
        }

        // No score during comeback contracts (matches kill scoring rules).
        const inComeback = !!(this.game && this.game.comebackActive);
        if (!inComeback) {
            reward = Math.floor(reward * this.game.scoreMultiplier);
            this.game.score += reward;

            const scoreColor = (this.game && this.game.scoreMultiplier > 1.0) ? '#ffd700' : '#fff';
            this.game.floatingTexts.push(new FloatingText(this.x, this.y, `+${reward}`, scoreColor));
            this.game.updateHUD();
        } else {
            reward = 0;
        }

        // Destroy (no drops).
        this.isMindControlled = false;
        this.mindControlController = null;
        this.mindControlExpiresAt = 0;
        this.markedForDeletion = true;

        createExplosion(this.game, this.x, this.y, 3, '#b000ff', true);
        AudioSys.playExplosion(true);

        return reward;
    }

    _mindControlSelfDestruct() {
        // Self-destruct with no rewards or drops.
        this.isMindControlled = false;
        this.mindControlController = null;
        this.mindControlExpiresAt = 0;
        this.markedForDeletion = true;

        createExplosion(this.game, this.x, this.y, 2.4, '#b000ff', true);
        AudioSys.playExplosion(true);
    }

    update(dt) {
        if (this.game && this.game.difficulty === 'HARD') dt *= 1.15;

        this.timer += dt;
        if (this.flash > 0) this.flash--;

        this.x += this.knockback.x * dt;
        this.y += this.knockback.y * dt;
        this.knockback.x *= 0.92;
        this.knockback.y *= 0.92;

        // Mind-controlled enemies use a separate (ally) AI and do not run hostile behaviors.
        if (this.isMindControlled) {
            this._updateMindControlled(dt);
            return;
        }

        const isStunned = Math.hypot(this.knockback.x, this.knockback.y) > 50;
        const damageRatio = this.hp / this.maxHp;

        // Ghost ship decoy: when the player is cloaked, enemies aim at the frozen decoy position.
        // We temporarily wrap this.target so that all targeting reads decoy coords.
        // IMPORTANT: Restore any leaked proxy from a previous frame FIRST (sniper/fleeing
        // returns can skip the restore at the end of update, causing proxy chain buildup).
        if (this._realTarget) {
            this.target = this._realTarget;
            this._realTarget = null;
        }
        const _realTarget = this.target;
        if (this.target && this.target.isGhostCloaked && this.target.apparentX !== undefined) {
            this._realTarget = this.target; // persist for next-frame safety
            this.target = Object.create(this.target);
            Object.defineProperty(this.target, 'x', { get() { return _realTarget.apparentX; }, configurable: true });
            Object.defineProperty(this.target, 'y', { get() { return _realTarget.apparentY; }, configurable: true });
        }

        // Fleeing behavior (triggered on Boss death)
        if (this.isFleeing) {
            const angle = Math.atan2(this.y - (this.game.height / 2), this.x - (this.game.width / 2));
            const fleeSpeed = 350;
            this.x += Math.cos(angle) * fleeSpeed * dt;
            this.y += Math.sin(angle) * fleeSpeed * dt;

            // Delete when far off screen
            if (this.x < -200 || this.x > this.game.width + 200 || this.y < -200 || this.y > this.game.height + 200) {
                this.markedForDeletion = true;
            }
            return;
        }

        // Safety net: delete ANY enemy stuck outside the play area for 15+ seconds.
        // This prevents invisible enemies from firing indefinitely off-screen.
        // Exempt: persistent enemies, boss-death fleeing, and enemies scared by player shield.
        const isScared = this.target && (this.target.isShieldActive || this.target.isSpawnShieldActive);
        if (!this.persistent && !this.isFleeing && !isScared) {
            const oobMargin = 150;
            const isOob = this.x < -oobMargin || this.x > this.game.width + oobMargin ||
                this.y < -oobMargin || this.y > this.game.height + oobMargin;
            if (isOob) {
                this._oobTimer += dt;
                if (this._oobTimer >= 20) {
                    this.markedForDeletion = true;
                    return;
                }
            } else {
                this._oobTimer = 0;
            }
        } else if (isScared) {
            // Reset so enemies get the full window to return after shield drops.
            this._oobTimer = 0;
        }

        if (damageRatio < 0.9 && Math.random() < 0.2) {
            this.game.particles.push(new Particle(this.x + (Math.random() - 0.5) * 20, this.y + (Math.random() - 0.5) * 20, 'smoke', 'rgba(150,150,150,0.4)', 0.5));
        }
        if (damageRatio < 0.5) {
            if (Math.random() < 0.3) {
                this.game.particles.push(new Particle(this.x, this.y, 'smoke', 'rgba(50,50,50,0.7)', 0.8));
            }
            if (Math.random() < 0.1) {
                this.game.particles.push(new Particle(this.x, this.y, 'spark', '#ffaa00', 0.4));
            }
        }
        if (damageRatio < 0.25) {
            if (Math.random() < 0.5) {
                this.game.particles.push(new Particle(this.x + (Math.random() - 0.5) * 10, this.y, 'smoke', 'rgba(255, 60, 0, 0.6)', 0.6));
            }
            if (Math.random() < 0.5) {
                this.game.particles.push(new Particle(this.x, this.y, 'smoke', '#000000', 1.2));
            }
            if (Math.random() < 0.4) {
                this.game.particles.push(new Particle(this.x, this.y, 'spark', '#ffff00', 0.6));
            }
        }

        if (this.isUfo()) {


            // SNIPER Mode
            if (this.ufoMode === 'sniper' && this.provoked) {
                const targetAlive = this.target && !this.target.dead;
                if (targetAlive) {
                    const minDim = Math.min(this.game.width, this.game.height);
                    const desired = Number.isFinite(this.ufoDesiredRange) ? this.ufoDesiredRange : (minDim * 0.40);
                    const minRange = Number.isFinite(this.ufoMinRange) ? this.ufoMinRange : (minDim * 0.25);
                    const maxRange = Number.isFinite(this.ufoMaxRange) ? this.ufoMaxRange : (minDim * 0.85);
                    const orbitDir = (this.ufoOrbitDir === -1) ? -1 : 1;

                    const dx = this.x - this.target.x;
                    const dy = this.y - this.target.y;
                    const dist = Math.max(0.001, Math.hypot(dx, dy));
                    const toUfoAngle = Math.atan2(dy, dx);

                    const tangentAngle = toUfoAngle + orbitDir * (Math.PI / 2);
                    const baseSpeed = Number.isFinite(this.ufoSniperSpeed) ? this.ufoSniperSpeed : 140;
                    const radialSpeed = baseSpeed * 0.9;

                    let radial = 0;
                    if (dist < minRange) radial = 1;
                    else if (dist > maxRange) radial = -1;
                    else if (Math.abs(dist - desired) > (minDim * 0.03)) radial = (dist < desired) ? 1 : -1;

                    let vx = Math.cos(tangentAngle) * baseSpeed + Math.cos(toUfoAngle) * radial * radialSpeed;
                    let vy = Math.sin(tangentAngle) * baseSpeed + Math.sin(toUfoAngle) * radial * radialSpeed;

                    // Separation Force (Sniper)
                    if (this.game.enemies) {
                        this.game.enemies.forEach(other => {
                            if (other !== this && other.isUfo() && !other.markedForDeletion) {
                                const dx = this.x - other.x;
                                const dy = this.y - other.y;
                                const dist = Math.hypot(dx, dy);
                                const sepDist = 120;
                                if (dist < sepDist && dist > 0) {
                                    const force = (sepDist - dist) / sepDist;
                                    const pushSpeed = 150 * force;
                                    vx += (dx / dist) * pushSpeed;
                                    vy += (dy / dist) * pushSpeed;
                                }
                            }
                        });
                    }

                    this.x += vx * dt;
                    this.y += vy * dt;

                    // Soft clamp: nudge sniper UFOs back toward visible area if they drift off-screen.
                    const margin = 40;
                    const nudgeStrength = 300 * dt;
                    if (this.x < -margin) this.x += nudgeStrength;
                    else if (this.x > this.game.width + margin) this.x -= nudgeStrength;
                    if (this.y < -margin) this.y += nudgeStrength;
                    else if (this.y > this.game.height + margin) this.y -= nudgeStrength;

                    if (this.type !== 'UFO') {
                        const buffer = 60;
                        if (this.x > this.game.width + buffer) this.x = -buffer;
                        else if (this.x < -buffer) this.x = this.game.width + buffer;
                        if (this.y > this.game.height + buffer) this.y = -buffer;
                        else if (this.y < -buffer) this.y = this.game.height + buffer;
                    }

                    this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);

                    if (!Number.isFinite(this.ufoRocketCooldown)) this.ufoRocketCooldown = 3.8;
                    if (!Number.isFinite(this.ufoRocketTimer)) this.ufoRocketTimer = 1.8;
                    this.ufoRocketTimer -= dt;
                    if (this.ufoRocketTimer <= 0) {
                        this.game.rockets.push(new Rocket(this.game, this.x, this.y, this.target));
                        if (this.game.difficulty === 'HARD') { const r2 = new Rocket(this.game, this.x, this.y, this.target); r2.maxSpeed *= 1.25; this.game.rockets.push(r2); }
                        this.ufoRocketTimer = this.ufoRocketCooldown;
                    }
                } else {
                    // Target is dead — drift toward center so we don't freeze at edges
                    const cx = this.game.width / 2;
                    const cy = this.game.height / 2;
                    const toCenterAngle = Math.atan2(cy - this.y, cx - this.x);
                    const driftSpeed = 60;
                    this.x += Math.cos(toCenterAngle) * driftSpeed * dt;
                    this.y += Math.sin(toCenterAngle) * driftSpeed * dt;
                }

                // Check retreat condition
                if (!this.persistent && this.type !== 'UFO' && this.timer >= 405) {
                    this.ufoMode = null; // Fall through to standard mode below
                    this.destY = this.y;
                    this.timer = 0;
                    this.direction = (this.x < this.game.width / 2) ? -1 : 1;
                    this.vx = 220 * this.direction;
                } else {
                    return; // Continue sniping
                }
            }

            // STANDARD / COMMANDO Mode (if not sniper or retreated)
            this.x += this.vx * dt;
            // Use phase to desync sine waves
            this.y = this.destY + Math.sin(this.timer * 1.5 + (this.phase || 0)) * 80;

            if (this.retaliationTimer > 0) {
                this.retaliationTimer -= dt;
                if (this.retaliationTimer <= 0) {
                    // FIX: Rockets require a valid target. Mind-controlled UFOs can release with target = null.
                    // Fall back to the player ship to avoid a crash in Rocket() (reads target.x/target.y).
                    const rocketTarget = this.target || (this.game ? this.game.ship : null);
                    if (rocketTarget) {
                        this.target = rocketTarget;
                        this.game.rockets.push(new Rocket(this.game, this.x, this.y, rocketTarget));
                        if (this.game.difficulty === 'HARD') { const r2 = new Rocket(this.game, this.x, this.y, rocketTarget); r2.maxSpeed *= 1.25; this.game.rockets.push(r2); }
                        this.game.floatingTexts.push(new FloatingText(this.x, this.y - 30, "!", "#ff0000"));
                    }
                    this.missileCooldown = 5.0;
                }
            }

            if (this.missileCooldown > 0) this.missileCooldown -= dt;

            if (!this.persistent) {
                if ((this.direction === 1 && this.x > this.game.width + 100) ||
                    (this.direction === -1 && this.x < -100)) {
                    this.markedForDeletion = true;
                }
            }


        }
        else {
            const targetAlive = this.target && !this.target.dead;
            const scared = targetAlive && (this.target.isShieldActive || this.target.isSpawnShieldActive);

            if (!isStunned && targetAlive) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const targetAngle = scared ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
                let diff = targetAngle - this.angle;
                while (diff <= -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                let turnSpeed = this.type === 'BOSS' ? (scared ? 4.6 : 0.6) : (scared ? 4.0 : 1.5);
                if (this.type !== 'BOSS' && this.game && this.game.difficulty === 'HARD') turnSpeed *= 1.1;
                this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
            }

            if (this.type === 'BOSS') {
                if (!this.entered && this.y < 150) {
                    this.y += 100 * dt;
                } else {
                    this.entered = true;
                    // +15% Speed Buff
                    let speed = targetAlive && scared ? 295 : 145;
                    this.x += Math.cos(this.angle) * speed * dt;
                    this.y += Math.sin(this.angle) * speed * dt;

                    // Visual thrusters so boss movement reads clearly.
                    // Spawn small thrust particles behind the boss when it moves.
                    if (Math.random() < 0.55) {
                        const bx = this.x - Math.cos(this.angle) * 55 + (Math.random() - 0.5) * 6;
                        const by = this.y - Math.sin(this.angle) * 55 + (Math.random() - 0.5) * 6;
                        const pvx = -Math.cos(this.angle) * (60 + Math.random() * 60);
                        const pvy = -Math.sin(this.angle) * (60 + Math.random() * 60);
                        this.game.particles.push(new Particle(bx, by, 'thrust', '#00ffff', pvx, pvy));
                    }
                }
            }
            else {
                let sepX = 0, sepY = 0;
                this.game.enemies.forEach(other => {
                    if (other !== this &&
                        (other.type === 'INTERCEPTOR' || other.type === 'MINIBOSS_INTERCEPTOR') &&
                        !other.markedForDeletion) {
                        const distSq = (this.x - other.x) ** 2 + (this.y - other.y) ** 2;
                        const minDist = 60;
                        if (distSq < minDist ** 2 && distSq > 0) {
                            const dist = Math.sqrt(distSq);
                            const force = (minDist - dist) * 4.0;
                            const angle = Math.atan2(this.y - other.y, this.x - other.x);
                            sepX += Math.cos(angle) * force;
                            sepY += Math.sin(angle) * force;
                        }
                    }
                });
                const moveSpeed = CONFIG.INTERCEPTOR_SPEED * (scared ? 1.8 : 1.0);
                this.x += (Math.cos(this.angle) * moveSpeed + sepX) * dt;
                this.y += (Math.sin(this.angle) * moveSpeed + sepY) * dt;
            }

            if (targetAlive) {
                this.rocketTimer -= dt;
                if (this.rocketTimer <= 0) {
                    this.game.rockets.push(new Rocket(this.game, this.x, this.y, this.target));
                    if (this.game.difficulty === 'HARD') { const r2 = new Rocket(this.game, this.x, this.y, this.target); r2.maxSpeed *= 1.25; this.game.rockets.push(r2); }
                    this.rocketTimer = (this.type === 'BOSS' ? 4.5 : 10.0);
                }

                this.blasterCooldown -= dt;
                if (this.blasterCooldown <= 0) {
                    const dx = this.target.x - this.x;
                    const dy = this.target.y - this.y;
                    const angleToPlayer = Math.atan2(dy, dx);
                    let angleDiff = Math.abs(this.angle - angleToPlayer);
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    angleDiff = Math.abs(angleDiff);

                    if (angleDiff < 0.8 || (this.type === 'BOSS' && angleDiff > 2.2)) {
                        this.fireBlaster();
                    }
                    this.blasterCooldown = (this.type === 'BOSS' ? 1.5 : 7.0);
                }
            }
        }

        // Ghost decoy: restore real target reference so wrapper doesn't persist
        if (_realTarget) this.target = _realTarget;
    }

    fireBlaster() {
        if (!this.target) return;
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;

        if (this.type === 'BOSS') {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;

            // Omni-Directional Single Shot
            // "Just copy the front one" -> Simple tracking, 360 degrees.
            const color = '#ff0000';
            const mainAngle = Math.atan2(dy, dx);

            // Forward shot
            this.game.bullets.push(new Bullet(this.x, this.y, mainAngle, color, 1.0, true));

            // Rear shot (180 degrees offset)
            this.game.bullets.push(new Bullet(this.x, this.y, mainAngle + Math.PI, color, 1.0, true));

            AudioSys.playBossFire();
        }
        else {
            const angle = Math.atan2(dy, dx);
            const offset = 20;
            const isEnemyBullet = !this.isMindControlled;
            const bulletColor = isEnemyBullet ? '#ff0000' : '#b000ff';

            if (this.type === 'MINIBOSS_INTERCEPTOR') AudioSys.playBossFire();
            else AudioSys.playEnemyFire();

            this.game.bullets.push(new Bullet(this.x + Math.cos(this.angle) * offset, this.y + Math.sin(this.angle) * offset, angle, bulletColor, 1.0, isEnemyBullet));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.flash > 0) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);

        if (this.isUfo()) {
            // --- Sprite-based UFO rendering with outer glow + moving rim light dot ---
            const variant = this.getUfoVariant();
            const img = (variant === 'standard') ? UFO_IMG_1 : (variant === 'sniper' ? UFO_IMG_2 : UFO_IMG_3);

            // Visual scale: keep roughly equivalent screen size to the old vector UFO.
            const scale = 0.60;
            ctx.scale(scale, scale);

            // Outer glow (cheap, good looking). Shadow is applied only to the sprite pass.
            let glowColor = 'rgba(80,200,255,0.85)';
            if (variant === 'sniper') glowColor = 'rgba(255,80,80,0.85)';
            if (variant === 'commando') glowColor = 'rgba(182,180,181,0.8)';

            // Flash feedback on hit.
            const flashWhite = (this.flash > 0);

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Reduce glow intensity (about 50%) to avoid overpowering the scene.
            ctx.shadowBlur = (variant === 'standard') ? 13 : 15;
            ctx.shadowColor = glowColor;

            // A couple of slightly offset draws makes the glow feel more "outer" like your reference.
            const w = img.width || 160;
            const h = img.height || 90;
            const hw = w / 2;
            const hh = h / 2;
            ctx.globalAlpha = 0.50;
            ctx.drawImage(img, -hw, -hh);
            ctx.globalAlpha = 0.28;
            ctx.drawImage(img, -hw + 1.5, -hh);
            ctx.drawImage(img, -hw - 1.5, -hh);
            ctx.drawImage(img, -hw, -hh + 1.5);
            ctx.drawImage(img, -hw, -hh - 1.5);
            ctx.restore();

            // Solid pass (no shadow) so the body stays crisp.
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            // Draw base sprite.
            ctx.drawImage(img, -hw, -hh);

            // Hit flash: additive bright pass, avoids any rectangular overlay artifacts.
            if (flashWhite) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.55;
                ctx.drawImage(img, -hw, -hh);
                ctx.restore();
            }

            // Moving "light dot" on the rim.
            // This is subtle and cheap, but sells the "alive" tech feeling.
            const t = this.timer;
            const ringA = (t * 1.9) % (Math.PI * 2);
            const ringR = 0.42 * w;
            const dotX = Math.cos(ringA) * ringR;
            const dotY = Math.sin(ringA) * (0.18 * w);
            const pulse = 0.65 + 0.35 * Math.sin(t * 6.0);

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 9;
            ctx.shadowColor = glowColor;
            ctx.fillStyle = flashWhite ? 'rgba(255,255,255,0.95)' : glowColor;
            ctx.globalAlpha = 0.45 * pulse;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        else {
            ctx.rotate(this.angle);
            const isBoss = (this.type === 'BOSS');
            const isMiniBoss = (this.type === 'MINIBOSS_INTERCEPTOR');
            const scale = isBoss ? 1.2 : (isMiniBoss ? 1.0 : 0.8);
            ctx.scale(scale, scale);

            if (!isBoss && !isMiniBoss) {
                // Standard interceptor: sprite with readable engine glow.
                const img = ENEMY_INTERCEPTOR_IMG;

                // Engine glow (two small thrusters) in the ship's rear.
                const t = this.timer;
                const flicker = 0.75 + 0.25 * Math.sin(t * 18.0);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowColor = '#ff3300';
                ctx.shadowBlur = 18;
                ctx.fillStyle = 'rgba(255, 80, 20, 0.65)';
                ctx.globalAlpha = 0.9 * flicker;
                ctx.beginPath(); ctx.ellipse(-24, -6, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-24, 6, 7, 4, 0, 0, Math.PI * 2); ctx.fill();

                ctx.shadowColor = '#ffaa55';
                ctx.shadowBlur = 10;
                ctx.fillStyle = 'rgba(255, 200, 120, 0.35)';
                ctx.globalAlpha = 0.7 * flicker;
                ctx.beginPath(); ctx.ellipse(-28, -6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-28, 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Draw sprite (sprite art faces up, but our local forward is +X after rotate(angle)).
                const size = 64;
                const half = size * 0.5;
                ctx.save();
                ctx.rotate(Math.PI / 2);

                ctx.drawImage(img, -half, -half, size, size);

                // Hit flash: additive bright pass, avoids any rectangular overlay artifacts.
                if (this.flash > 0) {
                    const a = Math.min(1, this.flash / 5);
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.45 * a;
                    ctx.drawImage(img, -half, -half, size, size);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.restore();
            }
            else if (isMiniBoss) {
                // Miniboss interceptor: sprite with slight orange glow (same style as UFO glow, toned down).
                const img = MINIBOSS_SHIP_IMG;

                // Engine glow (a bit stronger than standard interceptor).
                const t = this.timer;
                const flicker = 0.78 + 0.22 * Math.sin(t * 16.0);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowColor = '#ff7a00';
                ctx.shadowBlur = 18;
                ctx.fillStyle = 'rgba(255, 130, 30, 0.55)';
                ctx.globalAlpha = 0.95 * flicker;
                ctx.beginPath(); ctx.ellipse(-26, -6, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-26, 6, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();

                ctx.shadowColor = '#ffc48a';
                ctx.shadowBlur = 10;
                ctx.fillStyle = 'rgba(255, 210, 150, 0.22)';
                ctx.globalAlpha = 0.75 * flicker;
                ctx.beginPath(); ctx.ellipse(-30, -6, 12, 5.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-30, 6, 12, 5.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Draw sprite (sprite art faces up, but our local forward is +X after rotate(angle)).
                const size = 64;
                const half = size * 0.5;
                ctx.save();
                ctx.rotate(Math.PI / 2);

                // Slight hull glow (outer)
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowColor = '#ff7a00';
                ctx.shadowBlur = 10;
                ctx.globalAlpha = 0.22;
                ctx.drawImage(img, -half, -half, size, size);
                ctx.globalAlpha = 0.12;
                ctx.drawImage(img, -half + 1, -half, size, size);
                ctx.drawImage(img, -half - 1, -half, size, size);
                ctx.drawImage(img, -half, -half + 1, size, size);
                ctx.drawImage(img, -half, -half - 1, size, size);
                ctx.restore();

                ctx.drawImage(img, -half, -half, size, size);

                // Hit flash: additive bright pass, avoids any rectangular overlay artifacts.
                if (this.flash > 0) {
                    const a = Math.min(1, this.flash / 5);
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.45 * a;
                    ctx.drawImage(img, -half, -half, size, size);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                }

                ctx.restore();
            }

            else if (isBoss) {
                // Boss interceptor: sprite (150% size of standard interceptors)
                const img = BOSS_SHIP_IMG;

                // Engine glow (bigger, colder)
                const t = this.timer;
                const flicker = 0.75 + 0.25 * Math.sin(t * 14.0);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowColor = '#7a2cff';
                ctx.shadowBlur = 22;
                ctx.fillStyle = 'rgba(120, 60, 255, 0.55)';
                ctx.globalAlpha = 0.95 * flicker;
                ctx.beginPath(); ctx.ellipse(-30, -7, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-30, 7, 9, 5, 0, 0, Math.PI * 2); ctx.fill();

                ctx.shadowColor = '#b79bff';
                ctx.shadowBlur = 12;
                ctx.fillStyle = 'rgba(210, 190, 255, 0.25)';
                ctx.globalAlpha = 0.75 * flicker;
                ctx.beginPath(); ctx.ellipse(-34, -7, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-34, 7, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Draw sprite (sprite art faces up, but our local forward is +X after rotate(angle)).
                const size = 64;
                const half = size * 0.5;
                ctx.save();
                ctx.rotate(Math.PI / 2);

                // Outer hull glow (same style as UFO glow)
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowColor = '#7a2cff';
                ctx.shadowBlur = 16;
                ctx.globalAlpha = 0.35;
                ctx.drawImage(img, -half, -half, size, size);
                ctx.globalAlpha = 0.18;
                ctx.drawImage(img, -half + 1, -half, size, size);
                ctx.drawImage(img, -half - 1, -half, size, size);
                ctx.drawImage(img, -half, -half + 1, size, size);
                ctx.drawImage(img, -half, -half - 1, size, size);
                ctx.restore();

                ctx.drawImage(img, -half, -half, size, size);

                // Hit flash: additive bright pass, avoids any rectangular overlay artifacts.
                if (this.flash > 0) {
                    const a = Math.min(1, this.flash / 5);
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.45 * a;
                    ctx.drawImage(img, -half, -half, size, size);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.restore();
            }

            else {

                const hullColor = isBoss ? '#050505' : (isMiniBoss ? '#1b0033' : '#220000');
                const wingColor = isBoss ? '#202020' : (isMiniBoss ? '#5a189a' : '#800000');
                const accent = isBoss ? '#ff0000' : (isMiniBoss ? '#ff9d00' : '#ffff00');

                ctx.fillStyle = '#110000'; ctx.beginPath(); ctx.rect(-18, -8, 6, 16); ctx.fill();

                ctx.fillStyle = `rgba(0, 255, 255, ${0.8 + Math.random() * 0.2})`;
                ctx.shadowBlur = 15; ctx.shadowColor = '#00ffff';
                ctx.beginPath(); ctx.arc(-18, -5, 3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(-18, 5, 3, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;

                if (isBoss) { ctx.shadowBlur = 30; ctx.shadowColor = '#ff0000'; }

                const wingGrad = ctx.createLinearGradient(0, 0, 0, 25);
                wingGrad.addColorStop(0, hullColor); wingGrad.addColorStop(1, wingColor);
                ctx.fillStyle = this.flash > 0 ? '#fff' : wingGrad;

                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(-15, -22); ctx.lineTo(-22, -18);
                ctx.lineTo(-15, -5); ctx.lineTo(-15, 5);
                ctx.lineTo(-22, 18); ctx.lineTo(-15, 22);
                ctx.closePath(); ctx.fill();

                ctx.strokeStyle = accent; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-18, -20); ctx.lineTo(-12, -10);
                ctx.moveTo(-18, 20); ctx.lineTo(-12, 10); ctx.stroke();

                const bodyGrad = ctx.createLinearGradient(-10, 0, 20, 0);
                bodyGrad.addColorStop(0, wingColor); bodyGrad.addColorStop(1, isBoss ? '#ff0000' : '#ff2800');
                ctx.fillStyle = bodyGrad;

                ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-5, -7); ctx.lineTo(-12, -5);
                ctx.lineTo(-12, 5); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();

                const cockpitGrad = ctx.createLinearGradient(0, -5, 0, 5);
                cockpitGrad.addColorStop(0, '#330000'); cockpitGrad.addColorStop(0.5, '#ffaaaa'); cockpitGrad.addColorStop(1, '#110000');
                ctx.fillStyle = cockpitGrad;

                ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#333'; ctx.fillRect(5, -8, 10, 2); ctx.fillRect(5, 6, 10, 2);
            }

        }

        // Mind-controlled allies get a purple aura so the player can read allegiance fast.
        // PERF: Still cheap (no additive blending). Slightly stronger for visibility.
        if (this.isMindControlled) {
            const pulse = 0.5 + 0.5 * Math.sin(this.timer * 6.0);
            const baseR = this.isUfo() ? 55 : (this.type === 'BOSS' ? 60 : 28);

            ctx.save();

            const a = 0.22 + pulse * 0.18; // 0.22..0.40
            ctx.strokeStyle = `rgba(176,0,255,${a})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, baseR * (1.0 + pulse * 0.06), 0, Math.PI * 2);
            ctx.stroke();

            // Thin highlight rim to help on bright backgrounds.
            ctx.strokeStyle = `rgba(255,255,255,${0.04 + pulse * 0.06})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, baseR * (0.985 + pulse * 0.04), 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }
        ctx.restore();
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.flash = 5;

        if (this.isUfo()) {
            this.provoked = true;
        }

        if (this.isUfo() && this.hp > 0 && this.missileCooldown <= 0 && this.retaliationTimer <= 0) {
            this.retaliationTimer = 1.0;
        }

        if (this.hp <= 0) {
            const wasMindControlled = !!this.isMindControlled;

            // If a mind-controlled ally dies, it should never reward score or drop powerups.
            if (wasMindControlled) {
                this.isMindControlled = false;
                this.mindControlController = null;
                this.mindControlExpiresAt = 0;
            }

            this.markedForDeletion = true;



            // Explosions always happen, but controlled allies explode in purple.
            let explosionColor = '#ff0000';
            if (this.type === 'UFO') explosionColor = '#00ffff';
            if (this.type === 'UFO_SNIPER') explosionColor = '#ff4444';
            if (this.type === 'UFO_COMMANDO') explosionColor = '#ff3333';
            else if (this.type === 'MINIBOSS_INTERCEPTOR') explosionColor = '#ff00ff';
            if (wasMindControlled) explosionColor = '#b000ff';

            createExplosion(this.game, this.x, this.y, 3, explosionColor, true);
            AudioSys.playExplosion(true);

            // Comeback Contract targets (and any enemy destroyed while a contract is active)
            // never award score and never drop powerups.
            const noScoreOrDrops = !!(this.isComebackContract || (this.game && this.game.comebackActive));

            if (this.isComebackContract && this.game && typeof this.game.onComebackContractTargetDown === 'function') {
                this.game.onComebackContractTargetDown();
            }

            if (!wasMindControlled && !noScoreOrDrops && (!this.isNewbieDrop || (this.game && this.game.difficulty === 'EASY'))) {
                let reward = 500;
                if (this.type === 'UFO') reward = 700;
                if (this.type === 'UFO_SNIPER') reward = 900;
                if (this.type === 'UFO_COMMANDO') reward = 2000;
                if (this.type === 'MINIBOSS_INTERCEPTOR') reward = 1300;
                if (this.type === 'BOSS') {
                    reward = 3750;
                    // Trigger fleeing for all other enemies
                    if (this.game && this.game.enemies) {
                        this.game.enemies.forEach(e => {
                            if (e !== this && !e.markedForDeletion && !e.isMindControlled) {
                                e.isFleeing = true;
                            }
                        });
                    }
                }

                reward = Math.floor(reward * this.game.scoreMultiplier);
                this.game.score += reward;

                const scoreColor = (this.game && this.game.scoreMultiplier > 1.0) ? "#ffd700" : "#fff";
                this.game.floatingTexts.push(new FloatingText(this.x, this.y, `+${reward}`, scoreColor));

                // --- CHANGED LOGIC HERE ---
                // Standard UFOs now ALWAYS drop based on the priority list.
                // EXCEPTION: Sector 10 commando defenders should NOT drop powerups.
                // NOTE: forceDrop enemies are handled in Game.js update loop.
                if (!this.forceDrop) {
                    const isSector10Commando = (this.type === 'UFO_COMMANDO' && this.game && this.game.level === 10);
                    // Basic UFOs don't drop powerups in early sectors (1-4) — UNLESS the player
                    // is a beginner (career score below 50,000) who needs the boost.
                    const isBeginner = (this.game && this.game.difficulty === 'EASY');
                    const isEarlyBasicUfo = (this.type === 'UFO' && this.game && this.game.level <= 4 && !isBeginner);
                    if (this.isUfo() && !isSector10Commando && !isEarlyBasicUfo) {
                        // Hard mode: only Sniper and Commando UFOs drop powerups (never basic UFOs).
                        const isEliteUfo = (this.type === 'UFO_SNIPER' || this.type === 'UFO_COMMANDO');
                        if (this.game.difficulty !== 'HARD' || isEliteUfo) {
                            const p = new Powerup(this.x, this.y, randomPowerType(this.game));
                            if (isBeginner && this.type === 'UFO' && this.game.level <= 4) {
                                p.isNewbieDrop = true;
                            }
                            this.game.powerups.push(p);
                        }
                    }
                    else if (this.type === 'MINIBOSS_INTERCEPTOR' || this.type === 'INTERCEPTOR') {
                        // Hard mode: interceptors and mini bosses never drop powerups.
                        if (this.game.difficulty !== 'HARD') {
                            this.game.powerups.push(new Powerup(this.x, this.y, randomPowerType(this.game)));
                        }
                    }
                }

                this.game.updateHUD();
            }
        } else {
            AudioSys.playVehicleHit();
            createExplosion(this.game, this.x, this.y, 0.5, '#ffffff', false);
        }
    }

    explode() { this.takeDamage(999); }
}

// ----------------------------------------------------------------------------------------------------
// FLOATING TEXT
// ----------------------------------------------------------------------------------------------------
export class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.life = 1.5; this.vy = -20;
    }
    update(dt) { this.y += this.vy * dt; this.life -= dt; }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = "bold 20px 'Segoe UI'";
        ctx.shadowColor = this.color; ctx.shadowBlur = 10;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}
