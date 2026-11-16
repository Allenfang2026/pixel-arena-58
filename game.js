// 58 斗兽场: a small turn-based monster duel. Sprites are 58x58 indexed pixels; every move effect is pixelfx code.
import { createFrame, clearFrame, createFx, composite, backdrop, hex } from "./pixelfx/src/core/index.js";
import { SPRITES } from "./sprites.js";
import * as starFall from "./pixelfx/src/fx/arcane/star-fall.js";
import * as manaBurst from "./pixelfx/src/fx/arcane/mana-burst.js";
import * as flamePillar from "./pixelfx/src/fx/fire/flame-pillar.js";
import * as meteor from "./pixelfx/src/fx/fire/meteor.js";
import * as darkExplosion from "./pixelfx/src/fx/shadow/dark-explosion.js";
import * as graspingHands from "./pixelfx/src/fx/shadow/grasping-hands.js";
import * as geyser from "./pixelfx/src/fx/water/geyser.js";
import * as waveCrash from "./pixelfx/src/fx/water/wave-crash.js";
import * as hitSpark from "./pixelfx/src/fx/impacts/hit-spark.js";
import * as critHit from "./pixelfx/src/fx/impacts/crit-hit.js";
import * as bluntHit from "./pixelfx/src/fx/impacts/blunt-hit.js";
import * as zapHit from "./pixelfx/src/fx/lightning/zap-hit.js";
import * as damageNumber from "./pixelfx/src/fx/ui/damage-number.js";
import * as confetti from "./pixelfx/src/fx/ui/confetti.js";

const W = 320, H = 200, GROUND = 164, N = 58;
const $ = (s) => document.querySelector(s);

// ---------- data ----------
const EL = { 幻: "#f780bf", 焰: "#fdae3c", 影: "#8a7cf0", 潮: "#58a1f8", 无: "#c9c4d8" };
const BEATS = { 潮: "焰", 焰: "影", 影: "幻", 幻: "潮" };
// fx: module, hit: seconds until it lands, air: origin is mid-body instead of the floor, o: effect options
const MONS = [
  { id: "m0", name: "绯翼", el: "幻", hp: 112, atk: 1.1, def: 1.05, spd: 9, moves: [
    { name: "星陨", el: "幻", pow: 26, fx: starFall, hit: 0.5 },
    { name: "魔能爆", el: "幻", pow: 21, fx: manaBurst, hit: 0.3 },
    { name: "冲撞", el: "无", pow: 15, fx: bluntHit, hit: 0.05 } ] },
  { id: "m1", name: "炎魁", el: "焰", hp: 115, atk: 1.15, def: 1.0, spd: 5, moves: [
    { name: "炎柱", el: "焰", pow: 24, fx: flamePillar, hit: 0.6, o: { height: 110 } },
    { name: "陨火", el: "焰", pow: 28, fx: meteor, hit: 0.7 },
    { name: "重拳", el: "无", pow: 16, fx: critHit, hit: 0.05 } ] },
  { id: "m2", name: "渊钢", el: "影", hp: 120, atk: 1.0, def: 1.15, spd: 6, moves: [
    { name: "暗爆", el: "影", pow: 27, fx: darkExplosion, hit: 0.6 },
    { name: "影爪", el: "影", pow: 21, fx: graspingHands, hit: 0.5 },
    { name: "电击", el: "无", pow: 15, fx: zapHit, hit: 0.05, air: true } ] },
  { id: "m3", name: "潮刃", el: "潮", hp: 105, atk: 1.05, def: 0.95, spd: 11, moves: [
    { name: "涌泉", el: "潮", pow: 25, fx: geyser, hit: 1.2, o: { height: 90 } },
    { name: "巨浪", el: "潮", pow: 22, fx: waveCrash, hit: 1.3 },
    { name: "斩击", el: "无", pow: 15, fx: hitSpark, hit: 0.05 } ] },
];
const TRAINERS = ["t0", "t1", "t2", "t3", "t4"];

