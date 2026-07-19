"use strict";
const cv = document.getElementById("c");
const cx = cv.getContext("2d");
let W, H;
function fit() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit(); window.addEventListener("resize", fit);

const keys = {};
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  const fresh = !keys[k];
  keys[k] = true;
  if (fresh && MOVE_KEYS.includes(k)) onBeatPress();
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

const META_KEY = "soundsystem_meta";
let meta = { discovered: [], best: 0 };
try { meta = Object.assign(meta, JSON.parse(localStorage.getItem(META_KEY) || "{}")); } catch (e) {}
function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }

const STEM_BY_ID = {}; STEMS.forEach(s => STEM_BY_ID[s.id] = s);
const GENRE_BY_ID = {}; GENRES.forEach(g => GENRE_BY_ID[g.id] = g);
const SLOT_ORDER = ["kick", "bass", "hats", "snare", "chords", "lead", "fx"];
const FX_COL = { sub: "#7F77DD", kick: "#FAC775", hat: "#B4B2A9", skank: "#9FE1CB",
  rim: "#F0997B", clap: "#F0997B", floor: "#FAC775", hat16: "#D3D1C7",
  acid: "#97C459", amen: "#ED93B1", reese: "#D4537E", wobble: "#7F77DD",
  gabber: "#E24B4A", trance: "#85B7EB", pad: "#5DCAA5", bigwave: "#CECBF6" };

const WORLD_W = 2400, WORLD_H = 2400;
let camX = 0, camY = 0;
const LANDMARKS = [
  { x: 400, y: 400, k: "ring", c: "#3C3489" },
  { x: 2000, y: 400, k: "cross", c: "#711F1F" },
  { x: 1200, y: 700, k: "diamond", c: "#085041" },
  { x: 400, y: 1400, k: "tri", c: "#633806" },
  { x: 2000, y: 1300, k: "ring", c: "#72243E" },
  { x: 800, y: 2000, k: "cross", c: "#0C447C" },
  { x: 1600, y: 1900, k: "tri", c: "#27500A" },
  { x: 1200, y: 1200, k: "diamond", c: "#444441" },
];

let audio = null, master = null, sweepFilter = null, started = false, buffers = {};
let t0 = 0, dead = false, choosing = false, choosingBranch = false;
let cards = [], branchOptions = [], shake = 0, hoverIdx = -1;
let player, enemies, shots, eshots, waves, particles, gems, banners;
let events, evIdx, loopN, startTime, xp, xpNext, level, genre, path, active, playing, slots;
let mods, aura, shield, stemFlash, lastSkankDir, kickFlash, hitFlash;
let combo = 0, boostTimer = 0, beatHitFx = 0;
let boss = null, bossIdx = 0, spawnAcc = 0, last = 0, joy = null;

function onBeatPress() {
  if (!started || dead || choosing || choosingBranch) return;
  const B = 60 / LOOP_BPM;
  const pos = ((audio.currentTime - t0) % B + B) % B;
  const d = Math.min(pos, B - pos);
  if (d < 0.1) { combo = Math.min(8, combo + 1); boostTimer = B * 1.2; beatHitFx = 1; }
  else if (d > 0.18) combo = 0;
}

function baseMods() {
  return { bulletDmg: 1, shotSpeed: 1, pierce: 0, move: 1, waveSize: 1,
           kickDmg: 1, shieldMax: 1, allDmg: 1, amenExtra: 0 };
}

function applyGenreBonus(id) {
  if (id === "house") mods.bulletDmg *= 1.5;
  else if (id === "techno") mods.shotSpeed *= 1.25;
  else if (id === "acid") mods.pierce += 1;
  else if (id === "jungle") { mods.move *= 1.2; mods.amenExtra += 2; }
  else if (id === "dubstep") mods.waveSize *= 1.4;
  else if (id === "hardcore") mods.kickDmg *= 1.5;
  else if (id === "trance") mods.shieldMax += 2;
}

function activeIds() { return SLOT_ORDER.map(s => slots[s]).filter(Boolean); }

