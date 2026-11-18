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
const FRICTION = 0.5;             // sliding friction between sweets
const SUBSTEPS = 6;               // physics steps per frame (more = steadier)
const DROP_COOLDOWN = 0.45;       // seconds between drops
const GRACE_TIME = 1.0;           // new sweets are ignored for this long
const SPRITE_FIT = 1.1;           // picture size compared to its circle

// Difficulty levels the player picks on the start screen.
// weights = chance of dropping sweet 0..4.
// The game ends the moment a settled sweet crosses the dashed line.
const LEVELS = {
  easy:   { label: "Easy",   powerEvery: 80,  weights: [36, 30, 20, 10, 4] },
  normal: { label: "Normal", powerEvery: 100, weights: [30, 28, 20, 14, 8] },
  hard:   { label: "Hard",   powerEvery: 130, weights: [20, 22, 22, 20, 16] },
  daily:  { label: "Daily",  powerEvery: 100, weights: [30, 28, 20, 14, 8], daily: true }
};
const LEVEL_KEYS = ["easy", "normal", "hard", "daily"];

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
const POWER_MAX = 3;              // most charges you can hold of each power-up
const COMBO_WINDOW = 1.6;         // seconds to keep a combo going
const COMBO_MAX = 5;              // highest score multiplier
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
const levelBtns = Array.from(document.querySelectorAll(".level-btn"));
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
  drawSweet(nextCtx, next, 28, 28, 20, 0, 1);
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

function sfxDrop() { tone(220, 0.09, "triangle", 0.1, 140); }
function sfxMerge(level) {
  tone(380 + level * 55, 0.16, "sine", 0.14, 700 + level * 70);
  if (level >= 5) tone(900 + level * 40, 0.22, "triangle", 0.07, 1500);
}
function sfxPower() { tone(660, 0.12, "triangle", 0.1, 990); setTimeout(() => tone(990, 0.16, "triangle", 0.09, 1320), 90); }
function sfxPop() { tone(520, 0.12, "square", 0.08, 160); }
function sfxShake() { tone(140, 0.25, "sawtooth", 0.07, 70); }
function sfxOver() { tone(330, 0.5, "sawtooth", 0.09, 90); }

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
  score += n;
  while (score >= nextAward) { grantPower(); nextAward += LEVELS[level].powerEvery; }
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    bestEl.textContent = best;
  }
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function loadBest() {
  activeBoard = boardKey(level);
  best = Number(store.get("best_" + activeBoard)) || 0;
  bestAtStart = best;
}

function newGame() {
  loadBest();
  levelName.textContent = LEVELS[level].label;
  menuEl.classList.add("hidden");
  bodies = [];
  particles = [];
  floaters = [];
  score = 0;
  topLevel = 0;
  dangerRatio = 0;
  combo = 0; comboTimer = 0; comboShow.life = 0; shake = 0; flash = 0;
  powers = { swap: 0, shake: 0, pop: 0 };
  nextAward = LEVELS[level].powerEvery;
  spawnRng = LEVELS[level].daily ? seededRng("sweets-merge-" + activeBoard) : Math.random;
  setPopMode(false);
  updatePowerUI();
  closeBook();
  closeTutorial(true);
  setPaused(false);
  playing = true;
  canDrop = true;
  cooldown = 0;
  held = randomLevel();
  next = randomLevel();
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
  newBestEl.classList.toggle("hidden", !(score > bestAtStart && score > 0));
  overlayEl.classList.remove("hidden");
  sfxOver();

  finalScore = score;
  if (score > 0) addLocalScore(playerName || "Player", score);
  topTitle.textContent = "Top 10 · " + LEVELS[level].label + (LEVELS[level].daily ? " " + dailyLabel() : "");
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
  if (lb && lb.ready) {
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
  statusEl.textContent = local.length
    ? "Offline: showing the best scores on this device."
    : "The online leaderboard isn't available right now.";
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
  const online = !!(lb && lb.ready);
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
  menuDailySub.textContent = dailyLabel() + ": same sweets for everyone" + (streakNow() > 0 ? " · " + streakNow() + "-day streak" : "");
}

function showMenu() {
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
  ensureAudio();
  const r = SWEETS[held].r;
  const b = makeBody(held, clampX(aimX, r), SPAWN_Y);
  b.vy = 60;
  b.vx = (Math.random() - 0.5) * 30;   // tiny sideways nudge so towers can't balance perfectly
  bodies.push(b);
  recordSweet(held, false);
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
restartBtn.addEventListener("click", () => { if (playerName && menuEl.classList.contains("hidden")) newGame(); });
playAgainBtn.addEventListener("click", newGame);
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
    b.vy += GRAVITY * h;
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

        if (a.level === b.level) {
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
    floaters.push({ x, y, text: "+" + MAX_BONUS, life: 1.2, max: 1.2 });
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
  if (level >= 5) shake = Math.max(shake, 3 + (level - 5) * 1.6);
  burst(x, y, 10 + level * 3, 1 + level * 0.08);
  floaters.push({ x, y: y - SWEETS[level].r * 0.4, text: "+" + pts, life: 0.9, max: 0.9 });
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
      held = next;
      next = randomLevel();
      canDrop = true;
      drawNext();
    }
  }

  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) physicsStep(h);

  const popFade = Math.exp(-10 * dt);
  for (const b of bodies) b.pop *= popFade;

  // game over check: a settled sweet stays above the dashed line
  let danger = false;
  for (const b of bodies) {
    if (b.age <= GRACE_TIME) continue;     // freshly dropped or merged sweets are ignored while they fall
    const top = b.y - b.r;
    if (top < JAR.limit) { endGame(); return; }          // crossed the line: game over right away
    if (top < JAR.limit + 40) danger = true;              // close to the line: warning
  }
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
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
    drawSweet(ctx, held, x, SPAWN_Y, r, 0, 1, dangerRatio > 0 ? "worried" : (heldBlinkT > 0 ? "blink" : "normal"));
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
    drawSweet(ctx, b.level, b.x, b.y, b.r, b.angle + wobble, 1 + b.pop, mood);
  }

  // jar rim on top
  jarPath(ctx);
  ctx.strokeStyle = "rgba(255, 150, 185, 0.95)";
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
refreshLadder();
loadBest();
levelName.textContent = LEVELS[level].label;
bestEl.textContent = best;
held = randomLevel();
next = randomLevel();
drawNext();
showMenu();
requestAnimationFrame(frame);