// ---------- sprites ----------
const WHITE = hex("#ffffff");
function prep(s) {
  const pal = s.pal.map((c) => hex(c)), px = new Int8Array(N * N);
  let x0 = N, x1 = 0, y1 = 0;
  for (let i = 0; i < N * N; i++) {
    const ch = s.px[i];
    px[i] = ch === "." ? -1 : parseInt(ch, 36);
    if (px[i] >= 0) { const x = i % N, y = (i / N) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return { pal, css: s.pal, px, cx: (x0 + x1 + 1) / 2, bottom: y1 + 1 };
}
// which way each drawing looks as drawn: 1 = right, -1 = left. A body is mirrored only when that is away from its opponent.
const FACE = { m0: -1, m1: 1, m2: -1, m3: 1, t0: 1, t1: 1, t2: 1, t3: 1, t4: 1 };
const SPR = Object.fromEntries(Object.entries(SPRITES).map(([k, v]) => [k, { ...prep(v), face: FACE[k] }]));

// draw a sprite into the frame's color buffer, feet on footY; sink pushes it into the floor
// The one drawn frame is deformed per pixel, anchored at the feet: sx / sy squash and stretch it, lean shears
// the top sideways, hop lifts it. Nearest-neighbour sampling, so every pixel stays a hard pixel.
function blit(frame, s, cx, footY, { flip = false, flash = false, sink = 0, sx = 1, sy = 1, lean = 0, hop = 0 } = {}) {
  const C = frame.color, hgt = Math.ceil(s.bottom * sy), half = Math.ceil((N * sx) / 2 + Math.abs(lean) * hgt) + 1;
  const base = Math.round(footY - hop + sink), scx = flip ? N - s.cx : s.cx;
  cx = Math.round(cx);
  for (let dy = base - hgt; dy < base; dy++) {
    if (dy < 0 || dy >= footY) continue;
    const v = base - dy - 0.5, row = s.bottom - 1 - Math.floor(v / sy);
    if (row < 0) continue;
    for (let dx = cx - half; dx <= cx + half; dx++) {
      if (dx < 0 || dx >= frame.w) continue;
      const u = Math.floor(scx + (dx + 0.5 - cx - lean * v) / sx);
      if (u < 0 || u >= N) continue;
      const i = s.px[row * N + (flip ? N - 1 - u : u)];
      if (i >= 0) C[dy * frame.w + dx] = flash ? WHITE : s.pal[i];
    }
  }
}
function thumb(canvas, s, flip = false) {
  canvas.width = canvas.height = N;
  const g = canvas.getContext("2d"), im = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0, p = s.px[y * N + (flip ? N - 1 - x : x)];
    if (p < 0) continue;
    const c = s.pal[p];
    im.data[i * 4] = c & 255; im.data[i * 4 + 1] = (c >>> 8) & 255; im.data[i * 4 + 2] = (c >>> 16) & 255; im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}

// ---------- sound ----------
let ac = null;
function sfx(kind) {
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime, g = ac.createGain();
    g.connect(ac.destination);
    if (kind === "hit") {
      const len = 0.18, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      const n = ac.createBufferSource();
      n.buffer = buf; n.connect(g); g.gain.setValueAtTime(0.35, t); n.start(t);
    } else {
      const o = ac.createOscillator(), f = { pick: [660, 880], cast: [220, 440], win: [523, 1046], lose: [330, 110] }[kind] ?? [440, 440];
      o.type = "square"; o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + 0.12);
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); o.start(t); o.stop(t + 0.2);
    }
  } catch {}
}

// ---------- scene ----------
const frame = createFrame(W, H);
const ctx = $("#cv").getContext("2d");
const img = ctx.createImageData(W, H);
const bg = (() => {
  const sky = backdrop("sky", W, H), floor = backdrop("ground", W, H, GROUND), hill = hex("#1b1730"), hill2 = hex("#241e3d");
  for (let x = 0; x < W; x++) {
    const far = GROUND - 26 - Math.round(14 * Math.sin(x / 37) + 8 * Math.sin(x / 13 + 2));
    const near = GROUND - 10 - Math.round(8 * Math.sin(x / 23 + 1) + 4 * Math.sin(x / 9));
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (y >= GROUND) sky[i] = floor[i];
      else if (y >= near) sky[i] = hill2;
      else if (y >= far) sky[i] = hill;
    }
  }
  return sky;
})();