function rebuildEvents() {
  events = [];
  for (const id of activeIds()) {
    const s = STEM_BY_ID[id];
    for (const ev of s.events) events.push(Object.assign({ fx: s.fx, stem: id }, ev));
  }
  events.sort((a, b) => a.t - b.t);
  const now = audio.currentTime;
  const pos = ((now - t0) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
  loopN = Math.floor((now - t0) / LOOP_LEN);
  evIdx = events.findIndex(e => e.t > pos);
  if (evIdx < 0) { evIdx = 0; loopN++; }
}

function startStemAudio(id, dest) {
  const buf = buffers[id];
  const g = audio.createGain(); g.gain.value = 0.9;
  const src = audio.createBufferSource();
  src.buffer = buf; src.loop = true;
  src.connect(g); g.connect(dest || master);
  const when = audio.currentTime + 0.06;
  const off = ((when - t0) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
  src.start(when, Math.min(off, buf.duration - 0.01));
  return { src, g };
}

function installSlot(slot, id) {
  if (slots[slot] === id) return;
  if (slots[slot] && playing[slots[slot]]) {
    try { playing[slots[slot]].src.stop(); } catch (e) {}
    delete playing[slots[slot]];
  }
  slots[slot] = id;
  playing[id] = startStemAudio(id);
  rebuildEvents();
}

function branchTo(gid) {
  const g = GENRE_BY_ID[gid];
  const now = audio.currentTime;
  sweepFilter.frequency.cancelScheduledValues(now);
  sweepFilter.frequency.setValueAtTime(16000, now);
  sweepFilter.frequency.exponentialRampToValueAtTime(280, now + 1.0);
  sweepFilter.frequency.setValueAtTime(280, now + 1.15);
  sweepFilter.frequency.exponentialRampToValueAtTime(16000, now + 2.4);
  setTimeout(() => {
    for (const slot in g.palette) installSlot(slot, g.palette[slot]);
  }, 1050);
  genre = g;
  path.push(gid);
  applyGenreBonus(gid);
  if (!meta.discovered.includes(gid)) { meta.discovered.push(gid); saveMeta(); }
  banners.push({ big: g.name + " — " + ERAS[Math.min(path.length - 1, 3)],
                 sub: g.desc + " · " + g.bonus, until: 4.5 });
}

function reset() {
  player = { x: WORLD_W / 2, y: WORLD_H / 2, r: 13, hp: 5, iframe: 0, dirX: 1, dirY: 0 };
  enemies = []; shots = []; eshots = []; waves = []; particles = []; gems = []; banners = [];
  xp = 0; level = 1; xpNext = 6;
  mods = baseMods(); aura = 0; shield = 0;
  stemFlash = {}; lastSkankDir = 0; kickFlash = 0; hitFlash = 0; shake = 0;
  combo = 0; boostTimer = 0; beatHitFx = 0;
  dead = false; choosing = false; choosingBranch = false;
  if (boss) for (const s of boss.stems) { try { s.src.stop(); } catch (e) {} }
  boss = null; bossIdx = 0;
  if (!meta.discovered.includes("dub")) { meta.discovered.push("dub"); saveMeta(); }
  if (playing) for (const id in playing) { try { playing[id].src.stop(); } catch (e) {} }
  playing = {}; slots = {};
  path = ["dub"]; genre = GENRE_BY_ID.dub;
  t0 = audio.currentTime + 0.15;
  startTime = t0;
  for (const s of ["kick", "bass", "hats"]) {
    slots[s] = genre.palette[s];
    playing[slots[s]] = startStemAudio(slots[s]);
  }
  rebuildEvents();
  evIdx = 0; loopN = 0;
}

function b64ToBuf(b64) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function boot() {
  audio = new (window.AudioContext || window.webkitAudioContext)();
  const comp = audio.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  sweepFilter = audio.createBiquadFilter();
  sweepFilter.type = "lowpass"; sweepFilter.frequency.value = 16000;
  master = audio.createGain(); master.gain.value = 0.85;
  master.connect(sweepFilter); sweepFilter.connect(comp); comp.connect(audio.destination);
  for (const s of STEMS) buffers[s.id] = await audio.decodeAudioData(b64ToBuf(s.b64));
  started = true;
  reset();
  requestAnimationFrame(frame);
}

function pickCards() {
  const pool = [];
  const seen = new Set();
  const gids = [genre.id, ...genre.edges];
  for (const gid of gids) {
    const g = GENRE_BY_ID[gid];
    for (const slot in g.palette) {
      const id = g.palette[slot];
      if (slots[slot] === id || seen.has(slot + id)) continue;
      seen.add(slot + id);
      const s = STEM_BY_ID[id];
      pool.push({ kind: "stem", slot, id, gid,
                  name: s.name, desc: s.desc, effect: s.effect,
                  tag: (slots[slot] ? "swap " : "new ") + slot + " · " + g.name });
    }
  }
  const out = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  const generics = [
    { kind: "up", name: "dubplate special", desc: "a one-off pressing, louder than the rest",
      effect: "+15% all damage", tag: "upgrade", apply: () => { mods.allDmg *= 1.15; } },
    { kind: "up", name: "pitch up", desc: "nudge the pitch fader",
      effect: "+10% projectile speed", tag: "upgrade", apply: () => { mods.shotSpeed *= 1.1; } },
    { kind: "up", name: "monitor wedge", desc: "hear yourself better, move better",
      effect: "+10% move speed", tag: "upgrade", apply: () => { mods.move *= 1.1; } },
  ];
  while (out.length < 3) out.push(generics[out.length % 3]);
  return out;
}

function nearestEnemy() {
  let best = null, bd = 1e9;
  const cand = boss ? enemies.concat([boss]) : enemies;
  for (const e of cand) {
    const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function aimAt(spread) {
  const t = nearestEnemy();
  let a = t ? Math.atan2(t.y - player.y, t.x - player.x)
            : Math.atan2(player.dirY, player.dirX);
  return a + (spread || 0);
}

function shoot(a, spd, r, dmg, col, opts) {
  shots.push(Object.assign({
    x: player.x, y: player.y,
    vx: Math.cos(a) * spd * mods.shotSpeed, vy: Math.sin(a) * spd * mods.shotSpeed,
    r: r + (boostTimer > 0 ? 1.5 : 0),
    dmg: dmg * mods.allDmg * (boostTimer > 0 ? 1 + 0.12 * combo : 1),
    col, pierce: mods.pierce, life: 2, boosted: boostTimer > 0 }, opts || {}));
}

function fire(ev) {
  stemFlash[ev.stem] = 1;
  const st = STEM_BY_ID[ev.stem];
  const mul = st.dmgMul || 1;
  const fx = ev.fx;
  if (fx === "sub") {
    const mx = ((st.p && st.p.waveMax) || 150) * mods.waveSize;
    waves.push({ x: player.x, y: player.y, r: 10, max: mx,
                 dmg: 1 * mods.allDmg * mul, push: 340, hitset: new Set(),
                 col: "rgba(127,119,221,0.6)" });
  } else if (fx === "bigwave") {
    const mx = ((st.p && st.p.waveMax) || 380) * mods.waveSize;
    waves.push({ x: player.x, y: player.y, r: 10, max: mx,
                 dmg: 3 * mods.allDmg * mul, push: 500, hitset: new Set(),
                 col: "rgba(206,203,246,0.7)" });
    shake = Math.min(10, shake + 5);
  } else if (fx === "kick" || fx === "floor" || fx === "gabber") {
    const big = fx === "gabber";
    shoot(aimAt(0), big ? 460 : 520, big ? 10 : 8,
          (fx === "kick" ? 3 : fx === "floor" ? 2 : 4.5) * mods.kickDmg * mul,
          FX_COL[fx], { pierce: mods.pierce + (big ? 2 : 1) });
    kickFlash = 1;
    if (big) shake = Math.min(9, shake + (mods.kickDmg > 1 ? 7 : 4));
  } else if (fx === "hat") {
    shoot(aimAt((Math.random() - 0.5) * 0.25), 430, 3, 1 * mods.bulletDmg * mul, FX_COL.hat);
  } else if (fx === "hat16") {
    shoot(aimAt((Math.random() - 0.5) * 0.15), 500, 2.5, 0.7 * mods.bulletDmg * mul,
          FX_COL.hat16, { life: 1.4 });
  } else if (fx === "skank") {
    if (ev.kind === "hit") {
      lastSkankDir = aimAt(0);
      const spreads = st.id === "stab_house" ? [-0.6, -0.3, 0, 0.3, 0.6] : [-0.35, 0, 0.35];
      for (const s of spreads)
        shoot(lastSkankDir + s, 380, 3.5, 1 * mods.bulletDmg * mul, FX_COL.skank);
    } else {
      for (const s of [-0.35, 0, 0.35])
        shoot(lastSkankDir + s, 380, 2.5, (ev.gain > 0.3 ? 1 : 0.5) * mods.bulletDmg * mul,
              "#5DCAA5", { ghost: true, life: 1.2 });
    }
  } else if (fx === "rim") {
    shoot(aimAt(0), 250, 4.5, 2 * mods.allDmg * mul, FX_COL.rim, { homing: true, life: 3 });
  } else if (fx === "clap") {
    for (const s of [-0.5, 0.5])
      shoot(aimAt(s), 250, 4.5, 2 * mods.allDmg * mul, FX_COL.clap, { homing: true, life: 3 });
  } else if (fx === "acid") {
    shoot(aimAt((Math.random() - 0.5) * 0.1), 560, 3, 1.2 * mods.bulletDmg * mul, FX_COL.acid,
          { pierce: mods.pierce + 1 + (ev.acc ? 2 : 0), life: 1.8 });
  } else if (fx === "amen") {
    const n = 3 + mods.amenExtra;
    for (let i = 0; i < n; i++)
      shoot(Math.random() * Math.PI * 2, 300 + Math.random() * 160, 3,
            1 * mods.bulletDmg * mul, FX_COL.amen, { life: 0.9 });
  } else if (fx === "reese") {
    aura = Math.max(aura, 1.0);
  } else if (fx === "wobble") {
    shoot(aimAt(0), 130, 22 * mods.waveSize, 2 * mods.allDmg * mul, FX_COL.wobble,
          { pierce: 999, life: 3, wave: true });
  } else if (fx === "trance") {
    shoot(aimAt((Math.random() - 0.5) * 1.5), 340, 2, 0.6 * mods.bulletDmg * mul,
          FX_COL.trance, { homing: true, life: 2 });
  } else if (fx === "pad") {
    shield = Math.min(mods.shieldMax, shield + 1);
  }
}

function spawnEnemy(elapsed) {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = camX - 30; y = camY + Math.random() * H; }
  else if (side === 1) { x = camX + W + 30; y = camY + Math.random() * H; }
  else if (side === 2) { x = camX + Math.random() * W; y = camY - 30; }
  else { x = camX + Math.random() * W; y = camY + H + 30; }
  x = Math.max(10, Math.min(WORLD_W - 10, x));
  y = Math.max(10, Math.min(WORLD_H - 10, y));
  const shifts = path.length - 1;
  const big = Math.random() < Math.min(0.18, 0.03 + elapsed / 300 + shifts * 0.03);
  enemies.push({
    x, y, s: big ? 26 : 15 + Math.random() * 6,
    hp: ((big ? 7 : 2) + Math.floor(elapsed / 40)) * (1 + shifts * 0.45),
    spd: (big ? 40 : 55) + Math.random() * 25 + elapsed * 0.3 + shifts * 14,
    px: 0, py: 0, big
  });
}

function spawnBoss() {
  const gid = genre.edges[Math.floor(Math.random() * genre.edges.length)];
  const g = GENRE_BY_ID[gid];
  const a = Math.random() * Math.PI * 2;
  const bx = Math.max(60, Math.min(WORLD_W - 60, player.x + Math.cos(a) * (W / 2 + 100)));
  const by = Math.max(60, Math.min(WORLD_H - 60, player.y + Math.sin(a) * (H / 2 + 100)));
  const stemIds = [g.palette.kick, g.palette.snare].filter(Boolean);
  const bevents = [];
  for (const id of stemIds)
    for (const ev of STEM_BY_ID[id].events) bevents.push({ t: ev.t });
  bevents.sort((q, w) => q.t - w.t);
  boss = { x: bx, y: by, s: 64, hp: BOSS_CFG.hp[bossIdx], max: BOSS_CFG.hp[bossIdx],
           gid, name: g.name, stems: stemIds.map(id => startStemAudio(id)),
           events: bevents, evIdx: 0, loopN: 0, px: 0, py: 0, big: true };
  const pos = ((audio.currentTime - t0) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
  boss.loopN = Math.floor((audio.currentTime - t0) / LOOP_LEN);
  boss.evIdx = bevents.findIndex(e => e.t > pos);
  if (boss.evIdx < 0) { boss.evIdx = 0; boss.loopN++; }
  banners.push({ big: "sound clash: " + g.name + " system", sub: "defeat the rival to claim the next era", until: 5 });
}

function killBoss() {
  for (const s of boss.stems) { try { s.src.stop(); } catch (e) {} }
  for (let i = 0; i < 14; i++)
    gems.push({ x: boss.x + (Math.random() - 0.5) * 80, y: boss.y + (Math.random() - 0.5) * 80, v: 3 });
  branchOptions = [boss.gid, ...genre.edges.filter(g => g !== boss.gid)].slice(0, 3);
  boss = null; bossIdx++;
  choosingBranch = true;
}

function inRect(mx, my, x, y, w, h) { return mx > x && mx < x + w && my > y && my < y + h; }

function cardRects() {
  const cw = 240, ch = 190, gap = 24;
  const x0 = W / 2 - (cw * 3 + gap * 2) / 2, y0 = H / 2 - ch / 2;
  return { cw, ch, gap, x0, y0 };
}

function uiTap(mx, my) {
  const { cw, ch, gap, x0, y0 } = cardRects();
  if (choosing) {
    for (let i = 0; i < 3; i++) {
      if (inRect(mx, my, x0 + i * (cw + gap), y0, cw, ch)) {
        const c = cards[i];
        if (c.kind === "stem") installSlot(c.slot, c.id); else c.apply();
        choosing = false;
        break;
      }
    }
    return;
  }
  if (choosingBranch) {
    const n = branchOptions.length;
    const bx0 = W / 2 - (cw * n + gap * (n - 1)) / 2;
    for (let i = 0; i < n; i++) {
      if (inRect(mx, my, bx0 + i * (cw + gap), y0, cw, ch)) {
        choosingBranch = false;
        branchTo(branchOptions[i]);
        break;
      }
    }
    return;
  }
  if (dead) {
    if (inRect(mx, my, W / 2 - 165, H / 2 + 76, 150, 42)) reset();
    else if (inRect(mx, my, W / 2 + 15, H / 2 + 76, 150, 42)) exportRun();
  }
}

cv.addEventListener("click", e => {
  if (!started) { boot(); return; }
  if (audio && audio.state === "suspended") audio.resume();
  const rect = cv.getBoundingClientRect();
  uiTap(e.clientX - rect.left, e.clientY - rect.top);
});
cv.addEventListener("mousemove", e => {
  if (!choosing && !choosingBranch) { hoverIdx = -1; return; }
  const rect = cv.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const { cw, ch, gap, x0, y0 } = cardRects();
  hoverIdx = -1;
  for (let i = 0; i < 3; i++)
    if (inRect(mx, my, x0 + i * (cw + gap), y0, cw, ch)) hoverIdx = i;
});
cv.addEventListener("touchstart", e => {
  e.preventDefault();
  if (!started) { boot(); return; }
  if (audio && audio.state === "suspended") audio.resume();
  const rect = cv.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const x = t.clientX - rect.left, y = t.clientY - rect.top;
    if (dead || choosing || choosingBranch) { uiTap(x, y); continue; }
    if (x < W * 0.45 && !joy) joy = { id: t.identifier, ox: x, oy: y, dx: 0, dy: 0 };
    else onBeatPress();
  }
}, { passive: false });
cv.addEventListener("touchmove", e => {
  e.preventDefault();
  if (!joy) return;
  const rect = cv.getBoundingClientRect();
  for (const t of e.changedTouches) {
    if (t.identifier !== joy.id) continue;
    let dx = t.clientX - rect.left - joy.ox, dy = t.clientY - rect.top - joy.oy;
    const m = Math.hypot(dx, dy);
    if (m > 60) { dx = dx / m * 60; dy = dy / m * 60; }
    joy.dx = dx; joy.dy = dy;
  }
}, { passive: false });
cv.addEventListener("touchend", e => {
  for (const t of e.changedTouches)
    if (joy && t.identifier === joy.id) joy = null;
}, { passive: false });

function levelUp() {
  level++;
  xpNext = 6 + level * 6;
  cards = pickCards();
  choosing = true;
}

function exportRun() {
  const sr = 44100, loops = 2;
  const len = Math.ceil(LOOP_LEN * loops * sr);
  const off = new OfflineAudioContext(1, len, sr);
  for (const id of activeIds()) {
    const src = off.createBufferSource();
    src.buffer = buffers[id]; src.loop = true;
    const g = off.createGain(); g.gain.value = 0.9;
    src.connect(g); g.connect(off.destination);
    src.start(0);
  }
  off.startRendering().then(buf => {
    const d = buf.getChannelData(0);
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const sc = peak > 0 ? 0.891 / peak : 1;
    const out = new DataView(new ArrayBuffer(44 + d.length * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); out.setUint32(4, 36 + d.length * 2, true); ws(8, "WAVEfmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true);
    out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    ws(36, "data"); out.setUint32(40, d.length * 2, true);
    for (let i = 0; i < d.length; i++)
      out.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, d[i] * sc * 32767)), true);
    const url = URL.createObjectURL(new Blob([out.buffer], { type: "audio/wav" }));
    const a = document.createElement("a");
    a.href = url; a.download = "soundsystem_" + path.join("-") + ".wav"; a.click();
  });
}

function kill(e) {
  gems.push({ x: e.x, y: e.y, v: e.big ? 3 : 1 });
  for (let i = 0; i < 6; i++)
    particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 180,
                     vy: (Math.random() - 0.5) * 180, life: 0.4 });
}

