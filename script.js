/* ============================================
   Snowflake Particle System
   ============================================ */
const canvas = document.getElementById('snowCanvas');
const ctx = canvas.getContext('2d');
let particles = [];
let mouseX = -1000;
let mouseY = -1000;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

class Snowflake {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * -canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedY = Math.random() * 0.6 + 0.2;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.opacity = Math.random() * 0.5 + 0.1;
        this.wobbleAmplitude = Math.random() * 30 + 10;
        this.wobbleSpeed = Math.random() * 0.02 + 0.005;
        this.wobbleOffset = Math.random() * Math.PI * 2;
        this.time = 0;
    }

    update() {
        this.time += this.wobbleSpeed;
        this.y += this.speedY;
        this.x += this.speedX + Math.sin(this.time + this.wobbleOffset) * 0.3;

        // Mouse interaction — gently push snowflakes away
        const dx = this.x - mouseX;
        const dy = this.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
            const force = (120 - dist) / 120;
            this.x += (dx / dist) * force * 1.5;
            this.y += (dy / dist) * force * 0.5;
        }

        if (this.y > canvas.height + 10) {
            this.reset();
            this.y = -10;
        }
        if (this.x < -10) this.x = canvas.width + 10;
        if (this.x > canvas.width + 10) this.x = -10;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${this.opacity})`;
        ctx.fill();
    }
}

function initSnowflakes() {
    const count = Math.min(Math.floor(window.innerWidth / 8), 150);
    particles = [];
    for (let i = 0; i < count; i++) {
        const sf = new Snowflake();
        sf.y = Math.random() * canvas.height; // spread initially
        particles.push(sf);
    }
}

function animateSnow() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
        p.update();
        p.draw();
    }
    requestAnimationFrame(animateSnow);
}

resizeCanvas();
initSnowflakes();
animateSnow();

window.addEventListener('resize', () => {
    resizeCanvas();
    initSnowflakes();
});

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

/* ============================================
   Navbar Scroll Effect
   ============================================ */
const navbar = document.getElementById('navbar');

function updateNavbar() {
    if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
}

window.addEventListener('scroll', updateNavbar, { passive: true });

/* ============================================
   Scroll Reveal Animation
   ============================================ */
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);

revealElements.forEach((el) => revealObserver.observe(el));

/* ============================================
   Skill Bar Animation
   ============================================ */
const skillItems = document.querySelectorAll('.skill-item');

const skillObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                skillObserver.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.3 }
);

skillItems.forEach((el) => skillObserver.observe(el));

/* ============================================
   Smooth Scroll for Nav Links
   ============================================ */
document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
        const targetId = link.getAttribute('href');
        if (targetId === '#') return;
        e.preventDefault();
        const target = document.querySelector(targetId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});