let fxs = [], tweens = [], freeze = 0, shake = 0, time = 0;
let L = null, R = null; // fighters
let trainerL = null, trainerR = null;

// pose: sq squashes (+) or stretches (-), lean tips the top forward (+) or back (-), hop lifts off the floor
const ENEMY_HP = 0.8, ENEMY_DMG = 0.5, HEAL = 0.7;
const fighter = (def, left) => {
  const max = left ? def.hp : Math.round(def.hp * ENEMY_HP);
  return { def, spr: SPR[def.id], left, hp: max, max, x: left ? 104 : 216, off: 0, flash: 0, sink: 0, sq: 0, lean: 0, hop: 0, gone: false, ph: left ? 0 : 2.1 };
};
const person = (id, left) => ({ spr: SPR[id], left, hop: 0, sq: 0, ph: left ? 1 : 3.4 });
const outBack = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
const spring = (k) => (1 - k) * Math.cos(k * 11);            // 1 -> 0 with a wobble
const arc = (k) => Math.sin(k * Math.PI);
function drawBody(b, x, alive = true) {
  const br = alive && freeze <= 0 ? Math.sin(time * 2.4 + b.ph) : 0, sway = alive ? Math.sin(time * 1.1 + b.ph) * 0.025 : 0;
  const dir = b.left ? 1 : -1, sq = b.sq ?? 0;
  blit(frame, b.spr, x, GROUND, {
    flip: b.spr.face !== dir, flash: b.flash > 0, sink: b.sink ?? 0, hop: b.hop,
    sy: 1 - sq + 0.035 * br, sx: 1 + sq * 0.8 - 0.02 * br, lean: dir * ((b.lean ?? 0) + sway),
  });
}
function cheer(p, n = 1) {
  if (p) tween(0.28 * n, (k) => { const q = (k * n) % 1; p.hop = 7 * arc(q); p.sq = k === 1 ? 0 : -0.06 * arc(q); });
}
const spawn = (mod, o) => { const f = createFx(mod, o); fxs.push(f); return f; };
const wait = (s) => new Promise((r) => tweens.push({ t: 0, d: s, fn: null, r }));
const tween = (d, fn) => new Promise((r) => tweens.push({ t: 0, d, fn, r }));

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt;
  for (const tw of tweens) { tw.t += dt; tw.fn?.(Math.min(1, tw.t / tw.d)); }
  tweens = tweens.filter((tw) => (tw.t >= tw.d ? (tw.r(), false) : true));
  if (freeze > 0) freeze -= dt;
  else { for (const f of fxs) f.update(dt); fxs = fxs.filter((f) => !f.done()); }
  shake = Math.max(0, shake - dt * 22);
  for (const f of [L, R]) if (f && f.flash > 0) f.flash -= dt;

  clearFrame(frame);
  for (const f of fxs) f.draw(frame, "back");
  if (trainerL) drawBody(trainerL, 34);
  if (trainerR) drawBody(trainerR, 286);
  for (const f of [R, L]) if (f && !f.gone) drawBody(f, f.x + f.off, f.hp > 0);
  for (const f of fxs) f.draw(frame, "front");
  composite(frame, img.data, bg);
  const sx = shake ? Math.round((Math.random() * 2 - 1) * shake) : 0, sy = shake ? Math.round((Math.random() * 2 - 1) * shake) : 0;
  if (sx || sy) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
  ctx.putImageData(img, sx, sy);
  requestAnimationFrame(loop);
}

