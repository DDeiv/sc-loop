"use strict";
const cv = document.getElementById("c");
const cx = cv.getContext("2d");
let W, H;
function fit() {
  W = cv.width = Math.min(window.innerWidth, 1100);
  H = cv.height = Math.min(window.innerHeight - 30, 640);
}
fit(); window.addEventListener("resize", fit);

const keys = {};
window.addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

let audio = null, t0 = 0, started = false, dead = false;
let player, enemies, shots, waves, particles, evIdx, loopN, startTime;
let lastSkankDir = 0, kickFlash = 0, hitFlash = 0;

function reset() {
  player = { x: W / 2, y: H / 2, r: 13, hp: 5, iframe: 0, dirX: 1, dirY: 0 };
  enemies = []; shots = []; waves = []; particles = [];
  evIdx = 0; loopN = 0; dead = false;
  startTime = audio ? audio.currentTime : 0;
  if (audio) { t0 = audio.currentTime + 0.12; }
}

function b64ToBuf(b64) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function startAudio() {
  audio = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await audio.decodeAudioData(b64ToBuf(LOOP_WAV_B64));
  const src = audio.createBufferSource();
  src.buffer = buf; src.loop = true;
  src.connect(audio.destination);
  t0 = audio.currentTime + 0.12;
  src.start(t0);
  started = true;
  reset();
  t0 = audio.currentTime + 0.05;
  requestAnimationFrame(frame);
}

cv.addEventListener("click", () => { if (!started) startAudio(); });

function nearestEnemy() {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function aimAt(spread) {
  const t = nearestEnemy();
  let a;
  if (t) a = Math.atan2(t.y - player.y, t.x - player.x);
  else a = Math.atan2(player.dirY, player.dirX);
  return a + (spread || 0);
}

function fire(ev) {
  const px = player.x, py = player.y;
  if (ev.type === "kick") {
    const a = aimAt(0);
    shots.push({ x: px, y: py, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
                 r: 8, dmg: 3, col: "#FAC775", pierce: 2, life: 2 });
    kickFlash = 1;
  } else if (ev.type === "sub") {
    waves.push({ x: px, y: py, r: 10, max: 150, dmg: 1, hitset: new Set() });
  } else if (ev.type === "hat") {
    const a = aimAt((Math.random() - 0.5) * 0.25);
    shots.push({ x: px, y: py, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430,
                 r: 3, dmg: 1, col: "#B4B2A9", pierce: 0, life: 1.6 });
  } else if (ev.type === "rim") {
    const a = aimAt(0);
    shots.push({ x: px, y: py, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
                 r: 4.5, dmg: 2, col: "#F0997B", pierce: 0, life: 3, homing: true });
  } else if (ev.type === "skank") {
    lastSkankDir = aimAt(0);
    for (const s of [-0.35, 0, 0.35]) {
      const a = lastSkankDir + s;
      shots.push({ x: px, y: py, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
                   r: 3.5, dmg: 1, col: "#9FE1CB", pierce: 0, life: 1.6 });
    }
  } else if (ev.type === "echo") {
    for (const s of [-0.35, 0, 0.35]) {
      const a = lastSkankDir + s;
      shots.push({ x: px, y: py, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
                   r: 2.5, dmg: ev.gain > 0.3 ? 1 : 0.5, col: "#5DCAA5",
                   pierce: 0, life: 1.2, ghost: true });
    }
  }
}

function spawnEnemy(elapsed) {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = -20; y = Math.random() * H; }
  else if (side === 1) { x = W + 20; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = -20; }
  else { x = Math.random() * W; y = H + 20; }
  const big = Math.random() < Math.min(0.12, elapsed / 400);
  enemies.push({
    x, y, s: big ? 26 : 15 + Math.random() * 6,
    hp: (big ? 6 : 2) + Math.floor(elapsed / 45),
    spd: (big ? 42 : 55) + Math.random() * 25 + elapsed * 0.35,
    px: 0, py: 0
  });
}

