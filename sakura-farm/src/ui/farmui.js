// sakura-farm glue: HUD + targeting + input + clock + sleep + the seed-stall minigame entry.
// Started by main.js after the world is built. Game rules live in src/game; this file only wires them to the
// player, the DOM and the scene.
import { CLOCK, SPECIES, SPECIES_BY_ID, TOOLS, FARM_RULES } from '../game/data.js';
import { preview } from '../game/farm.js';
import { canSleep, mustSleep, formatTime } from '../game/clock.js';
import { createHud, morningLines } from './hud.js';
import { createTargeting } from './interact.js';

export function startFarmUi(ctx, { player, canvas, isPlaying, shot }) {
  const game = ctx.services.game;
  const hud = createHud();
  const aim = createTargeting(ctx);
  const sfx = makeSfx();
  let target = null;
  let busy = false; // a card / the minigame is open: no clock, no input
  let saveTimer = 0;
  const ui = { hud, game, openMatch3: null, get busy() { return busy; } };

  if (game.loadError) hud.toast('存档无法读取，已经另存一份并开始新游戏', 'warn');

  hud.onSelect = () => {
    sfx.tick();
    hud.render(game);
  };
  const cycleSeed = (step) => {
    const ids = SPECIES.map((s) => s.id);
    let i = ids.indexOf(game.seed);
    for (let n = 0; n < ids.length; n++) {
      i = (i + step + ids.length) % ids.length;
      if (game.state.inventory.seeds[ids[i]] > 0) break;
    }
    game.seed = ids[i];
    hud.tool = 'seeds';
    sfx.tick();
    hud.render(game);
  };

  function promptFor(t) {
    const s = game.state;
    if (!t) return null;
    if (t.kind === 'stall') {
      if (s.tickets > 0) return { ok: true, text: `玩一局消消乐，换种子和农具（券 ${s.tickets}）` };
      const total = SPECIES.reduce((a, sp) => a + s.inventory.produce[sp.id], 0);
      return total >= FARM_RULES.producePerTicket
        ? { ok: true, text: `用 ${FARM_RULES.producePerTicket} 个收获物换一张券` }
        : { ok: false, text: '今天的券用完了', sub: `明早 6:00 恢复；也可以用 ${FARM_RULES.producePerTicket} 个收获物换一张` };
    }
    if (t.kind === 'shed') return canSleep(s.minute) ? { ok: true, text: '睡觉，到明天早上（会自动存档）' } : { ok: false, text: `农具小屋 · ${formatTime(CLOCK.sleepFrom)} 以后可以休息` };
    const p = preview(s, t.plot, hud.tool, game.seed);
    const name = `${'一二三四五六七八'[t.plot]}号田`;
    return p.ok ? { ok: true, text: `${p.label}`, sub: name } : { ok: false, text: p.reason, sub: `${name} · 手里：${TOOLS.find((x) => x.id === hud.tool).name}` };
  }

  async function sleep(forced) {
    busy = true;
    aim.hide();
    hud.prompt(null);
    document.exitPointerLock?.();
    sfx.night();
    await hud.card(`<h2>${forced ? '已经很晚了……' : '晚安'}</h2><p>${forced ? '不知不觉到了半夜，回家睡觉了。' : '在农具小屋里歇下。'}</p>`, { dark: true, wait: false });
    await new Promise((r) => setTimeout(r, shot ? 0 : 1400));
    const r = game.sleep();
    const s = game.state;
    const lines = morningLines(r.events, s);
    await hud.card(`<h2>第 ${s.day} 天 · 早上 6:00 · ${s.weather === 'rain' ? '雨' : '晴'}</h2><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><p>种子摊的券恢复为 ${s.tickets} 张。</p><p class="hint">点击或按 E / 回车 继续</p>`);
    busy = false;
    hud.render(game);
    if (!shot) player.requestLock();
  }

  function use() {
    if (busy || !isPlaying()) return;
    const t = target;
    if (!t) return;
    if (t.kind === 'stall') {
      if (game.state.tickets > 0) {
        if (ui.openMatch3) {
          busy = true;
          document.exitPointerLock?.();
          aim.hide();
          hud.prompt(null);
          ui.openMatch3().finally(() => {
            busy = false;
            hud.render(game);
            player.requestLock();
          });
        }
      } else {
        const r = game.trade();
        if (r.ok) {
          sfx.coin();
          hud.toast('换到一张券', 'good');
        } else hud.toast(r.reason);
      }
      return;
    }
    if (t.kind === 'shed') {
      if (canSleep(game.state.minute)) sleep(false);
      else hud.toast(`${formatTime(CLOCK.sleepFrom)} 以后才能在小屋休息`);
      return;
    }
    const r = game.act(t.plot, hud.tool);
    if (!r.ok) {
      sfx.no();
      hud.toast(r.reason);
      return;
    }
    sfx[hud.tool]?.();
    const h = r.events.find((e) => e.t === 'harvest');
    if (h) hud.toast(`${SPECIES_BY_ID[h.species].produce} ×${h.n} 放进了篮子`, 'good');
    hud.render(game);
  }

  // ------------------------------------------------------------------ input
  addEventListener('keydown', (e) => {
    if (!isPlaying() || busy) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const n = Number(e.code.replace('Digit', ''));
    if (e.code.startsWith('Digit') && !e.shiftKey && n >= 1 && n <= TOOLS.length) hud.select(TOOLS[n - 1].id);
    else if (e.code === 'KeyR' && !e.shiftKey) cycleSeed(1);
    else if (e.code === 'KeyE' && !player.fly) use();
    else if (e.code === 'Tab') {
      e.preventDefault();
      hud.togglePanel(game);
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement === canvas) use();
  });
  addEventListener('wheel', (e) => {
    if (!isPlaying() || busy || document.pointerLockElement !== canvas) return;
    if (hud.tool === 'seeds') cycleSeed(e.deltaY > 0 ? 1 : -1);
    else {
      const i = TOOLS.findIndex((t) => t.id === hud.tool);
      hud.select(TOOLS[(i + (e.deltaY > 0 ? 1 : TOOLS.length - 1)) % TOOLS.length].id);
    }
  }, { passive: true });
  game.subscribe(() => hud.render(game));

  // ------------------------------------------------------------------ per frame: clock, target, prompt
  let lastMinute = -1;
  ctx.onUpdate((dt) => {
    if (isPlaying() && !busy && !shot) {
      game.tick(dt * CLOCK.minutesPerSecond);
      saveTimer += dt;
      if (saveTimer > 20) {
        saveTimer = 0;
        game.save();
      }
      if (mustSleep(game.state.minute)) sleep(true);
    }
    if (busy) return;
    target = isPlaying() || shot ? aim.pick(game.state) : null;
    hud.prompt(promptFor(target));
    const m = Math.floor(game.state.minute);
    if (m !== lastMinute) {
      lastMinute = m;
      hud.render(game);
    }
  });
  hud.render(game);
  return ui;
}