// ---------- hud ----------
function hud() {
  for (const [el, f] of [[$("#hpL"), L], [$("#hpR"), R]]) {
    if (!f) continue;
    const k = Math.max(0, f.hp) / f.max;
    el.querySelector(".n").innerHTML = f.left
      ? `${f.def.name}<span class="el" style="background:${EL[f.def.el]}">${f.def.el}</span>`
      : `<span class="el" style="background:${EL[f.def.el]};margin:0 4px 0 0">${f.def.el}</span>${f.def.name}`;
    const bar = el.querySelector("i");
    bar.style.width = k * 100 + "%";
    bar.style.background = k > 0.5 ? "#5ad84a" : k > 0.2 ? "#ffc23d" : "#e0302c";
    el.querySelector(".v").textContent = `${Math.max(0, f.hp)} / ${f.max}`;
  }
}
const say = (t) => ($("#log").textContent = t);
function menu(on) {
  const box = $("#moves");
  if (!box.children.length || box.dataset.id !== L.def.id) {
    box.dataset.id = L.def.id;
    box.innerHTML = "";
    L.def.moves.forEach((m, i) => {
      const b = document.createElement("button");
      b.className = "card";
      b.innerHTML = `<b>${m.name}</b><span class="el" style="background:${EL[m.el]};margin:4px 0 0">${m.el} ${m.pow}</span>`;
      b.onclick = () => turn(i);
      box.append(b);
    });
  }
  for (const b of box.children) b.disabled = !on;
}

// ---------- battle ----------
const mult = (mel, tel) => (BEATS[mel] === tel ? 1.5 : BEATS[tel] === mel ? 0.67 : 1);

async function attack(a, t, m) {
  say(`${a.def.name} 使出 ${m.name}！`);
  sfx("cast");
  const dir = a.left ? 1 : -1;
  cheer(a.left ? trainerL : trainerR);
  // wind-up: crouch and lean away; release: stretch, tip forward and pounce; then settle with a wobble
  await tween(0.24, (k) => { const e = 1 - (1 - k) ** 3; a.off = -dir * 6 * e; a.sq = 0.16 * e; a.lean = -0.14 * e; });
  await tween(0.1, (k) => { a.off = dir * (-6 + 22 * k); a.sq = 0.16 - 0.28 * k; a.lean = -0.14 + 0.42 * k; a.hop = 7 * arc(k * 0.6); });
  tween(0.45, (k) => { const s = spring(k); a.off = dir * 16 * (1 - outBack(k)); a.sq = -0.12 * s; a.lean = 0.28 * s; a.hop = 7 * arc(0.6 + k * 0.4) * (1 - k); })
    .then(() => { a.off = a.sq = a.lean = a.hop = 0; });
  spawn(m.fx, { x: t.x, y: m.air ? GROUND - 26 : GROUND, flip: !a.left, seed: (Math.random() * 999) | 0, ...(m.o ?? {}) });
  await wait(m.hit);

  const k = mult(m.el, t.def.el), crit = Math.random() < 0.12;
  const dmg = Math.max(1, Math.round(m.pow * (a.def.atk / t.def.def) * k * (crit ? 1.5 : 1) * (a.left ? 1 : ENEMY_DMG) * (0.88 + Math.random() * 0.12)));
  t.hp -= dmg;
  freeze = crit || k > 1 ? 0.14 : 0.07;
  shake = crit || k > 1 ? 7 : 4;
  t.flash = 0.14;
  sfx("hit");
  hud();
  spawn(damageNumber, { x: t.x, y: GROUND - 54, text: "-" + dmg, seed: dmg });
  // the target is knocked back: tipped away, flattened, then wobbles upright (or stays down if it is out)
  const big = crit || k > 1 ? 1.4 : 1, dead = t.hp <= 0;
  tween(0.55, (q) => { const s = spring(q); t.off = dir * 9 * big * s; t.lean = -0.3 * big * (dead ? 1 - q * 0.3 : s); t.sq = 0.14 * big * (dead ? 1 : s); })
    .then(() => { if (!dead) t.off = t.lean = t.sq = 0; });
  const note = [crit ? "暴击！" : "", k > 1 ? "效果拔群！" : k < 1 ? "效果不太好…" : ""].join("");
  if (note) say(note);
  await wait(1.0);
  if (t.hp <= 0) {
    say(`${t.def.name} 倒下了！`);
    const sq0 = t.sq, ln0 = t.lean;
    await tween(0.45, (q) => { t.sq = sq0 + (0.55 - sq0) * q * q; t.lean = ln0 + (-0.5 - ln0) * q; });   // slumps flat
    await tween(0.6, (q) => (t.sink = Math.round(q * q * 40)));
    t.gone = true;
    await wait(0.3);
    return true;
  }
  return false;
}

