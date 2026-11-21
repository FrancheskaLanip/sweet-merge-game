"use strict";

/* =====================================================================
   SWEETS MERGE
   A cute physics merge game. Plain HTML + CSS + JavaScript.
   No libraries needed: the circle physics is written right here,
   so the whole project works on GitHub Pages as static files.
   ===================================================================== */

// ---------------------------------------------------------------------
// CONFIG  (safe to tweak)
// ---------------------------------------------------------------------
const W = 400;                    // logical canvas size
const H = 640;
const JAR = { left: 24, right: 376, floor: 610, limit: 150, top: 120 };
const SPAWN_Y = 92;               // height where the held sweet floats
const GRAVITY = 1500;             // pixels per second squared
const RESTITUTION = 0.05;         // bounciness (0 = none)
const FRICTION = 0.04;        // sliding friction (low, because real balls roll instead of sticking on slopes)
const SUBSTEPS = 6;               // physics steps per frame (more = steadier)
const DROP_COOLDOWN = 0.45;       // seconds between drops
const GRACE_TIME = 1.0;           // new sweets are ignored for this long
const SPRITE_FIT = 1.1;           // picture size compared to its circle

// Difficulty levels the player picks on the start screen.
// weights = chance of dropping sweet 0..4.
// The game ends the moment a settled sweet crosses the dashed line.
const LEVELS = {
  easy:   { label: "Easy",   powerEvery: 80,  orders: { slots: 2, time: 1.4 },  weights: [36, 30, 20, 10, 4], desc: "More small sweets. Great for learning." },
  normal: { label: "Normal", powerEvery: 100, orders: { slots: 2, time: 1.0 }, weights: [30, 28, 20, 14, 8], desc: "The classic mix of sweets." },
  hard:   { label: "Hard",   powerEvery: 130, orders: { slots: 3, time: 0.8 }, weights: [20, 22, 22, 20, 16], desc: "More big sweets and more orders." },
  daily:  { label: "Daily",  powerEvery: 100, orders: { slots: 2, time: 1.0 }, weights: [30, 28, 20, 14, 8], daily: true, desc: "Same sweets for everyone today." },
  attack: { label: "Time Attack", powerEvery: 70, orders: { slots: 2, time: 0.8 }, weights: [30, 28, 20, 14, 8], timer: 90, noLine: true, local: true, desc: "90 seconds, no game over line. Score as much as you can!" },
  zen:    { label: "Zen",    powerEvery: 80,  orders: { slots: 1, time: 2.0 }, weights: [36, 30, 20, 10, 4], zen: true, noLine: true, local: true, desc: "Relax. No game over: crowded sweets pop away on their own." },
  mystery:{ label: "Mystery", powerEvery: 100, orders: { slots: 2, time: 1.0 }, weights: [30, 28, 20, 14, 8], mystery: true, local: true, desc: "The next sweet is hidden. Plan ahead!" },
  puzzle: { label: "Puzzle", powerEvery: 99999, orders: { slots: 0, time: 1 }, weights: [30, 28, 20, 14, 8], puzzle: true, plain: true, local: true }
};
function modeCfg() { return LEVELS[level]; }   // the settings of the mode being played
const LEVEL_KEYS = ["easy", "normal", "hard", "daily", "attack", "zen", "mystery"];
function isLocalBoard(key) { return !!(LEVELS[key] && LEVELS[key].local); }

// Puzzle challenges: the sweets come in the same order every time, so you can plan.
// Goal: make the target sweet before you run out of drops. Fewer drops = more stars.
const PUZZLES = [
  { id: 1, name: "Sprinkle Starter", level: 3, drops: 12 },
  { id: 2, name: "Dango Dash",       level: 4, drops: 14 },
  { id: 3, name: "Tiny Bakery",      level: 5, drops: 24 },
  { id: 4, name: "Cupcake Rush",     level: 5, drops: 18 },
  { id: 5, name: "Donut Dream",      level: 6, drops: 44 },
  { id: 6, name: "Tight Squeeze",    level: 6, drops: 34 },
  { id: 7, name: "Pudding Master",   level: 7, drops: 85 }
];
function puzzleStarsFor(p, used) { return used <= Math.ceil(p.drops * 0.6) ? 3 : used <= Math.ceil(p.drops * 0.8) ? 2 : 1; }

// ---------------------------------------------------------------------
// DAILY CHALLENGE: everybody gets the same sweets in the same order today.
// The day is counted in UTC so players in every country share one board.
// ---------------------------------------------------------------------
function dailyKey() {
  const d = new Date();
  return "" + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}

// Name of the score list (and best score) for a level: daily has one per day.
function boardKey(lv) { return lv === "daily" ? "daily_" + dailyKey() : lv; }

function dailyLabel() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Small seeded random generator (same seed gives the same numbers).
function seededRng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^ 0x9e3779b9) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const MAX_BONUS = 100;
const ORDER_FIRST_DELAY = 6;      // seconds before the first bakery order shows up
const ORDER_GAP = 3;              // seconds before a finished order is replaced
const POWER_MAX = 3;              // most charges you can hold of each power-up
const COMBO_WINDOW = 1.6;         // seconds to keep a combo going
const COMBO_MAX = 5;              // highest score multiplier
const FEVER_TIME = 8;             // seconds of Fever mode
const BOMB_FUSE = 2.0;            // seconds before a Bomb Candy explodes
const SPECIAL_CHANCE = 0.07;      // chance that the next sweet is a special one
const DANGER_ZONE = 90;           // sweets this close to the line look worried            // bonus for merging two of the biggest sweets

// One entry per level, smallest to biggest.
// r = radius, points = score for creating this level,
// color = placeholder color used if the picture is missing.
const SWEETS = [
  { name: "Sprinkle Ball",  r: 17, points: 0,  color: "#fff1dc", image: "assets/sweet0.png" },
  { name: "Strawberry",     r: 23, points: 2,  color: "#ff7b7b", image: "assets/sweet1.png" },
  { name: "Dango",          r: 29, points: 4,  color: "#ffc2d6", image: "assets/sweet2.png" },
  { name: "Mochi",          r: 36, points: 7,  color: "#fbeef5", image: "assets/sweet3.png" },
  { name: "Macaron",        r: 43, points: 11, color: "#c9a7ff", image: "assets/sweet4.png" },
  { name: "Cupcake",        r: 51, points: 16, color: "#ffd6a5", image: "assets/sweet5.png" },
  { name: "Donut",          r: 60, points: 22, color: "#a8714f", image: "assets/sweet6.png" },
  { name: "Pudding",        r: 69, points: 29, color: "#ffe08a", image: "assets/sweet7.png" },
  { name: "Cake Slice",     r: 79, points: 37, color: "#fff1b8", image: "assets/sweet8.png" },
  { name: "Birthday Cake",  r: 91, points: 46, color: "#ffb3d1", image: "assets/sweet9.png" }
];
const LAST = SWEETS.length - 1;

const SPARKLE_COLORS = ["#ff9ec4", "#ffd166", "#9be7ff", "#c9a7ff", "#ffffff"];

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------
const canvas = document.getElementById("game");
const nextCanvas = document.getElementById("next");
const ladderEl = document.getElementById("ladder");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const toastEl = document.getElementById("toast");
const overlayEl = document.getElementById("overlay");
const overTitleEl = document.getElementById("over-title");
const topBoxEl = document.getElementById("top-box");
const bestLineEl = document.getElementById("best-line");
const levelDescEl = document.getElementById("level-desc");
const puzzleOverlay = document.getElementById("puzzle-overlay");
const puzzleListEl = document.getElementById("puzzle-list");
const missionListEl = document.getElementById("mission-list");
const missionCountEl = document.getElementById("mission-count");
const xpLevelEl = document.getElementById("xp-level");
const xpFillEl = document.getElementById("xp-fill");
const xpTextEl = document.getElementById("xp-text");
const menuLevelEl = document.getElementById("menu-level");
const profileOverlay = document.getElementById("profile-overlay");
const statGridEl = document.getElementById("stat-grid");
const themeListEl = document.getElementById("theme-list");
const profileTitleEl = document.getElementById("profile-title");
const shareBtn = document.getElementById("share-btn");
const stageEl = document.querySelector(".stage");
const achListEl = document.getElementById("ach-list");
const achCountEl = document.getElementById("ach-count");
const titleEl = document.getElementById("player-title");
const orderListEl = document.getElementById("order-list");
const ordersDoneEl = document.getElementById("orders-done");
const finalScoreEl = document.getElementById("final-score");
const finalBestEl = document.getElementById("final-best");
const newBestEl = document.getElementById("new-best");
const muteBtn = document.getElementById("mute");
const restartBtn = document.getElementById("restart");
const playAgainBtn = document.getElementById("play-again");
const submitBox = document.getElementById("submit-box");
const submitBtn = document.getElementById("submit-score");
const submitStatus = document.getElementById("submit-status");
const topListEl = document.getElementById("top-list");
const boardStatusEl = document.getElementById("board-status");
const boardBtn = document.getElementById("board-btn");
const boardOverlay = document.getElementById("board-overlay");
const boardListEl = document.getElementById("board-list");
const boardOverlayStatus = document.getElementById("board-overlay-status");
const boardCloseBtn = document.getElementById("board-close");
const menuEl = document.getElementById("menu");
const pauseOverlay = document.getElementById("pause-overlay");
const menuDailySub = document.getElementById("daily-sub");
const powerBtns = {
  swap: document.getElementById("pw-swap"),
  shake: document.getElementById("pw-shake"),
  pop: document.getElementById("pw-pop")
};
const bookOverlay = document.getElementById("book-overlay");
const bookGrid = document.getElementById("book-grid");
const bookDetail = document.getElementById("book-detail");
const bookCount = document.getElementById("book-count");
const bookBtn = document.getElementById("book-btn");
const bookClose = document.getElementById("book-close");
const tutOverlay = document.getElementById("tutorial-overlay");
const tutSteps = Array.from(document.querySelectorAll(".tut-step"));
const tutDots = document.getElementById("tut-dots");
const tutBack = document.getElementById("tut-back");
const tutNext = document.getElementById("tut-next");
const helpBtn = document.getElementById("help-btn");
const pauseBtn = document.getElementById("pause-btn");
const resumeBtn = document.getElementById("resume-btn");
const pauseMenuBtn = document.getElementById("pause-menu");
const pauseRestartBtn = document.getElementById("pause-restart");
const menuName = document.getElementById("menu-name");
const menuStatus = document.getElementById("menu-status");
const menuBest = document.getElementById("menu-best");
const startBtn = document.getElementById("start-btn");
const menuBtn = document.getElementById("menu-btn");
const goMenuBtn = document.getElementById("go-menu");
const levelName = document.getElementById("level-name");
const topTitle = document.getElementById("top-title");
const levelBtns = Array.from(document.querySelectorAll(".level-btn[data-level]"));
const tabBtns = Array.from(document.querySelectorAll(".tab"));

