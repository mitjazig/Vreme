import { fetchRecentReadings } from './sheets.js';

// ── Konstante ───────────────────────────────────────────────────────────────

const W = 400, H = 520;
const BUCKET_W = 60, BUCKET_H = 16;
const BUCKET_Y = H - 36;
const BUCKET_SPEED = 4.5;
const MAX_DROPS = 80;
const BASE_DROP_SPEED = 3;
const DROP_INTERVAL_MS = 280;
const LIGHTNING_CHANCE = 0.003; // na frame
const SUN_CHANCE = 0.001;
const SNOWFLAKE_CHANCE = 0.002;
const LIFE_COUNT = 3;

// ── Stanje igre ─────────────────────────────────────────────────────────────

let canvas, ctx;
let state = 'idle'; // idle | running | dead | gameover
let score = 0, best = 0, lives = LIFE_COUNT;
let frameId = null;
let drops = [], lightnings = [], sunRays = [], snowflakes = [];
let bucketX = W / 2 - BUCKET_W / 2;
let keys = { left: false, right: false };
let touchX = null;
let dropTimer = 0, lastTime = 0;
let dropInterval = DROP_INTERVAL_MS;

// Vremenski podatki iz postaje
let weather = { precipRate: 1, windDir: 0, windSpeed: 0, solar: 0, temp: 15 };
let weatherMode = 'rain'; // rain | sun | snow | storm
let weatherBadgeEl;

// ── Inicializacija ───────────────────────────────────────────────────────────

async function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  weatherBadgeEl = document.getElementById('weather-badge');

  // Prilagodi canvas velikost zaslonu
  const maxW = Math.min(window.innerWidth - 16, W);
  canvas.style.width = maxW + 'px';
  canvas.style.height = Math.round(maxW * H / W) + 'px';

  best = parseInt(localStorage.getItem('igra-best') || '0', 10);
  updateHud();

  document.getElementById('btn-start').addEventListener('click', startGame);

  // Tipkovnica
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  keys.left  = true;
    if (e.key === 'ArrowRight') keys.right = true;
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft')  keys.left  = false;
    if (e.key === 'ArrowRight') keys.right = false;
  });

  // Dotik
  canvas.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!e.touches.length) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    touchX = (e.touches[0].clientX - rect.left) * scaleX - BUCKET_W / 2;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { touchX = null; });

  await loadWeather();
  drawIdle();
}

async function loadWeather() {
  try {
    const readings = await fetchRecentReadings(1);
    const r = readings[readings.length - 1];
    if (r) {
      weather.precipRate = r.precipRate ?? 1;
      weather.windDir    = r.windDir    ?? 0;
      weather.windSpeed  = r.windSpeed  ?? 0;
      weather.solar      = r.solar      ?? 0;
      weather.temp       = r.temp       ?? 15;
    }
    determineMode();
    const modeLabel = { rain: '🌧️ Deževno', sun: '☀️ Sončno', snow: '❄️ Sneg', storm: '⛈️ Nevihta' }[weatherMode];
    weatherBadgeEl.textContent =
      `${modeLabel} · ${weather.temp?.toFixed(1) ?? '—'}°C · veter ${weather.windSpeed?.toFixed(1) ?? '—'} km/h`;
  } catch {
    weatherBadgeEl.textContent = 'Postaja ni dosegljiva – igra z defaultnimi vrednostmi';
  }
}

function determineMode() {
  const { precipRate, solar, windSpeed, temp } = weather;
  if (precipRate > 3 || windSpeed > 30) { weatherMode = 'storm'; return; }
  if (temp !== null && temp < 2 && precipRate > 0) { weatherMode = 'snow'; return; }
  if (precipRate > 0.3) { weatherMode = 'rain'; return; }
  if (solar > 400) { weatherMode = 'sun'; return; }
  weatherMode = 'rain';
}

// ── Zagon ────────────────────────────────────────────────────────────────────

function startGame() {
  const overlay = document.getElementById('overlay');
  overlay.classList.add('hidden');

  state = 'running';
  score = 0; lives = LIFE_COUNT;
  drops = []; lightnings = []; sunRays = []; snowflakes = [];
  bucketX = W / 2 - BUCKET_W / 2;
  dropTimer = 0; lastTime = 0;

  // Prilagodi hitrost kapljic glede na vreme
  dropInterval = Math.max(100, DROP_INTERVAL_MS - (weather.precipRate || 0) * 20);

  updateHud();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(loop);
}

// ── Glavna zanka ─────────────────────────────────────────────────────────────

function loop(ts) {
  const dt = Math.min(ts - (lastTime || ts), 50);
  lastTime = ts;

  update(dt);
  draw();

  if (state === 'running') frameId = requestAnimationFrame(loop);
}