function aiMove(e, p) {
  const scored = e.def.moves.map((m) => m.pow * mult(m.el, p.def.el) * (0.7 + Math.random() * 0.6));
  return e.def.moves[scored.indexOf(Math.max(...scored))];
}

let queue = [], busy = true;
async function turn(i) {
  if (busy) return;
  busy = true; menu(false); sfx("pick");
  const pm = L.def.moves[i], em = aiMove(R, L);
  const order = L.def.spd >= R.def.spd ? [[L, R, pm], [R, L, em]] : [[R, L, em], [L, R, pm]];
  for (const [a, t, m] of order) {
    if (a.hp <= 0) continue;
    if (await attack(a, t, m)) break;
  }
  if (R.hp <= 0) return queue.length ? nextEnemy(true) : finish(true);
  if (L.hp <= 0) return finish(false);
  say("轮到你了");
  busy = false; menu(true);
}

async function nextEnemy(heal) {
  if (heal) {
    L.hp = Math.min(L.max, L.hp + Math.round(L.max * HEAL));
    hud();
    say(`${L.def.name} 喘了口气，体力回复`);
    cheer(L, 2); cheer(trainerL, 2);
    await wait(0.8);
  }
  const { mon, tr } = queue.shift();
  trainerR = person(tr, false);
  R = fighter(mon, false);
  R.hop = 150;
  hud();
  say(`对手派出了 ${mon.name}！`);
  cheer(trainerR);
  await tween(0.35, (k) => { R.hop = 150 * (1 - k * k); R.sq = -0.15; });          // drops in, stretched
  shake = 3; sfx("hit");
  await tween(0.5, (k) => { R.hop = 0; R.sq = 0.3 * spring(k); });                  // lands flat, bounces back
  R.sq = 0;
  await wait(0.2);
  say("轮到你了");
  busy = false; menu(true);
}

async function finish(won) {
  $("#moves").style.display = "none";
  $("#end").style.display = "block";
  if (won) {
    say("三连胜，你赢了！");
    sfx("win");
    cheer(L, 5); cheer(trainerL, 5);
    spawn(confetti, { x: 100, y: GROUND, seed: 3 });
    await wait(0.4);
    spawn(confetti, { x: 220, y: GROUND, seed: 8 });
  } else {
    say("你的搭档倒下了…");
    sfx("lose");
  }
}

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("on", s.id === id);
}
let myTrainer = "t0";
function start() {
  show("s-trainer");
  $("#moves").style.display = ""; $("#end").style.display = "none"; $("#moves").innerHTML = "";
  L = R = trainerL = trainerR = null; fxs = []; busy = true;
}
for (const t of TRAINERS) {
  const b = document.createElement("button"), c = document.createElement("canvas");
  b.className = "card"; b.setAttribute("aria-label", "训练师 " + t);
  thumb(c, SPR[t]); b.append(c);
  b.onclick = () => { myTrainer = t; sfx("pick"); show("s-mon"); };
  $("#trainers").append(b);
}
for (const m of MONS) {
  const b = document.createElement("button"), c = document.createElement("canvas");
  b.className = "card";
  thumb(c, SPR[m.id]); b.append(c);
  b.insertAdjacentHTML("beforeend", `<b>${m.name}<span class="el" style="background:${EL[m.el]}">${m.el}</span></b><small>体力 ${m.hp} · 速度 ${m.spd}</small>`);
  b.onclick = () => {
    sfx("pick");
    const rank = (x) => (BEATS[m.el] === x.el ? 0 : BEATS[x.el] === m.el ? 2 : 1); // easy first, the counter last
    const foes = MONS.filter((x) => x !== m).sort((a, b) => rank(a) - rank(b));
    const trs = TRAINERS.filter((x) => x !== myTrainer).sort(() => Math.random() - 0.5);
    queue = foes.map((mon, i) => ({ mon, tr: trs[i] }));
    trainerL = person(myTrainer, true);
    L = fighter(m, true);
    show("s-battle");
    hud(); menu(false);
    nextEnemy(false);
  };
  $("#mons").append(b);
}
$("#again").onclick = start;
start();
requestAnimationFrame(loop);

// debug handle for automated checks
window.__game = { get L() { return L; }, get R() { return R; }, get busy() { return busy; }, get queue() { return queue; } };