// Safe wrapper around localStorage (it can be blocked in some browsers).
const store = {
  get(key) {
    try { return localStorage.getItem("sweetsMerge." + key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem("sweetsMerge." + key, String(value)); } catch (e) { /* ignore */ }
  }
};

// Make a canvas sharp on high-density screens.
// We always draw at least 2x, even on normal screens, so pictures stay crisp
// when the browser shrinks the canvas to fit the page.
function setupCanvas(cv, w, h) {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  return c;
}

const ctx = setupCanvas(canvas, W, H);

// The game board is sized to match how big it really appears on the page,
// times at least 2, so it is sharp on every screen and window size.
let lastBackingWidth = 0;
function fitMainCanvas() {
  const cssW = canvas.getBoundingClientRect().width || W;
  const density = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
  const k = Math.min((cssW * density) / W, 3.5);       // pixels per game unit
  const bw = Math.round(W * k);
  if (bw === lastBackingWidth) return;
  lastBackingWidth = bw;
  canvas.width = bw;
  canvas.height = Math.round(H * k);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}
fitMainCanvas();
window.addEventListener("resize", fitMainCanvas);
if (window.ResizeObserver) new ResizeObserver(fitMainCanvas).observe(canvas);
const nextCtx = setupCanvas(nextCanvas, 56, 56);

// ---------------------------------------------------------------------
// PICTURES
// ---------------------------------------------------------------------
// Draws a cute placeholder sweet if the picture file is missing.
function drawFallback(c, s, r) {
  c.fillStyle = s.color;
  c.strokeStyle = "#5b3a3a";
  c.lineWidth = Math.max(1.5, r * 0.09);
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();

  const ex = r * 0.34, ey = -r * 0.05, er = Math.max(1.4, r * 0.085);
  c.fillStyle = "#4a2c2c";
  c.beginPath(); c.arc(-ex, ey, er, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(ex, ey, er, 0, Math.PI * 2); c.fill();

  c.fillStyle = "rgba(255, 130, 165, 0.55)";
  c.beginPath(); c.ellipse(-r * 0.55, r * 0.2, r * 0.15, r * 0.1, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(r * 0.55, r * 0.2, r * 0.15, r * 0.1, 0, 0, Math.PI * 2); c.fill();

  c.strokeStyle = "#4a2c2c";
  c.lineWidth = Math.max(1.2, r * 0.05);
  c.beginPath();
  c.arc(0, r * 0.1, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
}

// mood: "normal", "blink", "happy" or "worried" (each has its own picture)
function drawSweet(c, level, x, y, r, angle, scale, mood) {
  const s = SWEETS[level];
  c.save();
  c.translate(x, y);
  c.rotate(angle || 0);
  c.scale(scale || 1, scale || 1);
  if (s.imgOk) {
    const d = r * 2 * SPRITE_FIT;
    const m = mood && s.faces[mood];
    c.drawImage(m && m.ok ? m.img : s.img, -d / 2, -d / 2, d, d);
  } else {
    drawFallback(c, s, r);
  }
  c.restore();
}

function drawGoldAura(c, x, y, r) {
  const p = 0.5 + 0.5 * Math.sin(time * 6);
  c.save();
  c.shadowColor = "rgba(255, 205, 60, 0.9)";
  c.shadowBlur = 14;
  c.strokeStyle = "rgba(255, 215, 90, " + (0.6 + 0.3 * p) + ")";
  c.lineWidth = 4;
  c.beginPath();
  c.arc(x, y, r * 0.98, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  drawStar(c, x + r * 0.7, y - r * 0.7, 7 + 3 * p, "#fff3b0");
  drawStar(c, x - r * 0.75, y + r * 0.5, 5 + 2 * (1 - p), "#ffd770");
}

// Bomb Candy: a round, cute bomb with a lit fuse (drawn with code, no picture needed).
function drawBomb(c, r, fuse) {
  const hot = fuse !== undefined && fuse !== null && fuse < 0.9 && Math.sin(time * 30) > 0;
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, hot ? "#ff9a8a" : "#7a68a8");
  g.addColorStop(1, hot ? "#d9323f" : "#2b2147");
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, r * 0.95, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3; c.strokeStyle = "#150f26"; c.stroke();
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath(); c.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#9a9ab8"; c.fillRect(-r * 0.22, -r * 1.08, r * 0.44, r * 0.2);
  c.strokeStyle = "#c9a45a"; c.lineWidth = 3; c.lineCap = "round";
  c.beginPath(); c.moveTo(0, -r * 1.06); c.quadraticCurveTo(r * 0.3, -r * 1.45, r * 0.55, -r * 1.3); c.stroke();
  drawStar(c, r * 0.55, -r * 1.3, 5 + 3 * Math.abs(Math.sin(time * 20)), "#ffcf4a");
  c.fillStyle = "#fff";
  c.beginPath(); c.arc(-r * 0.3, 0, r * 0.2, 0, Math.PI * 2); c.arc(r * 0.3, 0, r * 0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#1b1030";
  c.beginPath(); c.arc(-r * 0.27, r * 0.02, r * 0.1, 0, Math.PI * 2); c.arc(r * 0.33, r * 0.02, r * 0.1, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#fff"; c.lineWidth = 2.5;
  c.beginPath();
  if (hot) { c.arc(0, r * 0.5, r * 0.15, Math.PI, 0); } else { c.arc(0, r * 0.3, r * 0.17, 0.2, Math.PI - 0.2); }
  c.stroke();
}

function drawPiece(c, lv, sp, x, y, r, angle, scale, mood, fuse) {
  if (sp === "bomb") {
    c.save(); c.translate(x, y); c.rotate(angle || 0); c.scale(scale || 1, scale || 1);
    drawBomb(c, r, fuse);
    c.restore();
    return;
  }
  drawSweet(c, lv, x, y, r, angle, scale, mood);
  if (sp === "golden") drawGoldAura(c, x, y, r * (scale || 1));
}

// The "merge order" strip under the board.
const ladderCtxs = [];
SWEETS.forEach((s, i) => {
  const cv = document.createElement("canvas");
  cv.title = (i + 1) + ". " + s.name;
  cv.style.width = "34px";
  cv.style.height = "34px";
  ladderEl.appendChild(cv);
  ladderCtxs.push(setupCanvas(cv, 40, 40));
});
nextCanvas.style.width = "52px";
nextCanvas.style.height = "52px";

function refreshLadder() {
  ladderCtxs.forEach((c, i) => {
    c.clearRect(0, 0, 40, 40);
    drawSweet(c, i, 20, 20, 15, 0, 1);
  });
}

function drawNext() {
  nextCtx.clearRect(0, 0, 56, 56);
  if (LEVELS[level].mystery && playing) {
    nextCtx.fillStyle = "#c9a7ff";
    nextCtx.beginPath(); nextCtx.arc(28, 28, 20, 0, Math.PI * 2); nextCtx.fill();
    nextCtx.lineWidth = 3; nextCtx.strokeStyle = "#7b4fd8"; nextCtx.stroke();
    nextCtx.fillStyle = "#fff"; nextCtx.font = "900 28px 'Trebuchet MS', sans-serif";
    nextCtx.textAlign = "center"; nextCtx.textBaseline = "middle";
    nextCtx.fillText("?", 28, 30);
    return;
  }
  drawPiece(nextCtx, next, nextSp, 28, 28, nextSp === "bomb" ? 16 : 20, 0, 1);
}

// Load the pictures (missing files simply use the placeholder).
SWEETS.forEach((s) => {
  s.imgOk = false;
  s.img = new Image();
  s.img.onload = () => { s.imgOk = true; refreshLadder(); drawNext(); };
  s.img.onerror = () => { s.imgOk = false; };
  s.img.src = s.image;

  // face pictures: sweet3_blink.png, sweet3_happy.png, sweet3_worried.png
  s.faces = {};
  ["blink", "happy", "worried"].forEach((mood) => {
    const f = { ok: false, img: new Image() };
    f.img.onload = () => { f.ok = true; };
    f.img.src = s.image.replace(".png", "_" + mood + ".png");
    s.faces[mood] = f;
  });
});

// ---------------------------------------------------------------------
// SOUND  (tiny synthesized sounds, no audio files needed)
// ---------------------------------------------------------------------
let audioCtx = null;
let muted = store.get("muted") === "1";

function ensureAudio() {
  if (muted) return;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, dur, type, vol, slideTo) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Vibration on phones (follows the sound button)
function buzz(pattern) {
  if (muted) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

// Background music: a soft music-box melody made with code (no audio files).
let musicOn = store.get("music") !== "0";
let musicNext = 0, musicStep = 0, musicDeg = 4;
const MUSIC_SCALE = [0, 2, 4, 7, 9];            // C major pentatonic, always sounds nice
const MUSIC_BASS = [0, 2, 3, 1];
function noteFreq(deg, oct) {
  const o = Math.floor(deg / 5);
  const n = MUSIC_SCALE[((deg % 5) + 5) % 5];
  return 261.63 * Math.pow(2, (n + 12 * (o + oct)) / 12);
}
function musicTone(freq, dur, type, vol, when) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(vol, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}
function scheduleMusic() {
  if (!audioCtx || muted || !musicOn || !playing || paused) { musicNext = 0; return; }
  const now = audioCtx.currentTime;
  if (musicNext < now) musicNext = now + 0.05;
  const beat = feverT > 0 ? 0.17 : 0.27;
  while (musicNext < now + 0.35) {
    const step = musicStep % 16;
    if (step % 8 === 0) musicTone(noteFreq(MUSIC_BASS[Math.floor(musicStep / 8) % 4], -1), beat * 7, "sine", 0.045, musicNext);
    if (step % 2 === 0 || Math.random() < 0.3) {
      const moves = [-2, -1, -1, 0, 1, 1, 2];
      musicDeg = Math.max(0, Math.min(9, musicDeg + moves[Math.floor(Math.random() * moves.length)]));
      musicTone(noteFreq(musicDeg, feverT > 0 ? 1 : 0), beat * 1.8, "triangle", 0.035, musicNext);
    }
    musicNext += beat;
    musicStep++;
  }
}
setInterval(scheduleMusic, 150);

function sfxDrop() { tone(220, 0.09, "triangle", 0.1, 140); }
function sfxMerge(level) {
  buzz(level >= 5 ? 25 : 10);
  tone(380 + level * 55, 0.16, "sine", 0.14, 700 + level * 70);
  if (level >= 5) tone(900 + level * 40, 0.22, "triangle", 0.07, 1500);
}
function sfxPower() {
  buzz([30, 40, 30]);
  tone(660, 0.12, "triangle", 0.1, 990); setTimeout(() => tone(990, 0.16, "triangle", 0.09, 1320), 90); }
function sfxOrderNew() { tone(880, 0.09, "sine", 0.06, 1100); }
function sfxOrderDone() {
  buzz([20, 40, 20]);
  tone(523, 0.1, "triangle", 0.1, 659); setTimeout(() => tone(659, 0.1, "triangle", 0.1, 784), 90); setTimeout(() => tone(784, 0.18, "triangle", 0.1, 1046), 180); }
function sfxOrderMiss() { tone(220, 0.2, "sine", 0.07, 130); }
function sfxPop() {
  buzz(25);
  tone(520, 0.12, "square", 0.08, 160); }
function sfxShake() {
  buzz(60);
  tone(140, 0.25, "sawtooth", 0.07, 70); }
function sfxOver() {
  buzz(250);
  tone(330, 0.5, "sawtooth", 0.09, 90); }

function updateMuteButton() {
  muteBtn.innerHTML = '<svg class="ic"><use href="#' + (muted ? "i-mute" : "i-sound") + '"/></svg>';
  muteBtn.setAttribute("aria-label", muted ? "Sound off" : "Sound on");
  muteBtn.title = muted ? "Sound off" : "Sound on";
}

// ---------------------------------------------------------------------
// GAME STATE
// ---------------------------------------------------------------------
let bodies = [];
let particles = [];
let floaters = [];
let score = 0;
let level = LEVEL_KEYS.includes(store.get("level")) ? store.get("level") : "normal";
let playerName = "";
let boardLevel = level;
let activeBoard = boardKey(level);   // which score list the current game belongs to
let spawnRng = Math.random;
let best = 0;
let bestAtStart = 0;
let topLevel = 0;
let held = 0;
let next = 0;
let canDrop = true;
let cooldown = 0;
let aimX = W / 2;
let playing = false;
let time = 0;
let dangerRatio = 0;
let toastTimer = null;
let paused = false;
let powers = { swap: 0, shake: 0, pop: 0 };
let modeTime = 0;           // seconds left in Time Attack
let eventName = "", eventT = 0, eventTimer = 30, rainT = 0, gravMul = 1;
let puzzleIdx = 0, puzzleEndT = 0, puzzleOk = false, puzzleUsed = 0, zenToastT = 0;
let fever = 0;              // 0..100 meter, fills with merges
let feverT = 0;             // seconds of Fever left (0 = not active)
let heldSp = null, nextSp = null;   // special sweet types: "golden" | "bomb" | null
let dropCount = 0;
let ordersMissed = 0;
let orders = [];            // active bakery orders
let orderTimer = 0;         // countdown until the next order appears
let ordersDone = 0;
let orderRng = Math.random;
let orderId = 0;
let nextAward = 100;
let popMode = false;
let popHover = null;
let combo = 0;
let comboTimer = 0;
let comboShow = { text: "", life: 0 };
let shake = 0;
let flash = 0;
let heldBlinkIn = 2;
let heldBlinkT = 0;
let finalScore = 0;
let submitted = false;

const bgStars = [];
for (let i = 0; i < 18; i++) {
  bgStars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    size: 4 + Math.random() * 6,
    phase: Math.random() * Math.PI * 2,
    color: SPARKLE_COLORS[i % SPARKLE_COLORS.length]
  });
}

function randomLevel() {
  const weights = LEVELS[level].weights;
  const total = weights.reduce((a, b) => a + b, 0);
  let n = spawnRng() * total;
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i];
    if (n <= 0) return i;
  }
  return 0;
}

// Roll the next sweet. Sometimes it is a special one (Golden Mochi or Bomb Candy).
function rollNext() {
  next = randomLevel();
  nextSp = null;
  if (dropCount >= 5 && !LEVELS[level].plain && spawnRng() < SPECIAL_CHANCE) {
    if (spawnRng() < 0.5) { nextSp = "golden"; next = 3; }
    else { nextSp = "bomb"; next = 2; }
  }
}

function makeBody(level, x, y) {
  const r = SWEETS[level].r;
  return {
    level, r, x, y,
    vx: 0, vy: 0,
    angle: 0, pop: 0, age: 0, over: 0,
    blinkIn: 1 + Math.random() * 3.5, blinkT: 0, happy: 0,
    m: r * r,
    dead: false, merging: false
  };
}

function addScore(n) {
  if (feverT > 0) n *= 2;
  score += n;
  while (score >= nextAward) { grantPower(); nextAward += LEVELS[level].powerEvery; }
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    bestEl.textContent = best;
  }
}

function showToast(text, ms) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms || 1800);
}