function update(dt) {
  // Premik vedra
  if (touchX !== null) {
    bucketX = Math.max(0, Math.min(W - BUCKET_W, touchX));
  } else {
    if (keys.left)  bucketX = Math.max(0, bucketX - BUCKET_SPEED * dt / 16);
    if (keys.right) bucketX = Math.min(W - BUCKET_W, bucketX + BUCKET_SPEED * dt / 16);
  }

  // Spawn kapljic / snežink / sončnih žarkov
  dropTimer += dt;
  if (dropTimer >= dropInterval && drops.length < MAX_DROPS) {
    dropTimer = 0;
    spawnDrop();
  }

  // Storm: strele
  if (weatherMode === 'storm' && Math.random() < LIGHTNING_CHANCE) spawnLightning();
  // Sun: sončni žarki (bonusi)
  if (weatherMode === 'sun'   && Math.random() < SUN_CHANCE)       spawnSunRay();
  // Snow: snežinke
  if (weatherMode === 'snow'  && Math.random() < SNOWFLAKE_CHANCE) spawnSnowflake();

  moveDrop(dt);
  moveLightnings(dt);
  moveSunRays(dt);
  moveSnowflakes(dt);
}

// ── Spawn ────────────────────────────────────────────────────────────────────

function windDrift() {
  // Veter pomika kaplje v horizontalni smeri (sever=0, jug=180 se ne upošteva)
  const deg = weather.windDir ?? 0;
  const rad = deg * Math.PI / 180;
  return Math.sin(rad) * (weather.windSpeed ?? 0) * 0.06;
}

function spawnDrop() {
  drops.push({
    x: Math.random() * W,
    y: -10,
    speed: BASE_DROP_SPEED + Math.random() * 2 + (weather.precipRate ?? 0) * 0.15,
    drift: windDrift() + (Math.random() - 0.5) * 0.3,
    r: 2.5 + Math.random() * 2,
    alpha: 0.6 + Math.random() * 0.4,
  });
}

function spawnLightning() {
  const x = 20 + Math.random() * (W - 40);
  lightnings.push({ x, y: 0, targetY: BUCKET_Y, alpha: 1, life: 0, maxLife: 400 });
}

function spawnSunRay() {
  sunRays.push({
    x: Math.random() * W,
    y: -20,
    speed: 2 + Math.random() * 2,
    r: 14,
    alpha: 0.9,
  });
}

function spawnSnowflake() {
  snowflakes.push({
    x: Math.random() * W,
    y: -10,
    speed: 1 + Math.random() * 1.5,
    drift: (Math.random() - 0.5) * 1.5 + windDrift() * 0.5,
    r: 4 + Math.random() * 5,
    alpha: 0.7 + Math.random() * 0.3,
    angle: Math.random() * Math.PI,
  });
}

// ── Premik in zadetki ────────────────────────────────────────────────────────

function hitsBucket(x, y, r = 0) {
  return y + r >= BUCKET_Y && y - r <= BUCKET_Y + BUCKET_H &&
         x + r >= bucketX  && x - r <= bucketX + BUCKET_W;
}

function moveDrop(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.y += d.speed * dt / 16;
    d.x += d.drift * dt / 16;
    if (hitsBucket(d.x, d.y)) {
      score++;
      drops.splice(i, 1);
      updateHud();
      continue;
    }
    if (d.y > H + 20) {
      drops.splice(i, 1);
      if (weatherMode === 'rain' || weatherMode === 'storm') loseLife();
    }
  }
}

function moveLightnings(dt) {
  for (let i = lightnings.length - 1; i >= 0; i--) {
    const l = lightnings[i];
    l.life += dt;
    l.alpha = 1 - l.life / l.maxLife;
    if (hitsBucket(l.x, 0) && l.life < 200) {
      loseLife();
      lightnings.splice(i, 1);
      continue;
    }
    if (l.life >= l.maxLife) lightnings.splice(i, 1);
  }
}

function moveSunRays(dt) {
  for (let i = sunRays.length - 1; i >= 0; i--) {
    const s = sunRays[i];
    s.y += s.speed * dt / 16;
    if (hitsBucket(s.x, s.y, s.r)) {
      score += 3; // bonus za sonce
      sunRays.splice(i, 1);
      updateHud();
      continue;
    }
    if (s.y > H + 20) sunRays.splice(i, 1);
  }
}

function moveSnowflakes(dt) {
  for (let i = snowflakes.length - 1; i >= 0; i--) {
    const s = snowflakes[i];
    s.y += s.speed * dt / 16;
    s.x += s.drift * dt / 16;
    s.angle += 0.01;
    if (hitsBucket(s.x, s.y, s.r)) {
      score += 2;
      snowflakes.splice(i, 1);
      updateHud();
      continue;
    }
    if (s.y > H + 20) {
      snowflakes.splice(i, 1);
    }
  }
}

function loseLife() {
  if (state !== 'running') return;
  lives--;
  updateHud();
  flashScreen();
  if (lives <= 0) endGame();
}

