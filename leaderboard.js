// Online leaderboard for Sweets Merge, using Firebase Firestore.
// Each player has ONE entry per board (their best score). The entry id is the
// lowercase name, so playing again only updates it when the new score is higher.
// Loaded as an ES module from index.html. It adds window.Leaderboard,
// and the game falls back to local scores if this file can't load.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, query, orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const NORMAL_BOARDS = ["easy", "normal", "hard"];   // scores_easy, scores_normal, scores_hard
// The daily challenge has one collection per day, for example daily_20261118.
const MAX_NAME_LENGTH = 12;
const MAX_SCORE = 100000;       // must match the Firestore security rules
const TIMEOUT_MS = 8000;        // give up on slow connections
const MIN_GAP_MS = 10000;       // minimum time between two submissions

// Names containing these words are rejected. Add more if you need to.
const BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "puta", "tangina", "gago", "pakyu", "pakshet", "nigg", "cunt"
];

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(fail("timeout")), TIMEOUT_MS))
  ]);
}

function cleanName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f<>\/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function hasBlockedWord(name) {
  const flat = name.toLowerCase().replace(/[^a-z]/g, "");
  return BLOCKED_WORDS.some((w) => flat.includes(w));
}

// Entry id for a name. Firestore ids can't be "." or "..", or look like __something__.
function entryId(name) {
  const id = name.toLowerCase();
  if (id === "." || id === ".." || /^__.*__$/.test(id)) throw fail("bad-name");
  return id;
}

function collectionFor(board) {
  if (NORMAL_BOARDS.includes(board)) return "scores_" + board;
  if (/^daily_\d{8}$/.test(String(board))) return board;
  throw fail("bad-level");
}

function readLastSubmit() {
  try { return Number(localStorage.getItem("sweetsMerge.lastSubmit")) || 0; } catch (e) { return 0; }
}

function writeLastSubmit() {
  try { localStorage.setItem("sweetsMerge.lastSubmit", String(Date.now())); } catch (e) { /* ignore */ }
}

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  window.Leaderboard = {
    ready: true,

    // Saves one score. Throws an error with a .code such as
    // "bad-name", "bad-score", "bad-level", "too-soon", or "timeout".
    // True if the name is usable (not empty and no blocked words).
    isNameOk(rawName) {
      const name = cleanName(rawName);
      if (!name || hasBlockedWord(name)) return false;
      try { entryId(name); } catch (e) { return false; }
      return true;
    },

    async submitScore(rawName, score, level) {
      const name = cleanName(rawName);
      if (!name || hasBlockedWord(name)) throw fail("bad-name");
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) throw fail("bad-score");

      // One entry per player: read the old one, only write if the new score is higher.
      const ref = doc(db, collectionFor(level), entryId(name));
      const old = await withTimeout(getDoc(ref));
      const oldBest = old.exists() ? Number(old.data().score) || 0 : -1;
      if (oldBest >= score) return { result: "kept", best: oldBest };

      if (Date.now() - readLastSubmit() < MIN_GAP_MS) throw fail("too-soon");
      // Keep the name exactly as first saved (the security rules require it).
      const savedName = old.exists() ? String(old.data().name) : name;
      await withTimeout(setDoc(ref, { name: savedName, score, createdAt: serverTimestamp() }));
      writeLastSubmit();
      return { result: oldBest < 0 ? "new" : "improved", best: score };
    },

    // Returns the best scores of one level as [{ name, score }, ...], highest first.
    async getTopScores(count, level) {
      const want = count || 10;
      // Read extra rows: older test entries may repeat a name, so we keep each name's best.
      const q = query(collection(db, collectionFor(level)), orderBy("score", "desc"), limit(want * 5));
      const snap = await withTimeout(getDocs(q));
      const seen = new Set();
      const out = [];
      for (const d of snap.docs) {
        const v = d.data();
        const name = String(v.name || "???").slice(0, MAX_NAME_LENGTH);
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, score: Number(v.score) || 0 });
        if (out.length >= want) break;
      }
      return out;
    }
  };
} catch (err) {
  console.warn("Leaderboard unavailable:", err);
  window.Leaderboard = { ready: false };
}