function loadBest() {
  activeBoard = boardKey(level);
  best = Number(store.get("best_" + activeBoard)) || 0;
  bestAtStart = best;
}

function newGame() {
  ensureAudio();
  loadBest();
  levelName.textContent = LEVELS[level].puzzle ? "Puzzle " + PUZZLES[puzzleIdx].id : LEVELS[level].label;
  menuEl.classList.add("hidden");
  puzzleOverlay.classList.add("hidden");
  bodies = [];
  particles = [];
  floaters = [];
  score = 0;
  topLevel = 0;
  dangerRatio = 0;
  combo = 0; comboTimer = 0; comboShow.life = 0; shake = 0; flash = 0;
  powers = { swap: 0, shake: 0, pop: 0 };
  resetOrders();
  nextAward = LEVELS[level].powerEvery;
  spawnRng = LEVELS[level].daily ? seededRng("sweets-merge-" + activeBoard) : Math.random;
  orderRng = LEVELS[level].daily ? seededRng("orders-" + activeBoard) : Math.random;
  if (LEVELS[level].puzzle) { spawnRng = seededRng("puzzle-" + PUZZLES[puzzleIdx].id); }
  modeTime = LEVELS[level].timer || 0;
  eventName = ""; eventT = 0; gravMul = 1; eventTimer = 25 + Math.random() * 15; rainT = 0;
  puzzleEndT = 0; puzzleOk = false; puzzleUsed = 0; zenToastT = 0;
  setPopMode(false);
  updatePowerUI();
  closeBook();
  closeTutorial(true);
  setPaused(false);
  playing = true;
  canDrop = true;
  cooldown = 0;
  dropCount = 0; fever = 0; feverT = 0; ordersMissed = 0; heldSp = null;
  held = randomLevel();
  rollNext();
  scoreEl.textContent = "0";
  bestEl.textContent = best;
  overlayEl.classList.add("hidden");
  boardOverlay.classList.add("hidden");
  paused = false;
  toastEl.classList.remove("show");
  drawNext();
}

function endGame() {
  playing = false;
  canDrop = false;
  store.set("best_" + activeBoard, best);
  if (LEVELS[level].daily) updateStreak();
  finalScoreEl.textContent = score;
  finalBestEl.textContent = best;
  const LM = LEVELS[level];
  overTitleEl.textContent = LM.puzzle ? (puzzleOk ? "Challenge cleared!" : "Challenge failed") : LM.timer ? "Time's Up!" : "Game Over";
  topBoxEl.classList.toggle("hidden", !!LM.puzzle);
  bestLineEl.classList.toggle("hidden", !!LM.puzzle);
  shareBtn.classList.toggle("hidden", !!LM.puzzle);
  const xpGain = LM.puzzle ? (puzzleOk ? 40 : 5) : Math.floor(score / 25) + ordersDone * 5;
  addXp(xpGain);
  missionEvent("game", 1); missionEvent("score", score);
  ordersDoneEl.textContent = LM.puzzle
    ? (puzzleOk ? "Stars: " + puzzleStarsFor(PUZZLES[puzzleIdx], puzzleUsed) + " / 3  (" + puzzleUsed + " drops)  +" + xpGain + " XP" : "Out of drops or the jar filled up. Try again!")
    : "Orders filled: " + ordersDone + "  |  +" + xpGain + " XP";
  gravMul = 1; eventName = ""; eventT = 0;
  stats.games++;
  stats.bestScore = Math.max(stats.bestScore, score);
  stats.topLevel = Math.max(stats.topLevel, topLevel);
  if (ordersDone >= 4 && ordersMissed === 0) unlock("perfect_day");
  if (score >= 500) unlock("score500");
  saveStats();
  newBestEl.classList.toggle("hidden", !(score > bestAtStart && score > 0));
  overlayEl.classList.remove("hidden");
  sfxOver();

  finalScore = score;
  if (score > 0 && !LM.puzzle && !LM.zen) addLocalScore(playerName || "Player", score);
  topTitle.textContent = (LM.local ? "Best on this device · " : "Top 10 · ") + LEVELS[level].label + (LEVELS[level].daily ? " " + dailyLabel() : "");
  autoSubmit();
  loadTop(topListEl, boardStatusEl, activeBoard);
}

// ---------------------------------------------------------------------
// LEADERBOARD  (online with Firebase, local scores as a backup)
// ---------------------------------------------------------------------
const LOCAL_TOP_SIZE = 5;

function getLocalTop(lv) {
  try {
    const list = JSON.parse(store.get("localTop_" + lv));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function addLocalScore(name, value) {
  const list = getLocalTop(activeBoard);
  const same = list.find((e) => String(e.name).toLowerCase() === String(name).toLowerCase());
  if (same) {
    if (value <= same.score) return;     // one entry per name: keep the best
    same.score = value;
  } else {
    list.push({ name: String(name).slice(0, 12), score: value });
  }
  list.sort((a, b) => b.score - a.score);
  store.set("localTop_" + activeBoard, JSON.stringify(list.slice(0, LOCAL_TOP_SIZE)));
}

// Names come from players, so they are always added as plain text.
function renderList(ol, items) {
  ol.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    if (playerName && String(item.name).toLowerCase() === playerName.toLowerCase()) li.className = "me";   // highlight your own row
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = item.name;
    const s = document.createElement("span");
    s.className = "s";
    s.textContent = item.score;
    li.appendChild(n);
    li.appendChild(s);
    ol.appendChild(li);
  });
}

async function loadTop(ol, statusEl, lv) {
  statusEl.textContent = "Loading...";
  const lb = window.Leaderboard;
  if (lb && lb.ready && !isLocalBoard(lv)) {
    try {
      const items = await lb.getTopScores(10, lv);
      if (ol === boardListEl && lv !== boardKey(boardLevel)) return;   // tab changed while loading
      renderList(ol, items);
      statusEl.textContent = items.length ? "" : "No scores yet. Be the first!";
      return;
    } catch (err) {
      /* fall through to the local scores below */
    }
  }
  if (ol === boardListEl && lv !== boardKey(boardLevel)) return;
  const local = getLocalTop(lv);
  renderList(ol, local);
  statusEl.textContent = isLocalBoard(lv)
    ? (local.length ? "Best scores on this device." : "No scores yet. Be the first!")
    : (local.length ? "Offline: showing the best scores on this device." : "The online leaderboard isn't available right now.");
}

