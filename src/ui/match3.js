// Seed-stall minigame (sakura-farm, docs/DESIGN.md §6): a 7×7 match-3 that only produces seeds and farm tools.
// DOM overlay in the paper/navy HUD style. Rules come from src/game/match3 (pure); this file draws the board,
// takes swaps (drag, click-click or keyboard) and animates the engine's step records.
import { MATCH3, SPECIES } from '../game/data.js';
import { makeRng } from '../game/rng.js';
import { N, idx, pos, generate, isValidSwap, play, hint } from '../game/match3/engine.js';
import { emptyTally, addGained, roundRewards } from '../game/match3/rewards.js';
import { ICONS } from './icons.js';

const INK = '#3a3346';
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
const petals = (n, r, rx, ry, fill) =>
  Array.from({ length: n }, (_, i) => `<ellipse cx="24" cy="${24 - r}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="2" transform="rotate(${(360 / n) * i} 24 24)"/>`).join('');

/** One tile face per species (SPECIES order), readable by shape as well as colour. */
const FACES = [
  // sakura: five notched pink petals
  svg(`${Array.from({ length: 5 }, (_, i) => `<path d="M24 24 Q15 14 20 6 L24 10 L28 6 Q33 14 24 24 Z" fill="#f2b5c8" stroke="${INK}" stroke-width="2" stroke-linejoin="round" transform="rotate(${72 * i} 24 24)"/>`).join('')}<circle cx="24" cy="24" r="4" fill="#e0607e" stroke="${INK}" stroke-width="1.6"/>`),
  // ume: five round white petals, yellow stamens
  svg(`${petals(5, 9, 7.5, 7.5, '#fbf6f7')}<circle cx="24" cy="24" r="4.2" fill="#f2c230" stroke="${INK}" stroke-width="1.6"/>`),
  // momiji: seven-pointed red leaf
  svg(`<path d="M24 6 L27 17 L36 10 L32 21 L43 21 L33 27 L39 35 L28 31 L24 42 L20 31 L9 35 L15 27 L5 21 L16 21 L12 10 L21 17 Z" fill="#d9485a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M24 42 L24 20" stroke="#9c2c3c" stroke-width="1.6"/>`),
  // kaki: squat persimmon with a square calyx
  svg(`<ellipse cx="24" cy="27" rx="15" ry="13" fill="#f29a5c" stroke="${INK}" stroke-width="2"/><path d="M16 16 L24 13 L32 16 L29 20 L24 18 L19 20 Z" fill="#6f8f4a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="18" cy="26" rx="3" ry="4" fill="#fbc79c"/>`),
  // mikan: round citrus with a leaf
  svg(`<circle cx="24" cy="27" r="14" fill="#f2c230" stroke="${INK}" stroke-width="2"/><path d="M24 13 Q30 5 37 9 Q32 16 24 13 Z" fill="#78a85c" stroke="${INK}" stroke-width="1.8"/><circle cx="19" cy="23" r="3" fill="#fbe39a"/><g fill="#d9a21e"><circle cx="28" cy="30" r="1"/><circle cx="23" cy="34" r="1"/><circle cx="31" cy="24" r="1"/></g>`),
  // matsu: pine cone
  svg(`<path d="M24 7 Q37 18 33 33 Q29 42 24 42 Q19 42 15 33 Q11 18 24 7 Z" fill="#a0764d" stroke="${INK}" stroke-width="2"/><path d="M17 20 Q24 25 31 20 M15 27 Q24 32 33 27 M16 34 Q24 39 32 34 M24 9 L24 41" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M20 7 L24 3 L28 7" stroke="#5f8a58" stroke-width="3" fill="none" stroke-linecap="round"/>`),
];

const BADGE = {
  canH: `<span class="m3-badge m3-can h">${ICONS.can}</span>`,
  canV: `<span class="m3-badge m3-can v">${ICONS.can}</span>`,
  fert: `<span class="m3-badge">${ICONS.fert}</span>`,
};

/**
 * Open one round. Spends a ticket, plays MATCH3.moves swaps, then grants `roundRewards` via game.reward.
 * Resolves (with the rewards, or null if no ticket) when the summary is dismissed.
 */
