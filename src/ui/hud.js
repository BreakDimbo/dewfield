// Farm HUD (sakura-farm): hotbar, action prompt, day/clock/weather chip, tickets, bag & field-guide panel,
// toasts and the morning report. Plain DOM; styles in src/ui/farm.css. No game rules here — it only reads state.
import { SPECIES, SPECIES_BY_ID, TOOLS, STAGE_NAMES } from '../game/data.js';
import { formatTime } from '../game/clock.js';
import { ICONS } from './icons.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export function createHud(root = document.body) {
  const wrap = el('div', 'fh');
  wrap.innerHTML = `
    <div class="fh-top">
      <div class="fh-chip fh-day"><span class="fh-wx"></span><b class="fh-date"></b><span class="fh-time"></span></div>
      <div class="fh-chip fh-tix" title="种子摊的券"><span class="fh-ico">${ICONS.ticket}</span><b class="fh-tix-n"></b></div>
    </div>
    <div class="fh-prompt" role="status" aria-live="polite"></div>
    <div class="fh-bar" role="toolbar" aria-label="快捷栏"></div>
    <div class="fh-seedpick"></div>
    <div class="fh-toasts"></div>
    <aside class="fh-panel" hidden aria-label="背包与图鉴"></aside>
    <div class="fh-veil" hidden><div class="fh-card"></div></div>`;
  root.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const bar = $('.fh-bar');
  const slots = TOOLS.map((t) => {
    const b = el('button', 'fh-slot');
    b.type = 'button';
    b.dataset.tool = t.id;
    b.innerHTML = `<span class="fh-key">${t.slot}</span><span class="fh-ico"></span><span class="fh-n"></span><span class="fh-name">${t.name}</span>`;
    bar.appendChild(b);
    return b;
  });

  const hud = {
    el: wrap,
    tool: 'hoe',
    onSelect: null,
    render(game) {
      const s = game.state;
      const inv = s.inventory;
      $('.fh-date').textContent = `第 ${s.day} 天`;
      $('.fh-time').textContent = formatTime(s.minute);
      $('.fh-wx').innerHTML = s.minute >= 19 * 60 ? ICONS.moon : s.weather === 'rain' ? ICONS.rain : ICONS.sun;
      $('.fh-tix-n').textContent = `${s.tickets}`;
      const seed = SPECIES_BY_ID[game.seed];
      const counts = {
        hoe: '',
        seeds: inv.seeds[game.seed] ?? 0,
        can: inv.water,
        fert: inv.fert,
        shears: inv.shears,
        basket: SPECIES.reduce((a, sp) => a + inv.produce[sp.id], 0) || '',
      };
      slots.forEach((b) => {
        const id = b.dataset.tool;
        b.querySelector('.fh-ico').innerHTML = id === 'seeds' ? ICONS.seeds(seed.color) : ICONS[id];
        b.querySelector('.fh-n').textContent = counts[id] === '' ? '' : `${counts[id]}`;
        b.classList.toggle('on', id === hud.tool);
        b.classList.toggle('empty', counts[id] === 0);
        if (id === 'seeds') b.querySelector('.fh-name').textContent = `${seed.name}的种子`;
      });
      const pick = $('.fh-seedpick');
      pick.hidden = hud.tool !== 'seeds';
      pick.innerHTML = SPECIES.map((sp) => `<span class="${sp.id === game.seed ? 'on' : ''} ${inv.seeds[sp.id] ? '' : 'none'}" style="--c:${sp.color}">${sp.name}<i>${inv.seeds[sp.id]}</i></span>`).join('') + '<em>R / 滚轮 切换</em>';
      if (!$('.fh-panel').hidden) hud.renderPanel(game);
    },
    select(tool) {
      hud.tool = tool;
      hud.onSelect?.(tool);
    },
    prompt(p) {
      const e = $('.fh-prompt');
      if (!p) {
        e.hidden = true;
        return;
      }
      e.hidden = false;
      e.classList.toggle('no', !p.ok);
      e.innerHTML = p.ok ? `<kbd>左键</kbd><kbd>E</kbd><span>${p.text}</span>` : `<span>${p.text}</span>`;
      if (p.sub) e.innerHTML += `<small>${p.sub}</small>`;
    },
    toast(text, kind = '') {
      const t = el('div', `fh-toast ${kind}`, text);
      $('.fh-toasts').appendChild(t);
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3200);
    },
    togglePanel(game) {
      const p = $('.fh-panel');
      p.hidden = !p.hidden;
      if (!p.hidden) hud.renderPanel(game);
      return !p.hidden;
    },
    renderPanel(game) {
      const s = game.state;
      const inv = s.inventory;
      const rows = SPECIES.map((sp) => {
        const done = s.dex.matured[sp.id];
        return `<tr class="${done ? 'done' : ''}"><th style="--c:${sp.color}">${sp.name}</th>
          <td>${inv.seeds[sp.id]}</td><td>${inv.produce[sp.id]}</td><td>${done ? '✓ 已长成' : '—'}</td></tr>`;
      }).join('');
      const plots = s.plots.map((p, i) => `<li><b>${'一二三四五六七八'[i]}</b>${p.species ? `${SPECIES_BY_ID[p.species].name} · ${STAGE_NAMES[p.stage]}${p.watered ? ' · 已浇水' : ''}${p.produce ? ` · 可收获 ${p.produce}` : ''}` : STAGE_NAMES[p.stage]}</li>`).join('');
      $('.fh-panel').innerHTML = `
        <h2>背包 · 图鉴 <small>Tab 关闭</small></h2>
        <table><thead><tr><th>树种</th><th>种子</th><th>收获物</th><th>图鉴</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="fh-tools">水 ${inv.water} · 肥料 ${inv.fert} · 剪刀 ${inv.shears} · 券 ${s.tickets}</p>
        <h3>田地</h3><ul class="fh-plots">${plots}</ul>
        <p class="fh-goal">目标：六种树都长成成树（${SPECIES.filter((sp) => s.dex.matured[sp.id]).length} / 6）</p>`;
    },
    /** Full-screen card (sleep, morning report). Resolves when dismissed (click / key). */
    card(html, { dark = false, wait = true } = {}) {
      const v = $('.fh-veil');
      v.hidden = false;
      v.classList.toggle('dark', dark);
      $('.fh-card').innerHTML = html;
      if (!wait) return Promise.resolve();
      return new Promise((resolve) => {
        const done = (e) => {
          if (e.type === 'keydown' && !['Enter', 'Space', 'KeyE', 'Escape'].includes(e.code)) return;
          removeEventListener('keydown', done, true);
          v.removeEventListener('click', done);
          v.hidden = true;
          resolve();
        };
        setTimeout(() => {
          addEventListener('keydown', done, true);
          v.addEventListener('click', done);
        }, 350);
      });
    },
    hideCard() {
      $('.fh-veil').hidden = true;
    },
  };
  slots.forEach((b) => b.addEventListener('click', () => hud.select(b.dataset.tool)));
  return hud;
}

/** Morning report lines from nextDay events. */
export function morningLines(events, state) {
  const out = [];
  const grew = events.filter((e) => e.t === 'grow');
  for (const e of grew) out.push(`${'一二三四五六七八'[e.plot]}号田的${SPECIES_BY_ID[e.species].name}长成了<b>${STAGE_NAMES[e.to]}</b>`);
  for (const e of events.filter((x) => x.t === 'firstMature')) out.push(`<b class="gold">图鉴 · ${SPECIES_BY_ID[e.species].name}</b> 第一次长成成树！`);
  for (const e of events.filter((x) => x.t === 'produce')) out.push(`${'一二三四五六七八'[e.plot]}号田结出了${SPECIES_BY_ID[e.species].produce} ×${e.n}`);
  if (events.some((e) => e.t === 'rain')) out.push('下雨了：所有种了树的田都已经浇好水');
  if (!grew.length && !events.some((e) => e.t === 'produce')) out.push(state.plots.some((p) => p.species) ? '夜里什么都没长——记得每天浇水' : '田里还空着。去种子摊玩一局，拿些种子吧');
  return out;
}