function cleanName(raw) {
  return String(raw || "").replace(/[\u0000-\u001f<>\/\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
}

// The score is sent automatically when the game ends. If it fails,
// the player gets a "Try again" button.
async function autoSubmit() {
  submitted = false;
  submitBtn.classList.add("hidden");
  const lb = window.Leaderboard;
  const online = !!(lb && lb.ready) && !LEVELS[level].local;
  submitBox.classList.toggle("hidden", !(online && finalScore > 0));
  submitStatus.textContent = "";
  if (online && finalScore > 0) await sendScore();
}

async function sendScore() {
  if (submitted || playing) return;
  const lb = window.Leaderboard;
  if (!lb || !lb.ready) return;
  const lv = activeBoard, value = finalScore;
  submitBtn.classList.add("hidden");
  submitStatus.textContent = "Submitting your score...";
  try {
    const r = await lb.submitScore(playerName, value, lv);
    submitted = true;
    if (r && r.result === "kept") submitStatus.textContent = "Your best on this board is " + r.best + ". Beat it to move up!";
    else if (r && r.result === "improved") submitStatus.textContent = "New personal best! Your leaderboard score is updated.";
    else submitStatus.textContent = "You're on the leaderboard!";
    if (!playing && lv === activeBoard) loadTop(topListEl, boardStatusEl, lv);
  } catch (err) {
    submitBtn.classList.remove("hidden");
    const code = err && err.code;
    if (code === "bad-name") submitStatus.textContent = "That name isn't allowed. Go to the Menu and pick another.";
    else if (code === "too-soon") submitStatus.textContent = "Please wait a few seconds, then try again.";
    else submitStatus.textContent = "Couldn't submit. Check your connection and try again.";
  }
}

function setBoardLevel(lv) {
  boardLevel = lv;
  tabBtns.forEach((t) => t.classList.toggle("selected", t.dataset.level === lv));
  loadTop(boardListEl, boardOverlayStatus, boardKey(lv));
}

// The game is paused whenever one of these panels is open.
function syncPaused() {
  paused = [pauseOverlay, boardOverlay, bookOverlay, tutOverlay].some((el) => !el.classList.contains("hidden"));
}

function setPaused(on) {
  if (on && (!playing || !menuEl.classList.contains("hidden"))) return;
  pauseOverlay.classList.toggle("hidden", !on);
  syncPaused();
  on = !pauseOverlay.classList.contains("hidden");
  pauseBtn.innerHTML = '<svg class="ic"><use href="#' + (on ? "i-play" : "i-pause") + '"/></svg>';
  pauseBtn.setAttribute("aria-label", on ? "Resume" : "Pause");
  pauseBtn.title = on ? "Resume" : "Pause";
}

function togglePause() {
  if (anyPanelOpen()) return;
  setPaused(!pauseOverlay.classList.contains("hidden") ? false : true);
}

function openBoard() {
  if (!menuEl.classList.contains("hidden")) return;   // not while the start screen is open
  closeBook(); closeTutorial(true);
  if (!pauseOverlay.classList.contains("hidden")) setPaused(false);
  boardOverlay.classList.remove("hidden");
  syncPaused();
  setBoardLevel(level);
}

function closeBoard() {
  if (boardOverlay.classList.contains("hidden")) return;
  boardOverlay.classList.add("hidden");
  syncPaused();
}

function anyPanelOpen() {
  return [boardOverlay, bookOverlay, tutOverlay].some((el) => !el.classList.contains("hidden"));
}

// ---------------------------------------------------------------------
// COLLECTION BOOK  (every sweet you have made, saved on this device)
// ---------------------------------------------------------------------
function loadCollection() {
  try {
    const c = JSON.parse(store.get("collection"));
    if (c && Array.isArray(c.made)) {
      while (c.made.length < SWEETS.length) c.made.push(0);
      c.cakes = Number(c.cakes) || 0;
      return c;
    }
  } catch (e) { /* use the empty book below */ }
  return { made: SWEETS.map(() => 0), cakes: 0 };
}
let collection = loadCollection();
let selectedSweet = -1;

function saveCollection() { store.set("collection", JSON.stringify(collection)); }

// Called when a sweet is dropped or made by a merge.
function recordSweet(lv, announce) {
  const first = collection.made[lv] === 0;
  collection.made[lv]++;
  if (first) {
    saveCollection();
    if (announce) showToast("Collection: " + SWEETS[lv].name + " unlocked!");
  } else if (collection.made[lv] % 5 === 0) {
    saveCollection();
  }
}

function collectedCount() { return collection.made.filter((n) => n > 0).length; }

function showSweetDetail(i) {
  selectedSweet = i;
  Array.from(bookGrid.children).forEach((el, k) => el.classList.toggle("selected", k === i));
  if (collection.made[i] > 0) {
    const extra = i === LAST ? " Two cakes merged: " + collection.cakes + "." : "";
    bookDetail.textContent = (i + 1) + ". " + SWEETS[i].name + " - worth " + SWEETS[i].points + " points. Made " + collection.made[i] + (collection.made[i] === 1 ? " time." : " times.") + extra;
  } else if (i === 0) {
    bookDetail.textContent = "1. ??? - Drop your first sweet to unlock it.";
  } else {
    bookDetail.textContent = (i + 1) + ". ??? - Merge two " + SWEETS[i - 1].name + " sweets to unlock it.";
  }
}

function renderBook() {
  bookGrid.innerHTML = "";
  SWEETS.forEach((s, i) => {
    const unlocked = collection.made[i] > 0;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "book-item" + (unlocked ? "" : " locked");
    const img = document.createElement("img");
    img.src = s.image;
    img.alt = unlocked ? s.name : "Locked sweet";
    img.draggable = false;
    const num = document.createElement("span");
    num.textContent = i + 1;
    b.appendChild(img);
    b.appendChild(num);
    b.addEventListener("click", () => showSweetDetail(i));
    bookGrid.appendChild(b);
  });
  bookCount.textContent = collectedCount() + " / " + SWEETS.length;
  renderAchievements();
  showSweetDetail(selectedSweet >= 0 ? selectedSweet : Math.min(collectedCount(), LAST));
}

function openBook() {
  closeBoard(); closeTutorial(true);
  if (!pauseOverlay.classList.contains("hidden")) setPaused(false);
  renderBook();
  bookOverlay.classList.remove("hidden");
  syncPaused();
}

function closeBook() {
  if (bookOverlay.classList.contains("hidden")) return;
  bookOverlay.classList.add("hidden");
  syncPaused();
}

// ---------------------------------------------------------------------
// TUTORIAL  (shown the first time, and from the help button)
// ---------------------------------------------------------------------
let tutIndex = 0;

function showTutStep(i) {
  tutIndex = Math.max(0, Math.min(tutSteps.length - 1, i));
  tutSteps.forEach((el, k) => el.classList.toggle("hidden", k !== tutIndex));
  Array.from(tutDots.children).forEach((d, k) => d.classList.toggle("on", k === tutIndex));
  tutBack.classList.toggle("hidden", tutIndex === 0);
  const last = tutIndex === tutSteps.length - 1;
  tutNext.querySelector("span").textContent = last ? "Got it" : "Next";
}

function openTutorial() {
  closeBoard(); closeBook();
  if (!pauseOverlay.classList.contains("hidden")) setPaused(false);
  showTutStep(0);
  tutOverlay.classList.remove("hidden");
  syncPaused();
}

function closeTutorial(silent) {
  if (tutOverlay.classList.contains("hidden")) return;
  tutOverlay.classList.add("hidden");
  store.set("tutorialDone", "1");
  syncPaused();
}

tutSteps.forEach(() => { const d = document.createElement("i"); tutDots.appendChild(d); });

// Daily streak: how many days in a row you finished a daily challenge.
function prevDayKey() {
  const d = new Date(Date.now() - 86400000);
  return "" + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}

function streakNow() {
  const last = store.get("dailyLast");
  if (last === dailyKey() || last === prevDayKey()) return Number(store.get("streak")) || 0;
  return 0;
}

function updateStreak() {
  const today = dailyKey();
  const last = store.get("dailyLast");
  if (last === today) return;
  const n = last === prevDayKey() ? (Number(store.get("streak")) || 0) + 1 : 1;
  store.set("streak", n);
  store.set("dailyLast", today);
}

// ---------------------------------------------------------------------
// START SCREEN  (name + level)
// ---------------------------------------------------------------------
function selectLevel(lv) {
  level = lv;
  store.set("level", lv);
  levelBtns.forEach((b) => b.classList.toggle("selected", b.dataset.level === lv));
  menuBest.textContent = Number(store.get("best_" + boardKey(lv))) || 0;
  levelDescEl.textContent = LEVELS[lv].desc || "";
  refreshMenuLevel();
  menuDailySub.textContent = dailyLabel() + ": same sweets for everyone" + (streakNow() > 0 ? " · " + streakNow() + "-day streak" : "");
}

function showMenu() {
  if (level === "puzzle") level = LEVEL_KEYS.includes(store.get("level")) ? store.get("level") : "normal";
  puzzleOverlay.classList.add("hidden");
  resetOrders();
  playing = false;
  canDrop = false;
  setPaused(false);
  paused = false;
  overlayEl.classList.add("hidden");
  boardOverlay.classList.add("hidden");
  menuName.value = playerName || store.get("name") || "";
  menuStatus.textContent = "";
  selectLevel(level);
  menuEl.classList.remove("hidden");
}

function startClicked() {
  const name = cleanName(menuName.value);
  if (!name) {
    menuStatus.textContent = "Please type your name first.";
    menuName.focus();
    return;
  }
  const lb = window.Leaderboard;
  if (lb && lb.ready && lb.isNameOk && !lb.isNameOk(name)) {
    menuStatus.textContent = "Please choose a different name.";
    menuName.focus();
    return;
  }
  playerName = name;
  store.set("name", name);
  ensureAudio();
  newGame();
  if (store.get("tutorialDone") !== "1") openTutorial();   // first time only
}

// ---------------------------------------------------------------------
// POWER-UPS  (earned by scoring: swap, shake, pop)
// ---------------------------------------------------------------------
const POWER_NAMES = { swap: "Swap", shake: "Shake", pop: "Pop" };

function updatePowerUI() {
  Object.keys(powerBtns).forEach((k) => {
    const b = powerBtns[k];
    b.querySelector(".count").textContent = powers[k];
    b.disabled = powers[k] <= 0;
    b.classList.toggle("active", k === "pop" && popMode);
  });
}

function grantPower() {
  // give the one you have the fewest of, so you get a mix
  const open = Object.keys(powers).filter((k) => powers[k] < POWER_MAX);
  if (!open.length) return;
  const least = Math.min(...open.map((k) => powers[k]));
  const pool = open.filter((k) => powers[k] === least);
  const k = pool[Math.floor(Math.random() * pool.length)];
  powers[k]++;
  updatePowerUI();
  showToast("Power-up: " + POWER_NAMES[k] + " +1");
  sfxPower();
  const b = powerBtns[k];
  b.classList.remove("gain"); void b.offsetWidth; b.classList.add("gain");
}

function powerAllowed() {
  return playing && !paused && menuEl.classList.contains("hidden");
}

function setPopMode(on) {
  popMode = on;
  popHover = null;
  canvas.style.cursor = on ? "crosshair" : "";
  updatePowerUI();
}

function usePower(k) {
  if (!powerAllowed() || powers[k] <= 0) return;
  if (k === "swap") {
    const t = held; held = next; next = t;
    const ts = heldSp; heldSp = nextSp; nextSp = ts;
    drawNext();
    powers.swap--;
    flash = 0.2;
    sfxPower();
  } else if (k === "shake") {
    for (const b of bodies) {
      b.vy -= 200 + Math.random() * 120;
      b.vx += (Math.random() - 0.5) * 260;
      b.age = 0;                 // short protection from game over while they hop
    }
    shake = Math.max(shake, 10);
    powers.shake--;
    sfxShake();
  } else if (k === "pop") {
    if (popMode) { setPopMode(false); return; }
    if (!bodies.length) { showToast("Nothing to pop yet"); return; }
    setPopMode(true);
    return;
  }
  updatePowerUI();
}

function bodyAt(x, y) {
  let found = null;
  for (const b of bodies) {
    const dx = x - b.x, dy = y - b.y;
    if (dx * dx + dy * dy <= b.r * b.r && (!found || b.y > found.y)) found = b;   // lower one wins on overlap
  }
  return found;
}

function popBody(b) {
  b.dead = true;
  bodies = bodies.filter((o) => !o.dead);
  burst(b.x, b.y, 18 + b.level * 2, 1.1);
  floaters.push({ x: b.x, y: b.y, text: "Pop!", life: 0.8, max: 0.8 });
  shake = Math.max(shake, 3);
  powers.pop--;
  sfxPop();
  setPopMode(false);
}

// ---------------------------------------------------------------------
// PLAYER INPUT
// ---------------------------------------------------------------------
function clampX(x, r) {
  return Math.max(JAR.left + r, Math.min(JAR.right - r, x));
}

function dropSweet() {
  if (!playing || paused || !canDrop) return;
  if (LEVELS[level].puzzle && dropCount >= PUZZLES[puzzleIdx].drops) return;
  ensureAudio();
  const r = SWEETS[held].r;
  const b = makeBody(held, clampX(aimX, r), SPAWN_Y);
  b.vy = 60;
  b.vx = (Math.random() - 0.5) * 30;   // tiny sideways nudge so towers can't balance perfectly
  if (heldSp) { b.special = heldSp; if (heldSp === "bomb") b.fuse = BOMB_FUSE; }
  dropCount++;
  bodies.push(b);
  if (!heldSp) recordSweet(held, false);
  sfxDrop();
  canDrop = false;
  cooldown = DROP_COOLDOWN;
}

function pointerToGameX(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientX - rect.left) * (W / rect.width);
}

function pointerToGameY(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientY - rect.top) * (H / rect.height);
}

canvas.addEventListener("pointermove", (e) => {
  aimX = pointerToGameX(e);
  if (popMode) popHover = bodyAt(aimX, pointerToGameY(e));
});
canvas.addEventListener("pointerdown", (e) => {
  aimX = pointerToGameX(e);
  if (canvas.setPointerCapture) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
});
canvas.addEventListener("pointerup", (e) => {
  aimX = pointerToGameX(e);
  if (popMode) {
    const hit = bodyAt(aimX, pointerToGameY(e));
    if (hit && powerAllowed()) popBody(hit);
    return;
  }
  dropSweet();
});