let spawnAcc = 0, last = 0;
function frame(ts) {
  const now = audio.currentTime;
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  const elapsed = now - startTime;

  if (!dead) {
    let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (mx || my) {
      const n = Math.hypot(mx, my);
      player.dirX = mx / n; player.dirY = my / n;
      player.x = Math.max(14, Math.min(W - 14, player.x + mx / n * 240 * dt));
      player.y = Math.max(14, Math.min(H - 14, player.y + my / n * 240 * dt));
    }
    player.iframe = Math.max(0, player.iframe - dt);

    while (true) {
      const ev = SCHEDULE[evIdx];
      const abs = t0 + loopN * LOOP_LEN + ev.t;
      if (abs > now) break;
      if (abs > now - 0.25) fire(ev);
      evIdx++;
      if (evIdx >= SCHEDULE.length) { evIdx = 0; loopN++; }
    }

    spawnAcc += dt;
    const interval = Math.max(0.25, 1.15 - elapsed * 0.012);
    while (spawnAcc > interval) { spawnAcc -= interval; spawnEnemy(elapsed); }

    for (const e of enemies) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      e.px *= 0.88; e.py *= 0.88;
      e.x += (Math.cos(a) * e.spd + e.px) * dt;
      e.y += (Math.sin(a) * e.spd + e.py) * dt;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < e.s / 2 + player.r - 2 && player.iframe <= 0) {
        player.hp--; player.iframe = 0.8; hitFlash = 1;
        if (player.hp <= 0) dead = true;
      }
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
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < e.s / 2 + s.r) {
          e.hp -= s.dmg;
          if (s.pierce > 0) s.pierce--; else s.life = 0;
          if (e.hp <= 0)
            for (let i = 0; i < 6; i++)
              particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 180,
                               vy: (Math.random() - 0.5) * 180, life: 0.4 });
          break;
        }
      }
    }
    shots = shots.filter(s => s.life > 0 && s.x > -30 && s.x < W + 30 && s.y > -30 && s.y < H + 30);

    for (const w of waves) {
      w.r += 320 * dt;
      for (const e of enemies) {
        const d = Math.hypot(e.x - w.x, e.y - w.y);
        if (Math.abs(d - w.r) < 22 && !w.hitset.has(e)) {
          w.hitset.add(e); e.hp -= w.dmg;
          const a = Math.atan2(e.y - w.y, e.x - w.x);
          e.px += Math.cos(a) * 340; e.py += Math.sin(a) * 340;
        }
      }
    }
    waves = waves.filter(w => w.r < w.max);
    enemies = enemies.filter(e => e.hp > 0);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
  } else if (keys.r) { reset(); }

  kickFlash = Math.max(0, kickFlash - dt * 4);
  hitFlash = Math.max(0, hitFlash - dt * 3);
  cx.fillStyle = `rgb(${22 + kickFlash * 14 + hitFlash * 40}, ${22 + kickFlash * 12}, ${26 + kickFlash * 10})`;
  cx.fillRect(0, 0, W, H);

  const beat = ((now - t0) / (60 / LOOP_BPM)) % 8;
  for (let i = 0; i < 8; i++) {
    cx.fillStyle = Math.floor(beat) === i ? "#FAC775" : "#3a3a42";
    cx.beginPath(); cx.arc(W / 2 - 84 + i * 24, 22, Math.floor(beat) === i ? 6 : 4, 0, 7); cx.fill();
  }

  for (const w of waves) {
    cx.strokeStyle = "rgba(127,119,221,0.6)"; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(w.x, w.y, w.r, 0, 7); cx.stroke();
  }
  for (const e of enemies) {
    cx.fillStyle = e.s > 22 ? "#E24B4A" : "#c2453f";
    cx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
  }
  for (const s of shots) {
    cx.globalAlpha = s.ghost ? 0.55 : 1;
    cx.fillStyle = s.col;
    cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 7); cx.fill();
    cx.globalAlpha = 1;
  }
  for (const p of particles) {
    cx.fillStyle = `rgba(226,75,74,${p.life * 2})`;
    cx.fillRect(p.x - 2, p.y - 2, 4, 4);
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

  cx.fillStyle = "#8a8a92"; cx.font = "13px monospace";
  cx.fillText("hp " + "■".repeat(Math.max(0, player.hp)), 14, 24);
  cx.fillText(elapsed.toFixed(1) + "s", W - 70, 24);
  if (dead) {
    cx.fillStyle = "#e8e8ee"; cx.font = "26px monospace"; cx.textAlign = "center";
    cx.fillText("the track ends here", W / 2, H / 2 - 14);
    cx.font = "15px monospace";
    cx.fillText("survived " + elapsed.toFixed(1) + "s — press R", W / 2, H / 2 + 16);
    cx.textAlign = "left";
  }
  requestAnimationFrame(frame);
}

cx.fillStyle = "#16161a"; cx.fillRect(0, 0, W, H);
cx.fillStyle = "#e8e8ee"; cx.font = "22px monospace"; cx.textAlign = "center";
cx.fillText("click to start the soundsystem", W / 2, H / 2);
cx.textAlign = "left";
