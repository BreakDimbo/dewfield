// Small inline SVG icons for the hotbar and panels (flat cel style, 48×48 viewBox, ink outline #3a3346).
const INK = '#3a3346';
const svg = (body) => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  hoe: svg(`<path d="M12 40 L34 12" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M12 40 L34 12" stroke="#b48a62" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M27 9 L41 9 L39 17 L29 17 Z" fill="#9aa1a8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`),
  seeds: (color = '#f2b5c8') => svg(`<path d="M14 18 Q12 40 24 42 Q36 40 34 18 Z" fill="#e3d4b8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M14 18 Q24 12 34 18" fill="none" stroke="${INK}" stroke-width="2.2"/><path d="M17 16 L15 8 M24 14 L24 6 M31 16 L33 8" stroke="#8a6446" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="24" cy="30" r="6.5" fill="${color}" stroke="${INK}" stroke-width="2"/>`),
  can: svg(`<path d="M12 20 L32 20 L30 40 L14 40 Z" fill="#7fb2c7" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M31 25 L42 15" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M31 25 L42 15" stroke="#7fb2c7" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M40 12 L45 17" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M15 20 Q22 9 29 20" fill="none" stroke="${INK}" stroke-width="2.4"/>
    <path d="M17 30 L27 30" stroke="#dff0f6" stroke-width="2.4" stroke-linecap="round"/>`),
  fert: svg(`<path d="M13 14 L35 14 L37 41 L11 41 Z" fill="#e3d4b8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M13 14 Q24 8 35 14" fill="#cdb996" stroke="${INK}" stroke-width="2"/>
    <path d="M24 36 Q16 30 20 21 Q28 24 24 36 Z" fill="#78a85c" stroke="${INK}" stroke-width="1.8"/><path d="M24 36 Q31 31 29 24" fill="none" stroke="${INK}" stroke-width="1.8"/>`),
  shears: svg(`<path d="M22 24 L40 8 M26 24 L40 34" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M22 24 L40 8 M26 24 L40 34" stroke="#c9ced3" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="13" cy="17" r="6" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="13" cy="17" r="6" fill="none" stroke="#d9463b" stroke-width="2.6"/>
    <circle cx="13" cy="33" r="6" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="13" cy="33" r="6" fill="none" stroke="#d9463b" stroke-width="2.6"/>`),
  basket: svg(`<path d="M9 22 L39 22 L35 40 L13 40 Z" fill="#d6ad72" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M14 22 Q24 4 34 22" fill="none" stroke="${INK}" stroke-width="4"/><path d="M14 22 Q24 4 34 22" fill="none" stroke="#b48a62" stroke-width="2"/>
    <path d="M11 29 L37 29 M12.5 35 L35.5 35" stroke="#a9824f" stroke-width="1.8"/><circle cx="20" cy="21" r="4" fill="#f08a3a" stroke="${INK}" stroke-width="1.6"/><circle cx="28" cy="20" r="4" fill="#f5a623" stroke="${INK}" stroke-width="1.6"/>`),
  ticket: svg(`<path d="M6 16 L42 16 L42 21 Q38 24 42 27 L42 32 L6 32 L6 27 Q10 24 6 21 Z" fill="#f4ecd8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M17 16 L17 32" stroke="${INK}" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="29" cy="24" r="4" fill="#f2b5c8" stroke="${INK}" stroke-width="1.6"/>`),
  sun: svg(`<circle cx="24" cy="24" r="8" fill="#f2c230" stroke="${INK}" stroke-width="2"/><g stroke="#e9a23b" stroke-width="3" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5L37 37M37 11l-3.5 3.5M14.5 33.5L11 37"/></g>`),
  rain: svg(`<path d="M12 28 Q6 28 7 21 Q9 15 16 16 Q19 8 28 10 Q36 11 36 19 Q43 19 42 25 Q41 29 35 28 Z" fill="#dfe8ef" stroke="${INK}" stroke-width="2"/><g stroke="#5f9bdc" stroke-width="3" stroke-linecap="round"><path d="M16 33l-2 6M25 33l-2 6M34 33l-2 6"/></g>`),
  moon: svg(`<path d="M30 8 Q16 12 17 26 Q18 38 32 40 Q20 44 13 36 Q5 26 12 15 Q19 7 30 8 Z" fill="#f1e3b0" stroke="${INK}" stroke-width="2"/>`),
};