window.addEventListener("pointerdown", ensureAudio);
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") { if (popMode) setPopMode(false); closeBoard(); closeBook(); closeTutorial(); return; }
  if (!(e.target && e.target.tagName === "INPUT") && menuEl.classList.contains("hidden")) {
    if (e.code === "Digit1") { usePower("swap"); return; }
    if (e.code === "Digit2") { usePower("shake"); return; }
    if (e.code === "Digit3") { usePower("pop"); return; }
  }
  if (e.code === "KeyP" && !(e.target && e.target.tagName === "INPUT")) { togglePause(); return; }
  // let the name box work normally (spaces and arrow keys are text editing)
  if (e.target && e.target.tagName === "INPUT") {
    if (e.code === "Enter" && e.target === menuName) startClicked();
    return;
  }
  if (!menuEl.classList.contains("hidden")) return;
  if (e.code === "ArrowLeft") { aimX -= 14; e.preventDefault(); }
  else if (e.code === "ArrowRight") { aimX += 14; e.preventDefault(); }
  else if ((e.code === "Space" || e.code === "ArrowDown") && !(e.target && e.target.tagName === "BUTTON")) {
    e.preventDefault();
    ensureAudio();
    dropSweet();
  }
});

muteBtn.addEventListener("click", () => {
  muted = !muted;
  store.set("muted", muted ? "1" : "0");
  updateMuteButton();
  if (!muted) ensureAudio();
});
// ---- Fullscreen button (hides the browser address bar on phones) ----
// Android and desktop use the Fullscreen API. iPhone Safari does not allow it,
// so there the button explains "Add to Home Screen", which opens the game fullscreen.
const fsBtn = document.getElementById("fs-btn");
const fsRoot = document.documentElement;
const fsRequest = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
const fsExit = document.exitFullscreen || document.webkitExitFullscreen;
const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
function fsActive() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function updateFsButton() {
  const on = fsActive();
  fsBtn.innerHTML = '<svg class="ic"><use href="#' + (on ? "i-shrink" : "i-expand") + '"/></svg>';
  fsBtn.setAttribute("aria-label", on ? "Exit fullscreen" : "Fullscreen");
  fsBtn.title = on ? "Exit fullscreen" : "Fullscreen";
  setTimeout(fitMainCanvas, 120);
}
if (isStandalone) {
  fsBtn.hidden = true;                      // already opened as an app, nothing to hide
} else {
  fsBtn.addEventListener("click", () => {
    if (!fsRequest) {
      showToast("iPhone: tap Share, then Add to Home Screen, to play fullscreen", 4200);
      return;
    }
    if (fsActive()) {
      if (fsExit) fsExit.call(document);
    } else {
      const res = fsRequest.call(fsRoot, { navigationUI: "hide" });
      if (res && res.catch) res.catch(() => showToast("Fullscreen is not allowed here"));
    }
  });
  document.addEventListener("fullscreenchange", updateFsButton);
  document.addEventListener("webkitfullscreenchange", updateFsButton);
}

restartBtn.addEventListener("click", () => { if (playerName && menuEl.classList.contains("hidden")) newGame(); });
playAgainBtn.addEventListener("click", newGame);
shareBtn.addEventListener("click", shareScore);
document.getElementById("profile-btn").addEventListener("click", openProfile);
document.getElementById("puzzle-open").addEventListener("click", openPuzzles);
document.getElementById("puzzle-close").addEventListener("click", () => puzzleOverlay.classList.add("hidden"));
document.getElementById("profile-close").addEventListener("click", closeProfile);
document.querySelectorAll(".music-toggle").forEach((b) => b.addEventListener("click", toggleMusic));
submitBtn.addEventListener("click", sendScore);
startBtn.addEventListener("click", startClicked);
menuBtn.addEventListener("click", showMenu);
goMenuBtn.addEventListener("click", showMenu);
levelBtns.forEach((b) => b.addEventListener("click", () => selectLevel(b.dataset.level)));
tabBtns.forEach((t) => t.addEventListener("click", () => setBoardLevel(t.dataset.level)));
boardBtn.addEventListener("click", openBoard);
pauseBtn.addEventListener("click", togglePause);
Object.keys(powerBtns).forEach((k) => powerBtns[k].addEventListener("click", () => usePower(k)));
bookBtn.addEventListener("click", openBook);
bookClose.addEventListener("click", closeBook);
helpBtn.addEventListener("click", openTutorial);
tutBack.addEventListener("click", () => showTutStep(tutIndex - 1));
tutNext.addEventListener("click", () => {
  if (tutIndex >= tutSteps.length - 1) closeTutorial(); else showTutStep(tutIndex + 1);
});
resumeBtn.addEventListener("click", () => setPaused(false));
pauseMenuBtn.addEventListener("click", showMenu);
pauseRestartBtn.addEventListener("click", () => { if (playerName) newGame(); });
boardCloseBtn.addEventListener("click", closeBoard);
document.addEventListener("visibilitychange", () => {
  if (playing) store.set("best_" + activeBoard, best);
  if (document.hidden && playing && !anyPanelOpen()) setPaused(true);   // pause when you leave the tab
});

// ---------------------------------------------------------------------
// EFFECTS
// ---------------------------------------------------------------------
function burst(x, y, count, power) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (80 + Math.random() * 180) * power;
    const life = 0.5 + Math.random() * 0.5;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life, max: life,
      size: 3 + Math.random() * 5,
      color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]
    });
  }
}

function drawStar(c, x, y, size, color) {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = i * Math.PI / 4 - Math.PI / 2;
    const rad = (i % 2 === 0) ? size : size * 0.35;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}

// ---------------------------------------------------------------------
// PHYSICS  (simple circle physics)
// ---------------------------------------------------------------------
function constrainWalls(b) {
  if (b.x - b.r < JAR.left) {
    b.x = JAR.left + b.r;
    if (b.vx < 0) b.vx = -b.vx * RESTITUTION;
  }
  if (b.x + b.r > JAR.right) {
    b.x = JAR.right - b.r;
    if (b.vx > 0) b.vx = -b.vx * RESTITUTION;
  }
  if (b.y + b.r > JAR.floor) {
    b.y = JAR.floor - b.r;
    if (b.vy > 0) b.vy = -b.vy * RESTITUTION;
    if (Math.abs(b.vy) < 12) b.vy = 0;
    b.vx *= 0.985;
  }
}

function resolvePair(a, b, dx, dy, dist, minDist) {
  const nx = dx / dist;
  const ny = dy / dist;
  const ia = 1 / a.m;
  const ib = 1 / b.m;
  const sum = ia + ib;

  // push the circles apart
  const corr = ((minDist - dist) / sum) * 0.6;
  a.x -= nx * corr * ia; a.y -= ny * corr * ia;
  b.x += nx * corr * ib; b.y += ny * corr * ib;

  // bounce / slide
  let rvx = b.vx - a.vx;
  let rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const j = (-(1 + RESTITUTION) * vn) / sum;
    a.vx -= j * ia * nx; a.vy -= j * ia * ny;
    b.vx += j * ib * nx; b.vy += j * ib * ny;

    rvx = b.vx - a.vx;
    rvy = b.vy - a.vy;
    const tx = -ny;
    const ty = nx;
    const vt = rvx * tx + rvy * ty;
    const maxF = FRICTION * j;
    const jt = Math.max(-maxF, Math.min(maxF, -vt / sum));
    a.vx -= jt * ia * tx; a.vy -= jt * ia * ty;
    b.vx += jt * ib * tx; b.vy += jt * ib * ty;
  }
}

function physicsStep(h) {
  // move
  for (const b of bodies) {
    b.vy += GRAVITY * gravMul * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.age += h;
    // little rolling wiggle that settles back upright
    b.angle += (b.vx / b.r) * h * 0.5;
    b.angle -= b.angle * Math.min(1, 3 * h);
  }

  // collisions (two passes keeps stacks steady)
  const merges = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.merging) continue;
      for (let k = i + 1; k < bodies.length; k++) {
        const b = bodies[k];
        if (b.merging) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;

        if (a.level === b.level && a.special !== "bomb" && b.special !== "bomb") {
          a.merging = true;
          b.merging = true;
          merges.push([a, b]);
          break;
        }
        resolvePair(a, b, dx, dy, Math.sqrt(d2) || 0.0001, minDist);
      }
    }
    for (const b of bodies) constrainWalls(b);
  }

  if (merges.length) {
    for (const [a, b] of merges) mergePair(a, b);
    bodies = bodies.filter((b) => !b.dead);
  }
}

function mergePair(a, b) {
  a.dead = true;
  b.dead = true;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;

  // combo: merges that follow each other quickly give a score multiplier
  combo = comboTimer > 0 ? combo + 1 : 1;
  comboTimer = COMBO_WINDOW;
  const mult = Math.min(combo, COMBO_MAX);
  const fm = feverT > 0 ? 2 : 1;
  const gold = a.special === "golden" || b.special === "golden";
  if (combo >= COMBO_MAX) unlock("combo5");
  stats.merges++;
  missionEvent("merge", 1); missionEvent("combo", combo); missionEvent("level", a.level + 1);
  if (combo > stats.maxCombo) stats.maxCombo = combo;
  if (feverT <= 0 && !modeCfg().plain) {
    fever = Math.min(100, fever + 9 + 3 * mult);
    if (fever >= 100) startFever();
  }
  if (combo >= 2) {
    comboShow.text = "COMBO x" + mult;
    comboShow.life = 1.2;
  }

  if (a.level === LAST) {
    addScore(MAX_BONUS);
    collection.cakes++;
    saveCollection();
    shake = Math.max(shake, 14);
    flash = 0.6;
    burst(x, y, 44, 1.5);
    floaters.push({ x, y, text: "+" + MAX_BONUS * fm, life: 1.2, max: 1.2 });
    unlock("cake");
    showToast("Two Birthday Cakes! +" + MAX_BONUS);
    sfxMerge(LAST);
    return;
  }

  const level = a.level + 1;
  const nb = makeBody(level, x, y);
  // keep the bigger sweet inside the jar right away
  nb.x = clampX(nb.x, nb.r);
  nb.y = Math.min(nb.y, JAR.floor - nb.r);
  nb.vx = (a.vx + b.vx) / 2;
  nb.vy = (a.vy + b.vy) / 2;
  nb.pop = 0.3;
  nb.happy = 0.7;
  bodies.push(nb);

  const pts = SWEETS[level].points * mult;
  addScore(pts);
  recordSweet(level, false);
  orderMade(level);
  if (level >= 5) shake = Math.max(shake, 3 + (level - 5) * 1.6);
  burst(x, y, 10 + level * 3, 1 + level * 0.08);
  floaters.push({ x, y: y - SWEETS[level].r * 0.4, text: "+" + pts * fm, life: 0.9, max: 0.9 });
  if (gold) {
    orderMade(level);                 // Golden Mochi counts twice for orders
    addScore(20);
    floaters.push({ x, y: y - SWEETS[level].r - 14, text: "Golden! +" + 20 * fm, life: 1.2, max: 1.2 });
    burst(x, y, 24, 1.3);
    stats.golden++; unlock("golden"); missionEvent("golden", 1);
  }
  if (collectedCount() >= SWEETS.length) unlock("tooth");
  sfxMerge(Math.min(LAST, level + (mult - 1)));

  if (level > topLevel) {
    topLevel = level;
    if (level >= 4) { showToast("New sweet: " + SWEETS[level].name + "!"); flash = 0.35; }
  }
  if (collection.made[level] === 1) {     // first time ever, saved in the collection book
    showToast("Collection: " + SWEETS[level].name + " unlocked!");
    saveCollection();
  }
}

// ---------------------------------------------------------------------
// FEVER MODE + SPECIAL SWEETS
// ---------------------------------------------------------------------
function startFever() {
  fever = 100;
  feverT = FEVER_TIME;
  flash = 0.5;
  shake = Math.max(shake, 8);
  showToast("FEVER MODE! Double points!");
  sfxPower();
  stats.fever++; unlock("fever"); missionEvent("fever", 1);
}

function endFever() {
  feverT = 0;
  fever = 0;
  // sweets that were above the line during Fever pop away so you are not punished unfairly
  let pops = 0;
  for (const b of bodies) {
    if (b.y - b.r < JAR.limit) {
      b.dead = true; pops++;
      burst(b.x, b.y, 12, 1.1);
      addScore(SWEETS[b.level].points + 1);
    }
  }
  bodies = bodies.filter((b) => !b.dead);
  if (pops) showToast("Fever over: top sweets popped!");
}