export function openMatch3(game, { reducedMotion = false } = {}) {
  const t0 = game.useTicket();
  if (!t0.ok) return Promise.resolve(null);
  const s = game.state;
  const rng = makeRng((s.rng ^ Math.imul(s.day, 0x9e3779b1) ^ Math.imul(s.tickets + 1, 0x85ebca6b)) >>> 0);
  let board = generate(rng);
  let tally = emptyTally();
  let moves = MATCH3.moves;
  let busy = false;
  let sel = -1;
  let cursor = idx(3, 3);
  let hintTimer = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

  const root = document.createElement('div');
  root.className = 'm3';
  root.innerHTML = `
    <div class="m3-card" role="dialog" aria-modal="true" aria-label="种子摊消消乐">
      <header><h2>种子摊 · 消消乐</h2><div class="m3-moves"><b></b><small>步</small></div></header>
      <p class="m3-sub">三个一样的连成一排就能消除。攒够点数换种子；四连得水壶、L/T 形得肥料、五连得剪刀。</p>
      <div class="m3-wrap"><div class="m3-board" tabindex="0" aria-label="棋盘，方向键移动，空格选择"></div></div>
      <div class="m3-tally"></div>
      <footer><button type="button" class="m3-quit">提前结束</button></footer>
    </div>
    <div class="m3-end" hidden><div class="m3-card"></div></div>`;
  document.body.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const boardEl = $('.m3-board');
  const els = new Map(); // tile id → element

  const place = (el, i, lift = 0) => {
    const { x, y } = pos(i);
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', y - lift);
    el.dataset.i = i;
  };
  const makeTile = (t, i, lift = 0) => {
    const el = document.createElement('div');
    el.className = `m3-tile${t.special ? ` sp ${t.special}` : ''}`;
    el.innerHTML = t.special === 'shears' ? `<span class="m3-face">${ICONS.shears}</span>` : `<span class="m3-face">${FACES[t.kind]}</span>${BADGE[t.special] ?? ''}`;
    el.style.setProperty('--c', t.kind >= 0 ? SPECIES[t.kind].color : '#c9ced3');
    place(el, i, lift);
    boardEl.appendChild(el);
    els.set(t.id, el);
    return el;
  };
  const tileEl = (i) => els.get(board[i].id);
  board.forEach((t, i) => makeTile(t, i));

  function renderTally() {
    const pts = roundRewards(tally, game.state.seedPoints);
    $('.m3-moves b').textContent = moves;
    $('.m3-tally').innerHTML =
      SPECIES.map((sp, k) => {
        const have = (game.state.seedPoints[sp.id] ?? 0) + tally.tiles[k];
        const frac = (have % sp.seedPoints) / sp.seedPoints;
        return `<div class="m3-seed" style="--c:${sp.color};--f:${frac}"><span class="m3-mini">${FACES[k]}</span><span class="m3-bar"><i></i></span><b>${pts.seeds[sp.id] ? `+${pts.seeds[sp.id]}` : ''}</b><small>${sp.name}</small></div>`;
      }).join('') +
      `<div class="m3-tools"><span>${ICONS.can}<b>+${pts.water}</b></span><span>${ICONS.fert}<b>+${pts.fert}</b></span><span>${ICONS.shears}<b>+${pts.shears}</b></span></div>`;
  }

  function mark() {
    for (const el of els.values()) el.classList.remove('sel', 'cur', 'hint');
    if (sel >= 0) tileEl(sel)?.classList.add('sel');
    if (document.activeElement === boardEl) tileEl(cursor)?.classList.add('cur');
  }
  function armHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (busy) return;
      const h = hint(board);
      if (h) for (const i of h) tileEl(i)?.classList.add('hint');
    }, 5000);
  }

  async function trySwap(a, c) {
    if (busy || moves <= 0) return;
    sel = -1;
    mark();
    if (!isValidSwap(board, a, c)) {
      // bounce back
      const ea = tileEl(a), ec = tileEl(c);
      if (!ea || !ec) return;
      busy = true;
      place(ea, c);
      place(ec, a);
      await wait(150);
      place(ea, a);
      place(ec, c);
      ea.classList.add('no');
      await wait(200);
      ea.classList.remove('no');
      busy = false;
      armHint();
      return;
    }
    busy = true;
    clearTimeout(hintTimer);
    const r = play(board, a, c, rng);
    moves--;
    place(tileEl(a), c);
    place(tileEl(c), a);
    await wait(170);
    for (const st of r.steps) {
      for (const f of st.fired) {
        const burst = document.createElement('div');
        burst.className = `m3-burst ${f.special}`;
        place(burst, f.at);
        boardEl.appendChild(burst);
        setTimeout(() => burst.remove(), reducedMotion ? 0 : 520);
      }
      for (const { tile } of st.cleared) els.get(tile.id)?.classList.add('pop');
      await wait(220);
      for (const { tile } of st.cleared) {
        els.get(tile.id)?.remove();
        els.delete(tile.id);
      }
      for (const { at, tile } of st.created) makeTile(tile, at).classList.add('born');
      for (const f of st.fall) {
        const el = els.get(f.id);
        if (el) place(el, f.to);
      }
      const spawned = st.spawn.map(({ at, tile, above }) => ({ el: makeTile(tile, at, above + 0.2), at }));
      boardEl.offsetWidth; // commit the lifted start positions before animating the drop
      for (const { el, at } of spawned) place(el, at);
      await wait(260);
    }
    board = r.board;
    if (r.shuffled) {
      for (const el of els.values()) el.remove();
      els.clear();
      board.forEach((t, i) => makeTile(t, i).classList.add('born'));
    }
    tally = addGained(tally, r.gained);
    renderTally();
    busy = false;
    if (moves <= 0) finish();
    else armHint();
  }

  // ---- input: drag, click-click, keyboard
  let down = null;
  boardEl.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.m3-tile');
    if (!t || busy) return;
    down = { i: Number(t.dataset.i), x: e.clientX, y: e.clientY, used: false };
    boardEl.setPointerCapture?.(e.pointerId);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!down || down.used) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const size = boardEl.clientWidth / N;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.35) return;
    down.used = true;
    const { x, y } = pos(down.i);
    const [nx, ny] = Math.abs(dx) > Math.abs(dy) ? [x + Math.sign(dx), y] : [x, y + Math.sign(dy)];
    if (nx >= 0 && ny >= 0 && nx < N && ny < N) trySwap(down.i, idx(nx, ny));
  });
  boardEl.addEventListener('pointerup', () => {
    if (!down) return;
    if (!down.used) pick(down.i);
    down = null;
  });
  function pick(i) {
    if (busy) return;
    cursor = i;
    if (sel < 0) sel = i;
    else if (sel === i) sel = -1;
    else {
      const p = pos(sel), q = pos(i);
      if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1) return trySwap(sel, i);
      sel = i;
    }
    mark();
  }
  boardEl.addEventListener('keydown', (e) => {
    const { x, y } = pos(cursor);
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (d) {
      e.preventDefault();
      const nx = Math.min(N - 1, Math.max(0, x + d[0])), ny = Math.min(N - 1, Math.max(0, y + d[1]));
      cursor = idx(nx, ny);
      mark();
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      pick(cursor);
    }
  });
  boardEl.addEventListener('focus', mark);
  boardEl.addEventListener('blur', mark);
  $('.m3-quit').addEventListener('click', () => {
    if (!busy) finish();
  });

  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let finished = false;
  async function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(hintTimer);
    const rewards = roundRewards(tally, game.state.seedPoints);
    game.reward(rewards);
    const got = SPECIES.filter((sp) => rewards.seeds[sp.id]).map((sp) => `<li><span class="m3-mini">${FACES[SPECIES.indexOf(sp)]}</span>${sp.name}的种子 ×${rewards.seeds[sp.id]}</li>`);
    if (rewards.water) got.push(`<li><span class="m3-mini">${ICONS.can}</span>水 ×${rewards.water}</li>`);
    if (rewards.fert) got.push(`<li><span class="m3-mini">${ICONS.fert}</span>肥料 ×${rewards.fert}</li>`);
    if (rewards.shears) got.push(`<li><span class="m3-mini">${ICONS.shears}</span>剪刀 ×${rewards.shears}</li>`);
    const end = $('.m3-end');
    end.hidden = false;
    end.firstElementChild.innerHTML = `<h2>这一局的收获</h2>${got.length ? `<ul>${got.join('')}</ul>` : '<p>这次没攒够一颗种子——点数会留到下一局。</p>'}
      <p class="m3-note">没用完的点数已经存下，下次接着攒。</p><button type="button" class="m3-ok">收下</button>`;
    const ok = end.querySelector('.m3-ok');
    ok.focus();
    const close = () => {
      removeEventListener('keydown', onKey, true);
      root.remove();
      resolveDone(rewards);
    };
    const onKey = (e) => {
      if (['Enter', 'Space', 'KeyE', 'Escape'].includes(e.code)) {
        e.preventDefault();
        close();
      }
    };
    ok.addEventListener('click', close);
    setTimeout(() => addEventListener('keydown', onKey, true), 300);
  }

  renderTally();
  boardEl.focus();
  armHint();
  window.__m3 = { get board() { return board; }, get moves() { return moves; }, get busy() { return busy; }, swap: trySwap, hint: () => hint(board), finish };
  return done;
}