function flashScreen() {
  canvas.style.outline = '3px solid #ef4444';
  setTimeout(() => (canvas.style.outline = ''), 200);
}

// ── Risanje ──────────────────────────────────────────────────────────────────

const RAIN_COLORS    = ['#7dd3fc','#38bdf8','#0ea5e9'];
const STORM_COLORS   = ['#94a3b8','#64748b','#38bdf8'];
const SNOW_COLORS    = ['#e2e8f0','#cbd5e1','#bae6fd'];
const LIGHTNING_COL  = '#fde047';
const SUN_COL        = '#fbbf24';
const BUCKET_COL     = '#38bdf8';

function draw() {
  ctx.clearRect(0, 0, W, H);

  drawBackground();
  drawDrops();
  drawLightnings();
  drawSunRays();
  drawSnowflakes();
  drawBucket();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  const moods = {
    rain:  ['#0f172a','#1e3a5f'],
    storm: ['#0a0a1a','#1a1a3a'],
    sun:   ['#0c1a2e','#1e3a5f'],
    snow:  ['#0f172a','#1e293b'],
  };
  const [c1, c2] = moods[weatherMode] || moods.rain;
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Tla
  ctx.fillStyle = '#1e3a5f44';
  ctx.fillRect(0, BUCKET_Y + BUCKET_H, W, H - BUCKET_Y - BUCKET_H);
}

function drawDrops() {
  for (const d of drops) {
    ctx.save();
    ctx.globalAlpha = d.alpha;
    const col = weatherMode === 'storm' ? STORM_COLORS[Math.floor(d.r) % 3] : RAIN_COLORS[Math.floor(d.r) % 3];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.r * 0.6, d.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawLightnings() {
  for (const l of lightnings) {
    ctx.save();
    ctx.globalAlpha = l.alpha * 0.9;
    ctx.strokeStyle = LIGHTNING_COL;
    ctx.lineWidth = 2;
    ctx.shadowColor = LIGHTNING_COL;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    // Cik-cak strela
    const steps = 8;
    ctx.moveTo(l.x, 0);
    for (let s = 1; s <= steps; s++) {
      const py = (l.targetY / steps) * s;
      const px = l.x + (Math.random() - 0.5) * 30;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawSunRays() {
  for (const s of sunRays) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2);
    grad.addColorStop(0, SUN_COL);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 2, 0, Math.PI * 2);
    ctx.fill();
    // Številka +3
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+3', s.x, s.y + 4);
    ctx.restore();
  }
}

function drawSnowflakes() {
  for (const s of snowflakes) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = SNOW_COLORS[Math.floor(s.r) % 3];
    ctx.lineWidth = 1.5;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, s.r);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBucket() {
  const x = bucketX, y = BUCKET_Y;
  ctx.save();
  ctx.strokeStyle = BUCKET_COL;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = BUCKET_COL + '33';
  ctx.shadowColor = BUCKET_COL;
  ctx.shadowBlur = 8;
  // Vedro: trapezoid
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + BUCKET_W - 4, y);
  ctx.lineTo(x + BUCKET_W, y + BUCKET_H);
  ctx.lineTo(x, y + BUCKET_H);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawIdle() {
  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Animirane navidezne kapljice
  for (let i = 0; i < 30; i++) {
    ctx.globalAlpha = 0.15 + Math.random() * 0.3;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(Math.random() * W, Math.random() * H, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── HUD & konec ───────────────────────────────────────────────────────────────

function updateHud() {
  document.getElementById('hud-score').textContent = score;
  document.getElementById('hud-best').textContent  = 'Rekord: ' + best;
  const livesEl = document.getElementById('hud-lives');
  livesEl.textContent = '❤️'.repeat(lives) + '🖤'.repeat(Math.max(0, LIFE_COUNT - lives));
}

function endGame() {
  state = 'gameover';
  if (score > best) {
    best = score;
    localStorage.setItem('igra-best', best);
  }
  updateHud();
  showOverlay('game-over');
}

function showOverlay(type) {
  const overlay = document.getElementById('overlay');
  const title   = document.getElementById('overlay-title');
  const desc    = document.getElementById('overlay-desc');
  const scoreEl = document.getElementById('overlay-score');
  const btn     = document.getElementById('btn-start');

  if (type === 'game-over') {
    title.textContent = score > best - 1 && score > 0 ? '🏆 Nov rekord!' : '💧 Konec igre';
    scoreEl.textContent = score;
    scoreEl.classList.remove('hidden');
    desc.textContent = `Ujel si ${score} kapljic.`;
    btn.textContent = 'Znova';
  } else {
    title.textContent = '🌧️ Ulovi dež';
    desc.innerHTML = 'Lovi kapljice z vedrom.<br>Puščice ← → ali drži prst.';
    scoreEl.classList.add('hidden');
    btn.textContent = 'Začni igro';
  }
  overlay.classList.remove('hidden');
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