function explodeBomb(bm) {
  bm.dead = true;
  let n = 0, pts = 0;
  for (const o of bodies) {
    if (o === bm || o.dead) continue;
    if (Math.hypot(o.x - bm.x, o.y - bm.y) - o.r < 80) {
      o.dead = true; n++;
      pts += SWEETS[o.level].points + 1;
      burst(o.x, o.y, 10, 1);
    }
  }
  burst(bm.x, bm.y, 36, 1.6);
  shake = Math.max(shake, 16);
  flash = Math.max(flash, 0.45);
  sfxPop();
  if (pts) addScore(pts);
  floaters.push({ x: bm.x, y: bm.y - 20, text: n ? "BOOM +" + pts * (feverT > 0 ? 2 : 1) : "Fizzle", life: 1.2, max: 1.2 });
  showToast(n ? "Bomb Candy popped " + n + " sweets!" : "Bomb Candy fizzled");
  stats.bombs++; missionEvent("bomb", n);
  if (n >= 4) unlock("boom");
}

function drawModeHud() {
  const L = LEVELS[level];
  ctx.save();
  ctx.font = "900 13px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle"; ctx.lineJoin = "round"; ctx.lineWidth = 4;
  const label = (txt, x, y, align, fill, stroke) => {
    ctx.textAlign = align; ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  };
  if (L.timer) {
    const t = Math.ceil(modeTime), low = t <= 10;
    ctx.font = "900 18px 'Trebuchet MS', 'Segoe UI', sans-serif";
    label(Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"), W - 12, 17, "right", low ? "#fff" : "#fff6a8", low ? "#e0245e" : "#7a2f66");
  }
  if (L.puzzle) {
    const p = PUZZLES[puzzleIdx];
    label("Goal: " + SWEETS[p.level].name, 12, 15, "left", "#fff", "#7a2f66");
    label("Drops left: " + Math.max(0, p.drops - dropCount), 12, 33, "left", "#fff6a8", "#7a2f66");
  }
  if (eventT > 0) {
    const name = eventName === "sugar" ? "SUGAR RUSH" : "SWEET RAIN";
    ctx.font = "900 15px 'Trebuchet MS', 'Segoe UI', sans-serif";
    label(name + "  " + Math.ceil(eventT) + "s", W / 2, 44, "center", "#fff", eventName === "sugar" ? "#d9407b" : "#3a8fd1");
  }
  ctx.restore();
}

function drawFever() {
  if (LEVELS[level].plain) return;
  const bx = 10, by = 8, bw = 130, bh = 12;
  const f = feverT > 0 ? feverT / FEVER_TIME : fever / 100;
  ctx.save();
  ctx.fillStyle = "rgba(60, 25, 70, 0.55)";
  ctx.fillRect(bx, by, bw, bh);
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  if (feverT > 0) { g.addColorStop(0, "#ffd770"); g.addColorStop(1, "#ff7ab0"); }
  else { g.addColorStop(0, "#ff9ec6"); g.addColorStop(1, "#ffcf5a"); }
  ctx.fillStyle = g;
  ctx.fillRect(bx, by, bw * f, bh);
  ctx.lineWidth = 2; ctx.strokeStyle = feverT > 0 ? "#fff3b0" : "rgba(255,255,255,0.8)";
  ctx.strokeRect(bx, by, bw, bh);
  ctx.font = "900 11px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.lineWidth = 3; ctx.strokeStyle = "#7a2f66"; ctx.lineJoin = "round";
  const label = feverT > 0 ? "FEVER x2  " + Math.ceil(feverT) + "s" : "FEVER";
  ctx.strokeText(label, bx + bw + 7, by + bh / 2 + 1);
  ctx.fillStyle = feverT > 0 ? "#ffe27a" : "#fff";
  ctx.fillText(label, bx + bw + 7, by + bh / 2 + 1);
  if (feverT > 0) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255, 205, 70, " + (0.35 + 0.25 * Math.sin(time * 12)) + ")";
    ctx.strokeRect(4, 4, W - 8, H - 8);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// RANDOM EVENTS  (Sugar Rush, Sweet Rain, Boss Order)
// ---------------------------------------------------------------------
function updateEvents(dt) {
  if (LEVELS[level].puzzle) return;
  if (eventT > 0) {
    eventT -= dt;
    if (eventName === "rain") {
      rainT -= dt;
      if (rainT <= 0) { rainT = 1.1; if (bodies.length < 45) dropRain(); }
    }
    if (eventT <= 0) endEvent();
    return;
  }
  eventTimer -= dt;
  if (eventTimer <= 0) startEvent();
}

function startEvent() {
  const r = Math.random();
  eventTimer = 35 + Math.random() * 20;
  if (r < 0.34) {
    eventName = "sugar"; eventT = 10; gravMul = 0.5;
    showToast("SUGAR RUSH! Sweets fall slowly");
  } else if (r < 0.67) {
    eventName = "rain"; eventT = 8; rainT = 0.5;
    showToast("SWEET RAIN! Get ready to merge");
  } else {
    spawnOrder(true);
    showToast("BOSS ORDER! Big reward");
  }
  sfxPower();
}

function endEvent() { eventName = ""; eventT = 0; gravMul = 1; }

function dropRain() {
  const lv = Math.random() < 0.6 ? 0 : 1;
  const r = SWEETS[lv].r;
  const b = makeBody(lv, JAR.left + r + Math.random() * (JAR.right - JAR.left - 2 * r), SPAWN_Y - 10);
  b.vy = 80;
  bodies.push(b);
}

// ---------------------------------------------------------------------
// PUZZLE CHALLENGES
// ---------------------------------------------------------------------
function loadPuzzleStars() { return loadJSON("puzzleStars", {}); }

function checkPuzzle(dt) {
  if (!LEVELS[level].puzzle || !playing) return;
  const p = PUZZLES[puzzleIdx];
  if (topLevel >= p.level) { puzzleFinish(true); return; }
  if (dropCount >= p.drops) {
    puzzleEndT += dt;
    if (puzzleEndT > 5) puzzleFinish(false);
  }
}

function puzzleFinish(ok) {
  const p = PUZZLES[puzzleIdx];
  puzzleOk = ok;
  puzzleUsed = dropCount;
  if (ok) {
    const stars = puzzleStarsFor(p, dropCount);
    const saved = loadPuzzleStars();
    if ((saved[p.id] || 0) < stars) { saved[p.id] = stars; store.set("puzzleStars", JSON.stringify(saved)); }
    unlock("puzzle");
  }
  endGame();
}

function renderPuzzleList() {
  const saved = loadPuzzleStars();
  puzzleListEl.innerHTML = "";
  PUZZLES.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "puzzle-item";
    const n = saved[p.id] || 0;
    b.innerHTML = '<span class="pz-num"></span><span class="pz-text"><b></b><small></small></span><span class="pz-stars"></span>';
    b.querySelector(".pz-num").textContent = p.id;
    b.querySelector("b").textContent = p.name;
    b.querySelector("small").textContent = "Make a " + SWEETS[p.level].name + " in " + p.drops + " drops";
    b.querySelector(".pz-stars").innerHTML = [1, 2, 3].map((k) => '<svg class="ic' + (k <= n ? " on" : "") + '"><use href="#i-star"/></svg>').join("");
    b.addEventListener("click", () => startPuzzle(i));
    puzzleListEl.appendChild(b);
  });
}

function openPuzzles() { renderPuzzleList(); puzzleOverlay.classList.remove("hidden"); }

function startPuzzle(i) {
  const name = cleanName(menuName.value);
  playerName = name || playerName || "Player";
  puzzleIdx = i;
  level = "puzzle";
  newGame();
}

// ---------------------------------------------------------------------
// DAILY MISSIONS + XP LEVELS  (missions reset every day, saved in the browser)
// ---------------------------------------------------------------------
const MISSION_POOL = [
  { id: "merge",   ev: "merge",  kind: "add", target: 40,  text: "Merge 40 sweets" },
  { id: "orders",  ev: "order",  kind: "add", target: 3,   text: "Fill 3 orders" },
  { id: "cupcake", ev: "level",  kind: "max", target: 5,   text: "Make a Cupcake" },
  { id: "combo",   ev: "combo",  kind: "max", target: 3,   text: "Reach a x3 combo" },
  { id: "score",   ev: "score",  kind: "max", target: 300, text: "Score 300 in one game" },
  { id: "fever",   ev: "fever",  kind: "add", target: 1,   text: "Start Fever Mode" },
  { id: "golden",  ev: "golden", kind: "add", target: 1,   text: "Merge a Golden Mochi" },
  { id: "bomb",    ev: "bomb",   kind: "add", target: 3,   text: "Pop 3 sweets with a Bomb Candy" },
  { id: "games",   ev: "game",   kind: "add", target: 3,   text: "Play 3 games" }
];
const MISSION_XP = 60;
let progress = Object.assign({ xp: 0, day: "", missions: [] }, loadJSON("progress", {}));

function todayKey() {
  const d = new Date();
  return "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}
function saveProgress() { store.set("progress", JSON.stringify(progress)); }

function ensureMissions() {
  const today = todayKey();
  if (progress.day === today && progress.missions.length === 3) return;
  const rng = seededRng("missions-" + today);
  const pool = MISSION_POOL.slice();
  const list = [];
  while (list.length < 3) {
    const m = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    list.push({ id: m.id, progress: 0, done: false });
  }
  progress.day = today;
  progress.missions = list;
  saveProgress();
}

function levelInfo(xp) {
  let lv = 1, need = 100;
  while (xp >= need) { xp -= need; lv++; need += 50; }
  return { lv, cur: xp, need };
}

function addXp(n) {
  if (n <= 0) return;
  const before = levelInfo(progress.xp).lv;
  progress.xp += n;
  saveProgress();
  const after = levelInfo(progress.xp).lv;
  if (after > before) setTimeout(() => showToast("Level up! You are level " + after), 1500);
}

function missionEvent(ev, value) {
  ensureMissions();
  let changed = false;
  progress.missions.forEach((m) => {
    if (m.done) return;
    const def = MISSION_POOL.find((d) => d.id === m.id);
    if (!def || def.ev !== ev) return;
    m.progress = def.kind === "add" ? m.progress + value : Math.max(m.progress, value);
    changed = true;
    if (m.progress >= def.target) {
      m.progress = def.target;
      m.done = true;
      addXp(MISSION_XP);
      showToast("Mission complete: " + def.text + "! +" + MISSION_XP + " XP");
      if (progress.missions.every((x) => x.done)) { unlock("grind"); }
    }
  });
  if (changed) saveProgress();
}

function renderMissions() {
  ensureMissions();
  missionListEl.innerHTML = "";
  let doneN = 0;
  progress.missions.forEach((m) => {
    const def = MISSION_POOL.find((d) => d.id === m.id);
    if (m.done) doneN++;
    const el = document.createElement("div");
    el.className = "mission" + (m.done ? " done" : "");
    el.innerHTML = '<div class="m-top"><b></b><span></span></div><div class="m-bar"><i></i></div>';
    el.querySelector("b").textContent = def.text;
    el.querySelector("span").textContent = m.done ? "Done +" + MISSION_XP + " XP" : m.progress + " / " + def.target;
    el.querySelector("i").style.width = Math.min(100, (m.progress / def.target) * 100) + "%";
    missionListEl.appendChild(el);
  });
  missionCountEl.textContent = doneN + " / 3";
  const li = levelInfo(progress.xp);
  xpLevelEl.textContent = "Lv " + li.lv;
  xpFillEl.style.width = (li.cur / li.need) * 100 + "%";
  xpTextEl.textContent = li.cur + " / " + li.need + " XP";
}

function refreshMenuLevel() {
  menuLevelEl.textContent = "Lv " + levelInfo(progress.xp).lv + " · " + currentTitle();
}

// ---------------------------------------------------------------------
// ACHIEVEMENTS + TITLES  (saved in localStorage, shown in the collection book)
// ---------------------------------------------------------------------
const ACHIEVEMENTS = [
  { id: "first_order",  name: "First Customer", desc: "Fill your first order." },
  { id: "master_baker", name: "Master Baker",   desc: "Fill 15 orders in total." },
  { id: "perfect_day",  name: "Perfect Day",    desc: "Finish a game with 4+ orders filled and none missed." },
  { id: "fever",        name: "Fever Pitch",    desc: "Start Fever Mode." },
  { id: "boom",         name: "Boom!",          desc: "Pop 4 or more sweets with one Bomb Candy." },
  { id: "golden",       name: "Golden Touch",   desc: "Merge a Golden Mochi." },
  { id: "combo5",       name: "Combo King",     desc: "Reach a x5 combo." },
  { id: "cake",         name: "Cake Boss",      desc: "Merge two Birthday Cakes." },
  { id: "tooth",        name: "Sweet Tooth",    desc: "Unlock every sweet in the collection." },
  { id: "score500",     name: "Half Thousand",  desc: "Score 500 points in one game." },
  { id: "boss",         name: "Boss Slayer",    desc: "Fill a Boss Order." },
  { id: "puzzle",       name: "Puzzle Solver",  desc: "Clear a puzzle challenge." },
  { id: "grind",        name: "Daily Grind",    desc: "Finish all 3 daily missions in one day." }
];
const TITLES = ["Apprentice", "Home Baker", "Pastry Chef", "Head Chef", "Sweet Legend", "Grand Master"];

function loadJSON(key, fallback) {
  try { const v = JSON.parse(store.get(key)); if (v && typeof v === "object") return v; } catch (e) { /* ignore */ }
  return fallback;
}
let stats = Object.assign({ games: 0, merges: 0, orders: 0, fever: 0, golden: 0, bombs: 0, maxCombo: 0, seconds: 0, bestScore: 0, topLevel: 0 }, loadJSON("stats", {}));
let earned = loadJSON("achievements", {});

window.addEventListener("pagehide", () => { saveStats(); });
function saveStats() { store.set("stats", JSON.stringify(stats)); }

function unlock(id) {
  if (earned[id]) return;
  earned[id] = 1;
  store.set("achievements", JSON.stringify(earned));
  saveStats();
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) showToast("Achievement: " + a.name + "!");
  const nt = THEMES.find((t) => t.need === achievementCount() && t.need > 0);
  if (nt) setTimeout(() => showToast("New jar theme: " + nt.name + "!"), 1800);
}