function die(elapsed) {
  dead = true;
  if (elapsed > meta.best) { meta.best = elapsed; saveMeta(); }
}

function hitPlayer() {
  if (player.iframe > 0) return;
  if (shield > 0) shield--;
  else { player.hp--; hitFlash = 1; if (player.hp <= 0) die(audio.currentTime - startTime); }
  player.iframe = 0.8;
}

function frame(ts) {
  const now = audio.currentTime;
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  const elapsed = now - startTime;
  const paused = choosing || choosingBranch;

  if (!dead && !paused) {
    let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (joy && Math.hypot(joy.dx, joy.dy) > 8) { mx = joy.dx; my = joy.dy; }
    if (mx || my) {
      const n = Math.hypot(mx, my);
      player.dirX = mx / n; player.dirY = my / n;
      const sp = 240 * mods.move;
      player.x = Math.max(14, Math.min(WORLD_W - 14, player.x + mx / n * sp * dt));
      player.y = Math.max(14, Math.min(WORLD_H - 14, player.y + my / n * sp * dt));
    }
    player.iframe = Math.max(0, player.iframe - dt);
    aura = Math.max(0, aura - dt * 0.4);
    boostTimer = Math.max(0, boostTimer - dt);
    beatHitFx = Math.max(0, beatHitFx - dt * 3);

    if (events.length) {
      let guard = 0;
      while (guard++ < 300) {
        const ev = events[evIdx];
        const abs = t0 + loopN * LOOP_LEN + ev.t;
        if (abs > now) break;
        if (abs > now - 0.25) fire(ev);
        evIdx++;
        if (evIdx >= events.length) { evIdx = 0; loopN++; }
      }
    }

    if (!boss && bossIdx < BOSS_CFG.times.length && elapsed > BOSS_CFG.times[bossIdx]) spawnBoss();
    if (boss) {
      const a = Math.atan2(player.y - boss.y, player.x - boss.x);
      boss.x += Math.cos(a) * 30 * dt; boss.y += Math.sin(a) * 30 * dt;
      let guard = 0;
      while (boss.events.length && guard++ < 100) {
        const ev = boss.events[boss.evIdx];
        const abs = t0 + boss.loopN * LOOP_LEN + ev.t;
        if (abs > now) break;
        if (abs > now - 0.25) {
          const ba = Math.atan2(player.y - boss.y, player.x - boss.x) + (Math.random() - 0.5) * 0.35;
          eshots.push({ x: boss.x, y: boss.y, vx: Math.cos(ba) * 180, vy: Math.sin(ba) * 180,
                        r: 6, life: 4 });
        }
        boss.evIdx++;
        if (boss.evIdx >= boss.events.length) { boss.evIdx = 0; boss.loopN++; }
      }
      if (Math.hypot(boss.x - player.x, boss.y - player.y) < boss.s / 2 + player.r) hitPlayer();
      if (boss.hp <= 0) killBoss();
    }

    for (const s of eshots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (Math.hypot(s.x - player.x, s.y - player.y) < s.r + player.r - 2) { s.life = 0; hitPlayer(); }
    }
    eshots = eshots.filter(s => s.life > 0);

    spawnAcc += dt;
    const interval = Math.max(0.18, 1.1 - elapsed * 0.011 - level * 0.02) * (boss ? 1.6 : 1);
    while (spawnAcc > interval) { spawnAcc -= interval; spawnEnemy(elapsed); }

    for (const e of enemies) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      e.px *= 0.88; e.py *= 0.88;
      e.x += (Math.cos(a) * e.spd + e.px) * dt;
      e.y += (Math.sin(a) * e.spd + e.py) * dt;
      if (aura > 0 && Math.hypot(e.x - player.x, e.y - player.y) < 80)
        e.hp -= 3 * mods.allDmg * dt;
      if (Math.hypot(e.x - player.x, e.y - player.y) < e.s / 2 + player.r - 2) hitPlayer();
    }

    for (const s of shots) {
      if (s.homing) {
        const t = nearestEnemy();
        if (t) {
          const want = Math.atan2(t.y - s.y, t.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const na = cur + Math.max(-4 * dt, Math.min(4 * dt, diff));
          const sp = Math.hypot(s.vx, s.vy) * 1.01;
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      const targets = boss ? enemies.concat([boss]) : enemies;
      for (const e of targets) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < e.s / 2 + s.r) {
          if (s.wave && s.hitset && s.hitset.has(e)) continue;
          e.hp -= s.dmg;
          if (s.wave) { (s.hitset = s.hitset || new Set()).add(e); }
          else if (s.pierce > 0) s.pierce--;
          else s.life = 0;
          if (e.hp <= 0 && e !== boss) kill(e);
          if (!s.wave) break;
        }
      }
    }
    shots = shots.filter(s => s.life > 0 && s.x > camX - 80 && s.x < camX + W + 80 &&
                               s.y > camY - 80 && s.y < camY + H + 80);

    for (const w of waves) {
      w.r += 320 * dt;
      const targets = boss ? enemies.concat([boss]) : enemies;
      for (const e of targets) {
        const d = Math.hypot(e.x - w.x, e.y - w.y);
        if (Math.abs(d - w.r) < 22 && !w.hitset.has(e)) {
          w.hitset.add(e); e.hp -= w.dmg;
          const a = Math.atan2(e.y - w.y, e.x - w.x);
          if (e !== boss) { e.px += Math.cos(a) * w.push; e.py += Math.sin(a) * w.push; }
          if (e.hp <= 0 && e !== boss) kill(e);
        }
      }
    }
    waves = waves.filter(w => w.r < w.max);
    enemies = enemies.filter(e => e.hp > 0);

    for (const g of gems) {
      const d = Math.hypot(g.x - player.x, g.y - player.y);
      if (d < 90) { g.x += (player.x - g.x) * 8 * dt; g.y += (player.y - g.y) * 8 * dt; }
      if (d < 18) {
        g.got = true; xp += g.v;
        if (xp >= xpNext) { xp -= xpNext; levelUp(); }
      }
    }
    gems = gems.filter(g => !g.got);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
  } else if (dead) {
    if (keys.r) reset();
    if (keys.e && !window._exp) { window._exp = true; exportRun(); setTimeout(() => window._exp = false, 2000); }
  }

  draw(now, elapsed, ts);
  requestAnimationFrame(frame);
}