/** Tiny synthesized UI sounds (created on first use, after a user gesture). */
function makeSfx() {
  let ac = null;
  const tone = (f0, f1, dur, type = 'sine', vol = 0.12, delay = 0) => {
    try {
      ac ??= new AudioContext();
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* audio unavailable */
    }
  };
  const noise = (dur, vol = 0.08, hp = 1200) => {
    try {
      ac ??= new AudioContext();
      const b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = b;
      f.type = 'highpass';
      f.frequency.value = hp;
      g.gain.value = vol;
      s.connect(f).connect(g).connect(ac.destination);
      s.start();
    } catch {
      /* audio unavailable */
    }
  };
  return {
    tick: () => tone(880, 1100, 0.05, 'triangle', 0.05),
    no: () => tone(300, 220, 0.12, 'triangle', 0.06),
    hoe: () => noise(0.18, 0.1, 400),
    seeds: () => { tone(660, 700, 0.08, 'sine', 0.06); tone(990, 1040, 0.08, 'sine', 0.05, 0.08); },
    can: () => noise(0.5, 0.06, 2500),
    fert: () => noise(0.25, 0.08, 800),
    shears: () => { tone(2400, 1800, 0.05, 'square', 0.03); tone(2600, 1900, 0.05, 'square', 0.03, 0.09); },
    basket: () => { tone(523, 523, 0.12, 'sine', 0.08); tone(659, 659, 0.12, 'sine', 0.08, 0.1); tone(784, 784, 0.2, 'sine', 0.08, 0.2); },
    coin: () => { tone(988, 988, 0.08, 'square', 0.04); tone(1319, 1319, 0.18, 'square', 0.04, 0.08); },
    night: () => { tone(392, 392, 0.5, 'sine', 0.05); tone(330, 330, 0.7, 'sine', 0.05, 0.3); },
  };
}