function achievementCount() { return ACHIEVEMENTS.filter((a) => earned[a.id]).length; }

function currentTitle() {
  const n = achievementCount();
  if (n >= ACHIEVEMENTS.length) return TITLES[5];
  return TITLES[Math.min(4, Math.floor(n / 2))];
}

function renderAchievements() {
  achListEl.innerHTML = "";
  ACHIEVEMENTS.forEach((a) => {
    const got = !!earned[a.id];
    const el = document.createElement("div");
    el.className = "ach" + (got ? " got" : "");
    el.innerHTML = '<svg class="ic"><use href="#i-star"/></svg><div><b></b><small></small></div>';
    el.querySelector("b").textContent = a.name;
    el.querySelector("small").textContent = a.desc;
    achListEl.appendChild(el);
  });
  achCountEl.textContent = achievementCount() + " / " + ACHIEVEMENTS.length;
  titleEl.textContent = currentTitle();
}

// ---------------------------------------------------------------------
// JAR THEMES  (unlocked with achievements)
// ---------------------------------------------------------------------
const THEMES = [
  { id: "classic", name: "Classic Pink", need: 0, rim: "rgba(255, 150, 185, 0.95)", glass: "rgba(255, 255, 255, 0.4)", sw: ["#ff9cc2", "#fff6fb"] },
  { id: "mint",    name: "Mint Soda",    need: 2, rim: "rgba(70, 190, 150, 0.95)",  glass: "rgba(240, 255, 250, 0.45)", sw: ["#5fd3a8", "#f2fffa"] },
  { id: "sunset",  name: "Sunset",       need: 4, rim: "rgba(255, 140, 80, 0.95)",  glass: "rgba(255, 246, 232, 0.45)", sw: ["#ff8f66", "#fff3e3"] },
  { id: "ube",     name: "Ube Night",    need: 6, rim: "rgba(150, 120, 220, 0.95)", glass: "rgba(235, 225, 255, 0.35)", sw: ["#8a68c8", "#efe6ff"] },
  { id: "gold",    name: "Golden Hour",  need: 8, rim: "rgba(235, 180, 50, 0.95)",  glass: "rgba(255, 251, 225, 0.5)",  sw: ["#f5b93a", "#fffbe6"] }
];
let themeId = store.get("theme") || "classic";

function themeUnlocked(t) { return achievementCount() >= t.need; }
function currentTheme() {
  const t = THEMES.find((x) => x.id === themeId) || THEMES[0];
  return themeUnlocked(t) ? t : THEMES[0];
}
function applyTheme() { stageEl.dataset.theme = currentTheme().id; }

function renderThemes() {
  themeListEl.innerHTML = "";
  THEMES.forEach((t) => {
    const ok = themeUnlocked(t);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-chip" + (currentTheme() === t ? " on" : "") + (ok ? "" : " locked");
    b.innerHTML = '<i></i><span></span>';
    b.querySelector("i").style.background = "linear-gradient(135deg," + t.sw[0] + "," + t.sw[1] + ")";
    b.querySelector("span").textContent = ok ? t.name : t.name + " (" + t.need + " achievements)";
    b.addEventListener("click", () => {
      if (!ok) { showToast("Unlock " + t.need + " achievements first"); return; }
      themeId = t.id;
      store.set("theme", t.id);
      applyTheme();
      renderThemes();
    });
    themeListEl.appendChild(b);
  });
}

// ---------------------------------------------------------------------
// PROFILE / STATS  (opened from the main menu)
// ---------------------------------------------------------------------
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m " + Math.floor(sec % 60) + "s";
}

function renderProfile() {
  const favIdx = collection.made.indexOf(Math.max.apply(null, collection.made));
  const rows = [
    ["Games played", stats.games],
    ["Play time", fmtTime(stats.seconds)],
    ["Best score", stats.bestScore],
    ["Biggest sweet", SWEETS[Math.min(LAST, stats.topLevel)].name],
    ["Total merges", stats.merges],
    ["Orders filled", stats.orders],
    ["Best combo", "x" + stats.maxCombo],
    ["Fever modes", stats.fever],
    ["Golden merges", stats.golden],
    ["Bombs used", stats.bombs],
    ["Sweets unlocked", collectedCount() + " / " + SWEETS.length],
    ["Most made", collection.made[favIdx] > 0 ? SWEETS[favIdx].name : "-"]
  ];
  statGridEl.innerHTML = "";
  rows.forEach((r) => {
    const el = document.createElement("div");
    el.className = "stat-cell";
    el.innerHTML = "<small></small><b></b>";
    el.querySelector("small").textContent = r[0];
    el.querySelector("b").textContent = r[1];
    statGridEl.appendChild(el);
  });
  renderMissions();
  profileTitleEl.textContent = currentTitle() + "  (" + achievementCount() + " / " + ACHIEVEMENTS.length + " achievements)";
  renderThemes();
  updateMusicButtons();
}

function openProfile() { saveStats(); renderProfile(); profileOverlay.classList.remove("hidden"); }
function closeProfile() { profileOverlay.classList.add("hidden"); }

function updateMusicButtons() {
  document.querySelectorAll(".music-toggle span").forEach((el) => { el.textContent = "Music: " + (musicOn ? "On" : "Off"); });
}
function toggleMusic() {
  musicOn = !musicOn;
  store.set("music", musicOn ? "1" : "0");
  updateMusicButtons();
  if (musicOn) ensureAudio();
}

// ---------------------------------------------------------------------
// SHARE SCORE CARD  (makes a picture you can send or save)
// ---------------------------------------------------------------------
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function makeShareCanvas(withImage) {
  const cv = document.createElement("canvas");
  cv.width = 600; cv.height = 800;
  const c = cv.getContext("2d");
  const th = currentTheme();
  const g = c.createLinearGradient(0, 0, 0, 800);
  g.addColorStop(0, th.sw[0]); g.addColorStop(1, "#ffe6f1");
  c.fillStyle = g; c.fillRect(0, 0, 600, 800);
  for (let i = 0; i < 26; i++) drawStar(c, (i * 97) % 600, (i * 151) % 800, 5 + (i % 4) * 2, "rgba(255,255,255,0.55)");
  c.fillStyle = "#fffafc";
  roundRectPath(c, 40, 50, 520, 700, 36); c.fill();
  c.lineWidth = 8; c.strokeStyle = th.sw[0]; c.stroke();
  c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.font = "900 54px 'Trebuchet MS', 'Segoe UI', sans-serif";
  c.lineWidth = 10; c.strokeStyle = "#d9407b"; c.strokeText("Sweets Merge", 300, 115);
  c.fillStyle = "#fff"; c.fillText("Sweets Merge", 300, 115);
  c.font = "700 24px 'Trebuchet MS', sans-serif"; c.fillStyle = "#7a4d78";
  c.fillText(LEVELS[level].label + " level", 300, 170);
  const s = SWEETS[Math.min(LAST, topLevel)];
  if (withImage && s.imgOk) c.drawImage(s.img, 190, 205, 220, 220);
  c.font = "700 26px 'Trebuchet MS', sans-serif"; c.fillStyle = "#d9407b";
  c.fillText("SCORE", 300, 470);
  c.font = "900 120px 'Trebuchet MS', sans-serif"; c.fillStyle = "#4a2a5a";
  c.fillText(String(score), 300, 550);
  c.font = "700 26px 'Trebuchet MS', sans-serif"; c.fillStyle = "#7a4d78";
  c.fillText("Biggest sweet: " + s.name, 300, 625);
  c.fillText("Orders filled: " + ordersDone + "   |   Title: " + currentTitle(), 300, 665);
  c.font = "600 20px 'Trebuchet MS', sans-serif"; c.fillStyle = "#b08ab0";
  c.fillText(location.host ? location.host + location.pathname.replace(/index\.html$/, "") : "Sweets Merge", 300, 715);
  return cv;
}

function shareScore() {
  let cv;
  try { cv = makeShareCanvas(true); cv.toDataURL(); }          // throws if the pictures taint the canvas
  catch (e) { cv = makeShareCanvas(false); }
  cv.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], "sweets-merge-score.png", { type: "image/png" });
    const done = () => {
      shareBtn.querySelector("span").textContent = "Saved!";
      setTimeout(() => { shareBtn.querySelector("span").textContent = "Share score card"; }, 1800);
    };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Sweets Merge", text: "I scored " + score + " in Sweets Merge!" }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sweets-merge-score.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      done();
    }
  }, "image/png");
}

// ---------------------------------------------------------------------
// BAKERY ORDERS  (customers ask for a sweet; make it by merging before time runs out)
// ---------------------------------------------------------------------
function resetOrders() {
  orders = [];
  ordersDone = 0;
  orderTimer = ORDER_FIRST_DELAY;
  orderListEl.innerHTML = "";
  updateOrdersEmpty();
}

function updateOrdersEmpty() {
  orderListEl.classList.toggle("empty", orders.length === 0);
}

// Pick a sweet that is hard enough to be interesting but still possible.
function pickOrderTarget() {
  const lo = Math.max(1, topLevel - 2);
  const hi = Math.min(LAST - 2, Math.max(2, topLevel + 1));
  const target = lo + Math.floor(orderRng() * (hi - lo + 1));
  const need = target >= 5 ? 1 : (target >= 3 ? 1 + Math.floor(orderRng() * 2) : 2 + Math.floor(orderRng() * 2));
  return { target, need };
}

