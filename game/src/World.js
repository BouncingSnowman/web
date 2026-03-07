import { CONFIG } from './constants.js?v=6000';

// Static background images
const UNIVERSE_BG = new Image();
UNIVERSE_BG.src = 'assets/world/universe.png?v=6000';

const PLUTO_BG = new Image();
PLUTO_BG.src = 'assets/world/pluto.png?v=6000';

const SATURN_BG = new Image();
SATURN_BG.src = 'assets/world/saturn.png?v=6000';

const JUPITER_BG = new Image();
JUPITER_BG.src = 'assets/world/jupiter.png?v=6000';

const MARS_BG = new Image();
MARS_BG.src = 'assets/world/mars.png?v=6000';

const MOON_BG = new Image();
MOON_BG.src = 'assets/world/moon.png?v=6000';

const EARTH_BG = new Image();
EARTH_BG.src = 'assets/world/earth.png?v=6000';

const START_BG = new Image();
START_BG.src = 'assets/world/start.png?v=6000';

const SECTOR2_BG = new Image();
SECTOR2_BG.src = 'assets/world/sector2.png?v=6000';

function drawCoverImage(ctx, img) {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;

    // Fallback while the image loads
    if (!img || !img.complete || !img.naturalWidth) {
        ctx.fillStyle = 'rgb(2, 6, 16)';
        ctx.fillRect(0, 0, cw, ch);
        return;
    }

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;

    const dx = (cw - dw) * 0.5;
    const dy = (ch - dh) * 0.5;

    ctx.drawImage(img, dx, dy, dw, dh);
}

export class Star {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.reset();
        this.y = Math.random() * h;
    }
    reset() {
        this.x = Math.random() * this.w;
        this.y = -10;
        this.z = Math.random() * 3 + 0.5;
        const colors = ['#ffffff', '#cceeff', '#fff4e6'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.baseSize = Math.random() * 1.5 + 0.5;
    }
    update(dt) {
        this.y += (30 * this.z) * dt;
        if (this.y > this.h) this.reset();
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        const size = this.baseSize * (0.8 + Math.sin(Date.now() * 0.005 * this.z) * 0.2);
        ctx.globalAlpha = Math.min(1, size * 0.5);
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

export class Nebula {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.reset();
        this.y = Math.random() * h;
    }
    reset() {
        this.x = Math.random() * this.w;
        this.y = -200;
        this.radius = 100 + Math.random() * 200;

        // Fully randomized hue for richer variety across the mission
        const hue = Math.random() * 360;
        this.colorStops = [
            `hsla(${hue}, 60%, 20%, 0)`,
            `hsla(${hue}, 60%, 10%, 0.22)`, // Slightly more opaque for better visibility
            `hsla(${hue}, 60%, 5%, 0)`
        ];
        this.speed = 10 + Math.random() * 10;
    }

    update(dt) {
        this.y += this.speed * dt;
        if (this.y - this.radius > this.h) this.reset();
    }
    draw(ctx) {
        const g = ctx.createRadialGradient(
            this.x,
            this.y,
            0,
            this.x,
            this.y,
            this.radius
        );
        g.addColorStop(0, this.colorStops[1]);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(
            this.x - this.radius,
            this.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );
        ctx.globalCompositeOperation = 'source-over';
    }
}

export class Galaxy {
    constructor(w, h) {
        this.w = w;
        this.h = h;
    }

    draw(ctx, level) {
        // Level backgrounds:
        // 1: start.png
        // 2: sector2.png
        // 3: pluto.png
        // 6: saturn.png
        // 7: jupiter.png
        // 8: mars.png
        // 9: moon.png
        // 10: earth.png
        // Others: universe.png
        let img = UNIVERSE_BG;

        if (level === 1) img = START_BG;
        if (level === 2) img = SECTOR2_BG;

        if (level === 3) img = PLUTO_BG;
        if (level === 6) img = SATURN_BG;
        if (level === 7) img = JUPITER_BG;
        if (level === 8) img = MARS_BG;
        if (level === 9) img = MOON_BG;
        if (level === 10) img = EARTH_BG;

        drawCoverImage(ctx, img);
    }
}

export class Planet {
    constructor(level) {
        this.level = level;

        // Levels with image backgrounds should not draw an extra planet.
        if (level === 1 || level === 2 || level === 3 || level === 6 || level === 7 || level === 8 || level === 9 || level === 10) {
            this.type = 'NONE';
            this.radius = 0;
            this.x = 0;
            this.y = 0;
            this.speed = 0;
            this.rotation = 0;
            this.rotSpeed = 0;
            this.planetCanvas = null;
            return;
        }

        this.radius = 300 + Math.random() * 300;
        this.x =
            window.innerWidth * 0.2 +
            Math.random() * (window.innerWidth * 0.6);
        this.y = -this.radius * 1.2;

        this.speed =
            (CONFIG.BASE_PLANET_SPEED + level * 5) * 0.3;
        this.rotation = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.05;

        this.planetCanvas = document.createElement('canvas');

        this.type = 'GAS_GIANT';

        // Default gas giant look
        this.hue = Math.random() * 360;
        this.gradSat0 = 60;
        this.gradSat1 = 50;
        this.gradSat2 = 40;
        this.gradLight0 = 60;
        this.gradLight1 = 40;
        this.gradLight2 = 15;
        this.shadowSat = 80;
        this.shadowLight = 60;

        // Sector 4: force a darker "proper blue" gas giant
        if (level === 4) {
            this.hue = 220 + (Math.random() * 20 - 10); // ~210..230
            this.gradLight0 = 54;
            this.gradLight1 = 34;
            this.gradLight2 = 12;
            this.shadowLight = 52;
        }

        // Sector 5: force a blue/cyan gas giant (Uranus vibe)
        if (level === 5) {
            this.hue = 195 + (Math.random() * 24 - 12); // ~183..207
        }

        this.textureOffset = 0;
    }

    update(dt) {
        if (this.type === 'NONE') return;

        this.y += this.speed * dt;
        this.rotation += this.rotSpeed * dt;

        if (this.type === 'GAS_GIANT') {
            this.textureOffset += dt * 0.05;
        }
    }

    draw(ctx) {
        if (this.type === 'NONE') return;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Gas Giant
        ctx.rotate(this.rotation);
        const grad = ctx.createRadialGradient(
            -this.radius * 0.3,
            -this.radius * 0.3,
            this.radius * 0.1,
            0,
            0,
            this.radius
        );
        grad.addColorStop(
            0,
            `hsl(${this.hue}, ${this.gradSat0}%, ${this.gradLight0}%)`
        );
        grad.addColorStop(
            0.5,
            `hsl(${this.hue}, ${this.gradSat1}%, ${this.gradLight1}%)`
        );
        grad.addColorStop(
            1,
            `hsl(${this.hue}, ${this.gradSat2}%, ${this.gradLight2}%)`
        );
        ctx.shadowBlur = 50;
        ctx.shadowColor = `hsl(${this.hue}, ${this.shadowSat}%, ${this.shadowLight}%)`;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.restore();
    }
}