function draw(now, elapsed, ts) {
  kickFlash = Math.max(0, kickFlash - 0.06);
  hitFlash = Math.max(0, hitFlash - 0.05);
  shake = Math.max(0, shake - 0.5);
  for (const b of banners) b.until -= 0.016;
  banners = banners.filter(b => b.until > 0);

  camX = Math.max(0, Math.min(WORLD_W - W, player.x - W / 2));
  camY = Math.max(0, Math.min(WORLD_H - H, player.y - H / 2));
  cx.save();
  if (shake > 0) cx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  cx.fillStyle = `rgb(${Math.round(kickFlash * 22 + hitFlash * 50)}, ${Math.round(kickFlash * 18)}, ${Math.round(kickFlash * 14)})`;
  cx.fillRect(-10, -10, W + 20, H + 20);
  cx.translate(-camX, -camY);

  cx.strokeStyle = "#17171d"; cx.lineWidth = 1;
  const gs = 200;
  cx.beginPath();
  for (let gx = Math.floor(camX / gs) * gs; gx <= camX + W + gs; gx += gs) {
    cx.moveTo(gx, camY - 10); cx.lineTo(gx, camY + H + 10);
  }
  for (let gy = Math.floor(camY / gs) * gs; gy <= camY + H + gs; gy += gs) {
    cx.moveTo(camX - 10, gy); cx.lineTo(camX + W + 10, gy);
  }
  cx.stroke();
  for (const lm of LANDMARKS) {
    if (lm.x < camX - 90 || lm.x > camX + W + 90 || lm.y < camY - 90 || lm.y > camY + H + 90) continue;
    cx.strokeStyle = lm.c; cx.lineWidth = 3;
    if (lm.k === "ring") { cx.beginPath(); cx.arc(lm.x, lm.y, 60, 0, 7); cx.stroke();
      cx.beginPath(); cx.arc(lm.x, lm.y, 30, 0, 7); cx.stroke(); }
    else if (lm.k === "cross") {
      cx.beginPath(); cx.moveTo(lm.x - 50, lm.y); cx.lineTo(lm.x + 50, lm.y);
      cx.moveTo(lm.x, lm.y - 50); cx.lineTo(lm.x, lm.y + 50); cx.stroke(); }
    else if (lm.k === "diamond") {
      cx.beginPath(); cx.moveTo(lm.x, lm.y - 55); cx.lineTo(lm.x + 55, lm.y);
      cx.lineTo(lm.x, lm.y + 55); cx.lineTo(lm.x - 55, lm.y); cx.closePath(); cx.stroke(); }
    else {
      cx.beginPath(); cx.moveTo(lm.x, lm.y - 55); cx.lineTo(lm.x + 50, lm.y + 40);
      cx.lineTo(lm.x - 50, lm.y + 40); cx.closePath(); cx.stroke(); }
  }
  cx.strokeStyle = "#5f2a2a"; cx.lineWidth = 4;
  cx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);

  if (aura > 0) {
    cx.strokeStyle = `rgba(212,83,126,${aura * 0.5})`; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(player.x, player.y, 80, 0, 7); cx.stroke();
  }
  for (const w of waves) {
    cx.strokeStyle = w.col; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(w.x, w.y, w.r, 0, 7); cx.stroke();
  }
  for (const e of enemies) {
    cx.fillStyle = e.big ? "#E24B4A" : "#c2453f";
    cx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
  }
  if (boss) {
    cx.fillStyle = "#8c1f1f";
    cx.fillRect(boss.x - 32, boss.y - 32, 64, 26);
    cx.fillRect(boss.x - 26, boss.y - 4, 52, 20);
    cx.fillRect(boss.x - 20, boss.y + 18, 40, 14);
    cx.fillStyle = "#E24B4A";
    cx.beginPath(); cx.arc(boss.x, boss.y - 19, 8, 0, 7); cx.fill();
    cx.beginPath(); cx.arc(boss.x, boss.y + 6, 6, 0, 7); cx.fill();
    cx.fillStyle = "#2e2e36"; cx.fillRect(boss.x - 32, boss.y - 46, 64, 6);
    cx.fillStyle = "#E24B4A"; cx.fillRect(boss.x - 32, boss.y - 46, 64 * (boss.hp / boss.max), 6);
    cx.fillStyle = "#F09595"; cx.font = "11px monospace"; cx.textAlign = "center";
    cx.fillText(boss.name + " system", boss.x, boss.y - 52);
    cx.textAlign = "left";
  }
  for (const g of gems) {
    cx.fillStyle = "#97C459";
    cx.save(); cx.translate(g.x, g.y); cx.rotate(Math.PI / 4);
    cx.fillRect(-3.5, -3.5, 7, 7); cx.restore();
  }
  for (const s of shots) {
    cx.globalAlpha = s.ghost ? 0.55 : 1;
    cx.fillStyle = s.col;
    cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 7); cx.fill();
    cx.globalAlpha = 1;
  }
  for (const s of eshots) {
    cx.fillStyle = "#E24B4A";
    cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 7); cx.fill();
    cx.fillStyle = "#101014";
    cx.beginPath(); cx.arc(s.x, s.y, s.r * 0.45, 0, 7); cx.fill();
  }
  for (const p of particles) {
    cx.fillStyle = `rgba(226,75,74,${p.life * 2})`;
    cx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  if (joy) {
    cx.strokeStyle = "rgba(138,138,146,0.4)"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(camX + joy.ox, camY + joy.oy, 44, 0, 7); cx.stroke();
    cx.fillStyle = "rgba(93,202,165,0.5)";
    cx.beginPath(); cx.arc(camX + joy.ox + joy.dx, camY + joy.oy + joy.dy, 14, 0, 7); cx.fill();
  }
  if (shield > 0) {
    cx.strokeStyle = "rgba(93,202,165,0.7)"; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(player.x, player.y, 20 + shield * 2, 0, 7); cx.stroke();
  }
  if (player.iframe <= 0 || Math.floor(ts / 80) % 2 === 0) {
    const a = Math.atan2(player.dirY, player.dirX);
    cx.fillStyle = "#5DCAA5";
    cx.beginPath();
    cx.moveTo(player.x + Math.cos(a) * 15, player.y + Math.sin(a) * 15);
    cx.lineTo(player.x + Math.cos(a + 2.5) * 12, player.y + Math.sin(a + 2.5) * 12);
    cx.lineTo(player.x + Math.cos(a - 2.5) * 12, player.y + Math.sin(a - 2.5) * 12);
    cx.closePath(); cx.fill();
  }
  cx.restore();

  const beat = ((now - t0) / (60 / LOOP_BPM)) % 8;
  for (let i = 0; i < 8; i++) {
    cx.fillStyle = Math.floor(beat) === i ? "#FAC775" : "#3a3a42";
    cx.beginPath(); cx.arc(W / 2 - 84 + i * 24, 22, Math.floor(beat) === i ? 6 : 4, 0, 7); cx.fill();
  }
  if (combo > 0) {
    cx.textAlign = "center";
    cx.fillStyle = beatHitFx > 0.3 ? "#FAC775" : "#8a8a92";
    cx.font = "13px monospace";
    cx.fillText("on beat x" + combo, W / 2 + 150, 27);
    cx.textAlign = "left";
  }

  const mmS = 110, mmX = W - mmS - 14, mmY = 38, mSc = mmS / WORLD_W;
  cx.fillStyle = "rgba(14,14,18,0.85)"; cx.fillRect(mmX, mmY, mmS, mmS);
  cx.strokeStyle = "#3a3a42"; cx.lineWidth = 1; cx.strokeRect(mmX, mmY, mmS, mmS);
  for (const lm of LANDMARKS) {
    cx.fillStyle = lm.c;
    cx.fillRect(mmX + lm.x * mSc - 2, mmY + lm.y * mSc - 2, 4, 4);
  }
  cx.fillStyle = "rgba(226,75,74,0.8)";
  let mmN = 0;
  for (const e of enemies) {
    if (mmN++ > 180) break;
    cx.fillRect(mmX + e.x * mSc - 1, mmY + e.y * mSc - 1, 2, 2);
  }
  if (boss) {
    cx.fillStyle = "#E24B4A";
    cx.fillRect(mmX + boss.x * mSc - 3, mmY + boss.y * mSc - 3, 6, 6);
  }
  cx.strokeStyle = "rgba(138,138,146,0.5)";
  cx.strokeRect(mmX + camX * mSc, mmY + camY * mSc, W * mSc, H * mSc);
  cx.fillStyle = "#5DCAA5";
  cx.beginPath(); cx.arc(mmX + player.x * mSc, mmY + player.y * mSc, 3, 0, 7); cx.fill();

  cx.fillStyle = "#8a8a92"; cx.font = "13px monospace";
  cx.fillText("hp " + "■".repeat(Math.max(0, player.hp)) + (shield > 0 ? " +" + shield : ""), 14, 24);
  cx.fillText("lv " + level + " · " + genre.name + " · " + ERAS[Math.min(path.length - 1, 3)] +
              " · " + elapsed.toFixed(0) + "s", W - 340, 24);
  cx.fillStyle = "#2e2e36"; cx.fillRect(14, 34, 140, 5);
  cx.fillStyle = "#97C459"; cx.fillRect(14, 34, 140 * Math.min(1, xp / xpNext), 5);
  cx.fillStyle = "#5a5a64"; cx.font = "11px monospace";
  cx.fillText(path.join(" → "), 14, 54);

  let chX = 14;
  for (const slot of SLOT_ORDER) {
    const id = slots[slot];
    if (!id) continue;
    const s = STEM_BY_ID[id];
    stemFlash[id] = Math.max(0, (stemFlash[id] || 0) - 0.05);
    const f = stemFlash[id];
    cx.fillStyle = f > 0.3 ? FX_COL[s.fx] : "#2e2e36";
    cx.fillRect(chX, H - 30, 66, 20);
    cx.fillStyle = f > 0.3 ? "#101014" : "#8a8a92";
    cx.font = "10px monospace";
    cx.fillText(slot + ":" + s.name.slice(0, 6), chX + 3, H - 17);
    chX += 70;
  }

  for (const b of banners) {
    cx.textAlign = "center";
    cx.fillStyle = `rgba(232,232,238,${Math.min(1, b.until)})`;
    cx.font = "22px monospace"; cx.fillText(b.big, W / 2, 80);
    cx.font = "13px monospace";
    cx.fillStyle = `rgba(138,138,146,${Math.min(1, b.until)})`;
    cx.fillText(b.sub, W / 2, 102);
    cx.textAlign = "left";
  }

  if (choosing || choosingBranch) {
    cx.fillStyle = "rgba(0,0,0,0.78)"; cx.fillRect(0, 0, W, H);
    const { cw, ch, gap, x0, y0 } = cardRects();
    cx.textAlign = "center"; cx.fillStyle = "#e8e8ee"; cx.font = "18px monospace";
    if (choosing) {
      cx.fillText("level " + level + " — rework the mix", W / 2, y0 - 60);
      for (let i = 0; i < 3; i++) {
        const c = cards[i], cxx = x0 + i * (cw + gap);
        cx.fillStyle = i === hoverIdx ? "#24242c" : "#16161a"; cx.fillRect(cxx, y0, cw, ch);
        cx.strokeStyle = i === hoverIdx ? "#9FE1CB" : "#3a3a42"; cx.strokeRect(cxx, y0, cw, ch);
        cx.fillStyle = "#e8e8ee"; cx.font = "15px monospace";
        cx.fillText(c.name, cxx + cw / 2, y0 + 34);
        cx.fillStyle = "#8a8a92"; cx.font = "11px monospace";
        wrapText(c.desc, cxx + cw / 2, y0 + 62, cw - 24, 15);
        cx.fillStyle = "#9FE1CB";
        wrapText(c.effect, cxx + cw / 2, y0 + 122, cw - 24, 15);
        cx.fillStyle = "#534AB7"; cx.font = "10px monospace";
        cx.fillText(c.tag, cxx + cw / 2, y0 + ch - 14);
      }
      const tlX = W * 0.12, tlW = W * 0.76;
      let tlY = y0 + ch + 44;
      cx.textAlign = "left";
      cx.fillStyle = "#8a8a92"; cx.font = "11px monospace";
      cx.fillText("the loop — hover a card to see where the new sound lands", tlX, tlY - 8);
      const act = activeIds();
      const tlH = act.length * 11 + 16;
      cx.fillStyle = "#0a0a0e"; cx.fillRect(tlX - 6, tlY, tlW + 12, tlH);
      for (let b = 0; b <= 8; b++) {
        const bx = tlX + (b / 8) * tlW;
        cx.strokeStyle = b % 4 === 0 ? "#3a3a42" : "#26262c"; cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(bx, tlY); cx.lineTo(bx, tlY + tlH); cx.stroke();
      }
      for (let i = 0; i < act.length; i++) {
        const st = STEM_BY_ID[act[i]];
        cx.fillStyle = FX_COL[st.fx];
        for (const ev of st.events) {
          const ex = tlX + (ev.t / LOOP_LEN) * tlW;
          cx.fillRect(ex - 1, tlY + 8 + i * 11, 2.5, 8);
        }
        cx.fillStyle = "#5a5a64"; cx.font = "9px monospace";
        cx.fillText(st.name.slice(0, 10), tlX + tlW + 10, tlY + 15 + i * 11);
      }
      if (hoverIdx >= 0 && cards[hoverIdx] && cards[hoverIdx].kind === "stem") {
        const st = STEM_BY_ID[cards[hoverIdx].id];
        const pulse = 0.55 + 0.45 * Math.sin(ts / 120);
        cx.globalAlpha = pulse;
        cx.fillStyle = FX_COL[st.fx];
        for (const ev of st.events) {
          const ex = tlX + (ev.t / LOOP_LEN) * tlW;
          cx.fillRect(ex - 1.5, tlY - 18, 3, 12);
        }
        cx.globalAlpha = 1;
        cx.fillStyle = FX_COL[st.fx]; cx.font = "10px monospace";
        cx.fillText("new: " + st.name + " (" + cards[hoverIdx].slot + ")", tlX + tlW + 10, tlY - 8);
      }
      const ph = tlX + ((((now - t0) % LOOP_LEN) + LOOP_LEN) % LOOP_LEN) / LOOP_LEN * tlW;
      cx.strokeStyle = "#FAC775"; cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(ph, tlY - 20); cx.lineTo(ph, tlY + tlH); cx.stroke();
    } else {
      cx.fillText("the era turns — pick your branch", W / 2, y0 - 60);
      const n = branchOptions.length;
      const bx0 = W / 2 - (cw * n + gap * (n - 1)) / 2;
      for (let i = 0; i < n; i++) {
        const g = GENRE_BY_ID[branchOptions[i]], cxx = bx0 + i * (cw + gap);
        cx.fillStyle = "#16161a"; cx.fillRect(cxx, y0, cw, ch);
        cx.strokeStyle = "#3C3489"; cx.strokeRect(cxx, y0, cw, ch);
        cx.fillStyle = "#e8e8ee"; cx.font = "17px monospace";
        cx.fillText(g.name, cxx + cw / 2, y0 + 38);
        cx.fillStyle = "#8a8a92"; cx.font = "12px monospace";
        cx.fillText(g.desc, cxx + cw / 2, y0 + 64);
        cx.fillStyle = "#9FE1CB"; cx.font = "11px monospace";
        wrapText(g.bonus, cxx + cw / 2, y0 + 94, cw - 24, 15);
        cx.fillStyle = "#5a5a64"; cx.font = "10px monospace";
        wrapText(Object.keys(g.palette).map(sl => sl + ":" + STEM_BY_ID[g.palette[sl]].name).join(" · "),
                 cxx + cw / 2, y0 + 128, cw - 30, 13);
      }
    }
    cx.textAlign = "left";
  }

  if (dead) {
    cx.fillStyle = "rgba(0,0,0,0.82)"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    cx.fillStyle = "#e8e8ee"; cx.font = "26px monospace";
    cx.fillText("the set got cut short", W / 2, H / 2 - 90);
    cx.font = "14px monospace"; cx.fillStyle = "#8a8a92";
    cx.fillText("survived " + elapsed.toFixed(1) + "s · level " + level +
                " · best " + meta.best.toFixed(1) + "s", W / 2, H / 2 - 56);
    cx.fillStyle = "#9FE1CB";
    cx.fillText("your set: " + path.join(" → "), W / 2, H / 2 - 30);
    cx.fillStyle = "#8a8a92";
    cx.fillText("final mix: " + activeIds().map(id => STEM_BY_ID[id].name).join(", "), W / 2, H / 2 - 6);
    cx.fillStyle = "#CECBF6";
    cx.fillText("genres discovered all-time: " + meta.discovered.length + "/" + GENRES.length +
                " — " + (meta.discovered.join(", ") || "none"), W / 2, H / 2 + 20);
    cx.fillStyle = "#1e1e24"; cx.fillRect(W / 2 - 165, H / 2 + 76, 150, 42);
    cx.fillRect(W / 2 + 15, H / 2 + 76, 150, 42);
    cx.strokeStyle = "#3a3a42";
    cx.strokeRect(W / 2 - 165, H / 2 + 76, 150, 42);
    cx.strokeRect(W / 2 + 15, H / 2 + 76, 150, 42);
    cx.fillStyle = "#e8e8ee"; cx.font = "14px monospace";
    cx.fillText("restart", W / 2 - 90, H / 2 + 102);
    cx.fillText("export set", W / 2 + 90, H / 2 + 102);
    cx.fillStyle = "#5a5a64"; cx.font = "11px monospace";
    cx.fillText("keyboard: R / E", W / 2, H / 2 + 140);
    cx.textAlign = "left";
  }
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "", yy = y;
  for (const w of words) {
    if (cx.measureText(line + w).width > maxW && line) {
      cx.fillText(line, x, yy); line = w + " "; yy += lh;
    } else line += w + " ";
  }
  cx.fillText(line.trim(), x, yy);
}

cx.fillStyle = "#000"; cx.fillRect(0, 0, W, H);
cx.textAlign = "center";
cx.fillStyle = "#e8e8ee"; cx.font = "22px monospace";
cx.fillText("soundsystem", W / 2, H / 2 - 60);
cx.font = "14px monospace"; cx.fillStyle = "#8a8a92";
cx.fillText("click to start · WASD to move · the music does the fighting", W / 2, H / 2 - 28);
cx.fillText("tap movement keys ON the beat to power up your shots", W / 2, H / 2 - 8);
cx.fillText("phone: left = joystick · right = beat taps", W / 2, H / 2 + 12);
cx.fillText("defeat rival soundsystems to travel through music history", W / 2, H / 2 + 32);
if (meta.best > 0) cx.fillText("best: " + meta.best.toFixed(1) + "s · genres: " +
  meta.discovered.length + "/" + GENRES.length, W / 2, H / 2 + 60);
cx.textAlign = "left";