function spawnOrder(boss) {
  const cfg = LEVELS[level].orders;
  let target, need;
  if (boss) { target = Math.max(2, Math.min(LAST - 2, topLevel)); need = target >= 5 ? 2 : 3; }
  else ({ target, need } = pickOrderTarget());
  const seconds = (50 + target * 8 + need * 12) * (cfg.time || 1) * (boss ? 1.4 : 1);
  const o = { id: ++orderId, level: target, need, have: 0, time: seconds, max: seconds, boss: !!boss };

  const el = document.createElement("div");
  el.className = "ticket" + (boss ? " boss" : "");
  const img = document.createElement("img");
  img.src = SWEETS[target].image;
  img.alt = SWEETS[target].name;
  img.draggable = false;
  const txt = document.createElement("div");
  txt.className = "t-text";
  const nm = document.createElement("span");
  nm.className = "t-name";
  nm.textContent = (boss ? "Boss: " : "") + SWEETS[target].name;
  const pr = document.createElement("span");
  pr.className = "t-prog";
  const bar = document.createElement("i");
  bar.className = "t-bar";
  txt.appendChild(nm);
  txt.appendChild(pr);
  el.appendChild(img);
  el.appendChild(txt);
  el.appendChild(bar);
  o.el = el; o.prog = pr; o.bar = bar;
  orders.push(o);
  orderListEl.appendChild(el);
  setOrderProgress(o);
  updateOrdersEmpty();
  sfxOrderNew();
}

function setOrderProgress(o) {
  o.prog.textContent = o.have + " / " + o.need;
}

function removeOrder(o, cls) {
  orders = orders.filter((x) => x !== o);
  o.el.classList.add(cls);
  setTimeout(() => { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); updateOrdersEmpty(); }, 450);
  orderTimer = Math.min(orderTimer, ORDER_GAP);
  if (orders.filter((x) => !x.boss).length === LEVELS[level].orders.slots - 1) orderTimer = ORDER_GAP;
}

function updateOrders(dt) {
  const slots = LEVELS[level].orders.slots;
  if (orders.filter((x) => !x.boss).length < slots) {
    orderTimer -= dt;
    if (orderTimer <= 0) { spawnOrder(); orderTimer = ORDER_GAP + 4; }
  }
  for (const o of orders.slice()) {
    o.time -= dt;
    const f = Math.max(0, o.time / o.max);
    o.bar.style.width = (f * 100).toFixed(1) + "%";
    o.el.classList.toggle("low", f < 0.25);
    if (o.time <= 0) {
      ordersMissed++;
      removeOrder(o, "missed");
      showToast("Order missed: " + SWEETS[o.level].name);
      sfxOrderMiss();
    }
  }
}

// Called every time a merge makes a new sweet.
function orderMade(lv) {
  const match = orders.filter((o) => o.level === lv && o.have < o.need).sort((a, b) => a.time - b.time)[0];
  if (!match) return;
  match.have++;
  setOrderProgress(match);
  if (match.have < match.need) {
    match.el.classList.remove("ping"); void match.el.offsetWidth; match.el.classList.add("ping");
    return;
  }
  // order finished
  ordersDone++;
  stats.orders++; missionEvent("order", 1); unlock("first_order"); if (stats.orders >= 15) unlock("master_baker");
  const reward = Math.max(12, Math.round(SWEETS[match.level].points * match.need * 3)) * (match.boss ? 2 : 1);
  addScore(reward);
  const b = bodies[bodies.length - 1];
  floaters.push({ x: b ? b.x : W / 2, y: b ? b.y - 30 : 200, text: "Order +" + reward, life: 1.3, max: 1.3 });
  removeOrder(match, "done");
  showToast("Order filled! +" + reward);
  sfxOrderDone();
  flash = Math.max(flash, 0.25);
  if (match.boss) { grantPower(); unlock("boss"); }
  else if (ordersDone % 2 === 0) grantPower();    // every second order also gives a power-up
}

// ---------------------------------------------------------------------
// UPDATE + RENDER
// ---------------------------------------------------------------------
function update(dt) {
  time += dt;

  for (const p of particles) {
    p.vy += 420 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  for (const f of floaters) {
    f.y -= 40 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  comboShow.life = Math.max(0, comboShow.life - dt);
  shake *= Math.exp(-7 * dt);
  if (shake < 0.1) shake = 0;
  flash = Math.max(0, flash - dt * 1.6);

  if (!playing || paused) return;

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }
  updateOrders(dt);
  stats.seconds += dt;
  if (LEVELS[level].timer) {
    modeTime -= dt;
    if (modeTime <= 0) { modeTime = 0; endGame(); return; }
  }
  updateEvents(dt);
  checkPuzzle(dt);
  if (feverT > 0) {
    feverT -= dt;
    fever = Math.max(0, (feverT / FEVER_TIME) * 100);
    if (feverT <= 0) endFever();
  }

  // blinking: every sweet blinks now and then
  heldBlinkIn -= dt;
  if (heldBlinkT > 0) heldBlinkT -= dt;
  if (heldBlinkIn <= 0) { heldBlinkT = 0.14; heldBlinkIn = 1.5 + Math.random() * 3.5; }
  for (const b of bodies) {
    b.blinkIn -= dt;
    if (b.blinkT > 0) b.blinkT -= dt;
    if (b.happy > 0) b.happy -= dt;
    if (b.blinkIn <= 0) { b.blinkT = 0.14; b.blinkIn = 1.5 + Math.random() * 3.5; }
  }

  if (!canDrop) {
    cooldown -= dt;
    if (cooldown <= 0) {
      held = next; heldSp = nextSp;
      rollNext();
      canDrop = true;
      drawNext();
    }
  }

  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) physicsStep(h);

  const popFade = Math.exp(-10 * dt);
  for (const b of bodies) b.pop *= popFade;

  // Bomb Candy fuses
  for (const b of bodies) {
    if (b.special === "bomb" && !b.dead) {
      b.fuse -= dt;
      if (b.fuse <= 0) explodeBomb(b);
    }
  }
  bodies = bodies.filter((b) => !b.dead);

  // game over check: a settled sweet stays above the dashed line
  let danger = false;
  for (const b of bodies) {
    if (b.age <= GRACE_TIME) continue;     // freshly dropped or merged sweets are ignored while they fall
    const top = b.y - b.r;
    if (feverT > 0) continue;                              // Fever mode: the line is safe
    if (top < JAR.limit && LEVELS[level].noLine) {        // Time Attack / Zen: crowded sweets pop away
      b.dead = true;
      burst(b.x, b.y, 12, 1);
      if (LEVELS[level].zen) addScore(SWEETS[b.level].points);
      if (zenToastT <= 0) { showToast("Crowded sweets popped!"); zenToastT = 4; }
      continue;
    }
    if (top < JAR.limit) { endGame(); return; }          // crossed the line: game over right away
    if (top < JAR.limit + 40) danger = true;              // close to the line: warning
  }
  bodies = bodies.filter((b) => !b.dead);
  if (zenToastT > 0) zenToastT -= dt;
  dangerRatio = danger ? 1 : 0;
}

function jarPath(c) {
  const L = JAR.left - 3;
  const R = JAR.right + 3;
  const F = JAR.floor + 3;
  c.beginPath();
  c.moveTo(L, JAR.top);
  c.lineTo(L, F - 14);
  c.quadraticCurveTo(L, F, L + 14, F);
  c.lineTo(R - 14, F);
  c.quadraticCurveTo(R, F, R, F - 14);
  c.lineTo(R, JAR.top);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // twinkling background stars
  for (const s of bgStars) {
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(time * 1.5 + s.phase);
    drawStar(ctx, s.x, s.y, s.size, s.color);
  }
  ctx.globalAlpha = 1;

  // jar (glass)
  jarPath(ctx);
  ctx.closePath();
  ctx.fillStyle = currentTheme().glass;
  ctx.fill();

  // danger line
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 3;
  if (dangerRatio > 0) {
    ctx.strokeStyle = "rgba(255, 60, 100, " + (0.6 + 0.4 * Math.sin(time * 14)) + ")";
  } else {
    ctx.strokeStyle = "rgba(255, 120, 160, 0.5)";
  }
  ctx.beginPath();
  ctx.moveTo(JAR.left, JAR.limit);
  ctx.lineTo(JAR.right, JAR.limit);
  ctx.stroke();
  ctx.restore();

  // pop mode: highlight the sweet under the pointer
  if (popMode && playing) {
    if (popHover && popHover.dead) popHover = null;
    if (popHover) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 60, 100, " + (0.7 + 0.3 * Math.sin(time * 12)) + ")";
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(popHover.x, popHover.y, popHover.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.font = "800 15px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#fff";
    ctx.strokeText("Tap a sweet to pop it", W / 2, 60);
    ctx.fillStyle = "#d9407b";
    ctx.fillText("Tap a sweet to pop it", W / 2, 60);
    ctx.restore();
  }

  // aim guide and the sweet you are holding
  if (playing && canDrop && !popMode) {
    const r = SWEETS[held].r;
    const x = clampX(aimX, r);
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = "rgba(232, 90, 138, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, SPAWN_Y + r);
    ctx.lineTo(x, JAR.floor);
    ctx.stroke();
    ctx.restore();
    drawPiece(ctx, held, heldSp, x, SPAWN_Y, r, 0, 1, dangerRatio > 0 ? "worried" : (heldBlinkT > 0 ? "blink" : "normal"));
  }

  // sweets in the jar
  for (const b of bodies) {
    let mood = "normal";
    let wobble = 0;
    if (b.happy > 0) mood = "happy";
    else if (playing && b.age > GRACE_TIME && b.y - b.r < JAR.limit + DANGER_ZONE) {
      mood = "worried";
      wobble = Math.sin(time * 28 + b.x) * 0.035;   // nervous shaking
    } else if (b.blinkT > 0) mood = "blink";
    drawPiece(ctx, b.level, b.special, b.x, b.y, b.r, b.angle + wobble, 1 + b.pop, mood, b.fuse);
  }

  // jar rim on top
  jarPath(ctx);
  ctx.strokeStyle = currentTheme().rim;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // sparkles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    drawStar(ctx, p.x, p.y, p.size, p.color);
  }
  ctx.globalAlpha = 1;

  if (playing) { drawFever(); drawModeHud(); }

  // flash when something big happens
  if (flash > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, " + Math.min(0.5, flash) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  // red glow at the top while a sweet is close to the line
  if (dangerRatio > 0 && playing) {
    const g = ctx.createLinearGradient(0, JAR.limit - 40, 0, JAR.limit + 70);
    const a = 0.12 + 0.1 * Math.sin(time * 10);
    g.addColorStop(0, "rgba(255, 60, 100, 0)");
    g.addColorStop(0.5, "rgba(255, 60, 100, " + a + ")");
    g.addColorStop(1, "rgba(255, 60, 100, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, JAR.limit - 40, W, 110);
  }

  // combo banner
  if (comboShow.life > 0) {
    const t = comboShow.life / 1.2;
    const pop = 1 + 0.35 * Math.max(0, t - 0.8) * 5;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.translate(W / 2, 205 - (1 - t) * 20);
    ctx.scale(pop, pop);
    ctx.font = "900 34px 'Trebuchet MS', 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#d9407b";
    ctx.strokeText(comboShow.text, 0, 0);
    ctx.fillStyle = "#ffd770";
    ctx.fillText(comboShow.text, 0, 0);
    ctx.restore();
  }

  // floating score text
  ctx.font = "bold 20px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = "#e85a8a";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------
// START
// ---------------------------------------------------------------------
updateMuteButton();
applyTheme();
updateMusicButtons();
refreshLadder();
loadBest();
levelName.textContent = LEVELS[level].label;
bestEl.textContent = best;
held = randomLevel();
rollNext();
drawNext();
showMenu();
requestAnimationFrame(frame);