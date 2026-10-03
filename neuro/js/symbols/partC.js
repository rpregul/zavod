// Part C: 14 flat cartoon symbols (inner SVG markup, 0..100 viewBox, inside r=46 circle).
const S = 'stroke="#1b1530" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

export default [
  {
    id: 'bolt',
    name: 'Молния',
    svg: `<g ${S}>
<path d="M57 11 L22 54 L44 54 L34 91 L79 39 L56 39 L71 11 Z" fill="#ffd23f"/>
<path d="M71 11 L56 39 L79 39 L34 91 L48 56 L61 56 L68 35 Z" fill="#ff8a1f" stroke="none"/>
<path d="M57 11 L22 54 L44 54 L34 91 L79 39 L56 39 L71 11 Z" fill="none"/>
<path d="M56 19 L37 43" fill="none" stroke="#ffffff" stroke-width="3.5"/>
</g>`,
  },
  {
    id: 'pencil',
    name: 'Карандаш',
    svg: `<g transform="rotate(-45 50 50)" ${S}>
<rect x="30" y="38" width="44" height="24" fill="#7fd0ff"/>
<rect x="30" y="38" width="44" height="7" fill="#2f7bff" stroke="none"/>
<rect x="30" y="55" width="44" height="7" fill="#2f7bff" stroke="none"/>
<rect x="30" y="38" width="44" height="24" fill="none"/>
<path d="M6.5 50 L32 38 L32 62 Z" fill="#f2c48a"/>
<path d="M6.5 50 L17.5 44.8 L17.5 55.2 Z" fill="#1b1530"/>
<rect x="73" y="37" width="9" height="26" fill="#a9b0c0"/>
<path d="M77.5 38 V62" fill="none" stroke-width="2"/>
<path d="M82 38 H87 A6 6 0 0 1 93 44 V56 A6 6 0 0 1 87 62 H82 Z" fill="#ff6fae"/>
<path d="M38 50 H64" fill="none" stroke="#ffffff" stroke-width="2.5"/>
</g>`,
  },
  {
    id: 'daisy',
    name: 'Ромашка',
    svg: `<g ${S}>
<path d="M50 60 C50 72 52 80 50 88" fill="none" stroke-width="10"/>
<path d="M50 60 C50 72 52 80 50 88" fill="none" stroke="#2fb457" stroke-width="4"/>
<path d="M51 79 C62 62 78 63 86 69 C78 87 62 89 51 79 Z" fill="#2fb457"/>
<path d="M54 77 C63 71 72 70 80 71" fill="none" stroke="#1f8a43" stroke-width="2.5"/>
<g fill="#ffffff" stroke="#7d8db5" stroke-width="2.5">
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(0 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(36 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(72 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(108 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(144 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(180 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(216 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(252 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(288 50 38)"/>
<ellipse cx="50" cy="18.5" rx="8.5" ry="12.5" transform="rotate(324 50 38)"/>
</g>
<circle cx="50" cy="38" r="12" fill="#ffd23f"/>
<circle cx="46" cy="34" r="2.5" fill="#ff8a1f" stroke="none"/>
<circle cx="55" cy="40" r="2" fill="#ff8a1f" stroke="none"/>
<circle cx="47" cy="43" r="1.8" fill="#ff8a1f" stroke="none"/>
</g>`,
  },
  {
    id: 'moon',
    name: 'Месяц',
    svg: `<g ${S}>
<path d="M50.9 14.1 A38 38 0 1 0 82.8 67.2 A31 31 0 0 1 50.9 14.1 Z" fill="#ffd23f"/>
<circle cx="33" cy="27" r="3" fill="#ff8a1f" stroke="none"/>
<circle cx="36" cy="79" r="4" fill="#ff8a1f" stroke="none"/>
<path d="M50.9 14.1 A38 38 0 1 0 82.8 67.2 A31 31 0 0 1 50.9 14.1 Z" fill="none"/>
<path d="M18 40 Q24 46 30 40" fill="none" stroke-width="2.8"/>
<circle cx="19" cy="57" r="4" fill="#ff6fae" stroke="none"/>
<path d="M24 62 Q31 70 38 62" fill="none" stroke-width="2.8"/>
<polygon points="63,21 67,33 76,33 69,39 72,48 64,42 56,48 59,39 52,33 61,33" fill="#ffffff" stroke="#1b1530" transform="translate(2 4)"/>
</g>`,
  },
  {
    id: 'clown',
    name: 'Клоун',
    svg: `<g ${S}>
<circle cx="23" cy="53" r="12" fill="#ef3b4c"/>
<circle cx="24" cy="72" r="10" fill="#2f7bff"/>
<circle cx="77" cy="53" r="12" fill="#2f7bff"/>
<circle cx="76" cy="72" r="10" fill="#ef3b4c"/>
<circle cx="50" cy="62" r="26" fill="#ffffff"/>
<path d="M30 44 L50 15 L70 44 Z" fill="#2f7bff"/>
<path d="M37.5 33 L62.5 33 L70 44 L30 44 Z" fill="#ffd23f" stroke="none"/>
<path d="M30 44 L50 15 L70 44 Z" fill="none"/>
<circle cx="50" cy="15" r="5.5" fill="#ff6fae"/>
<ellipse cx="41" cy="56" rx="3.5" ry="4.5" fill="#1b1530" stroke="none"/>
<ellipse cx="59" cy="56" rx="3.5" ry="4.5" fill="#1b1530" stroke="none"/>
<circle cx="42" cy="54.5" r="1.3" fill="#ffffff" stroke="none"/>
<circle cx="60" cy="54.5" r="1.3" fill="#ffffff" stroke="none"/>
<circle cx="33.5" cy="66" r="4" fill="#ff6fae" stroke="none"/>
<circle cx="66.5" cy="66" r="4" fill="#ff6fae" stroke="none"/>
<circle cx="50" cy="64" r="7" fill="#ef3b4c"/>
<path d="M35 73 Q50 92 65 73 Q50 77 35 73 Z" fill="#ef3b4c"/>
</g>`,
  },
  {
    id: 'drop',
    name: 'Капля',
    svg: `<g ${S}>
<path d="M50 7 C50 7 21 40 21 63 C21 80 34 94 50 94 C66 94 79 80 79 63 C79 40 50 7 50 7 Z" fill="#2f7bff"/>
<path d="M50 7 C58 17 69 30 75 46 C81 64 73 90 50 94 C66 94 79 80 79 63 C79 40 50 7 50 7 Z" fill="#1d56c9" stroke="none"/>
<path d="M50 7 C50 7 21 40 21 63 C21 80 34 94 50 94 C66 94 79 80 79 63 C79 40 50 7 50 7 Z" fill="none"/>
<path d="M33 66 C31 56 36 48 42 40" fill="none" stroke="#ffffff" stroke-width="6"/>
<circle cx="35" cy="78" r="3.2" fill="#ffffff" stroke="none"/>
</g>`,
  },
  {
    id: 'clef',
    name: 'Скрипичный ключ',
    svg: `<g ${S} transform="translate(-3 -1)">
<g fill="none">
<path d="M42 63 C35 63 33 53 42 51 C52 49 59 58 54 67 C48 76 31 73 27 60 C23 46 34 34 42 26 C48 19 51 15 49 13 C56 14 55 25 52 37 L45 75 C44 86 34 88 32 80" stroke-width="10"/>
<path d="M42 63 C35 63 33 53 42 51 C52 49 59 58 54 67 C48 76 31 73 27 60 C23 46 34 34 42 26 C48 19 51 15 49 13 C56 14 55 25 52 37 L45 75 C44 86 34 88 32 80" stroke="#7b3fe4" stroke-width="4.5"/>
</g>
<circle cx="32" cy="79" r="4.5" fill="#7b3fe4"/>
<ellipse cx="74" cy="82" rx="9" ry="6.5" transform="rotate(-20 74 82)" fill="#5b2bb8"/>
<path d="M81 79 V50" fill="none" stroke-width="5"/>
<path d="M81 79 V50 C83 59 92 61 90 74 C88 67 85 65 81 64" fill="#5b2bb8" stroke="none"/>
<path d="M81 79 V50 C83 59 92 61 90 74 C88 67 85 65 81 64" fill="none"/>
</g>`,
  },
  {
    id: 'key',
    name: 'Ключ',
    svg: `<g transform="rotate(-45 50 50)" ${S}>
<rect x="36" y="44" width="52" height="12" fill="#ffd23f"/>
<path d="M69 56 V70 H77 V62 H81 V70 H89 V56 Z" fill="#ffd23f"/>
<path d="M36 52 H88 V56 H36 Z" fill="#ff8a1f" stroke="none"/>
<rect x="36" y="44" width="52" height="12" fill="none"/>
<rect x="38" y="41" width="6" height="18" rx="2" fill="#ff8a1f"/>
<circle cx="23" cy="50" r="17" fill="#ffd23f"/>
<path d="M12 62 A17 17 0 0 0 37 59 A22 22 0 0 1 12 62 Z" fill="#ff8a1f" stroke="none"/>
<circle cx="23" cy="50" r="17" fill="none"/>
<circle cx="23" cy="50" r="6.5" fill="#1b1530"/>
<path d="M14 40 A12 12 0 0 1 24 35" fill="none" stroke="#ffffff" stroke-width="3"/>
</g>`,
  },
  {
    id: 'eye',
    name: 'Глаз',
    svg: `<g ${S}>
<path d="M18.3 43 L10.5 35 M31.5 33.3 L26.5 22.6 M50 29 V16 M68.5 33.3 L73.5 22.6 M81.7 43 L89.5 35" fill="none" stroke-width="3.5"/>
<path d="M9 56 C28 20 72 20 91 56 C72 88 28 88 9 56 Z" fill="#ffffff"/>
<circle cx="50" cy="56" r="21" fill="#1fa6a0"/>
<circle cx="50" cy="56" r="15" fill="#2f7bff" stroke="none"/>
<circle cx="50" cy="56" r="9.5" fill="#1b1530" stroke="none"/>
<circle cx="43" cy="48" r="4.5" fill="#ffffff" stroke="none"/>
<circle cx="56" cy="62" r="2" fill="#ffffff" stroke="none"/>
<path d="M9 56 C28 20 72 20 91 56" fill="none" stroke-width="5"/>
<circle cx="17" cy="59" r="3" fill="#ff6fae" stroke="none"/>
</g>`,
  },
  {
    id: 'flame',
    name: 'Огонь',
    svg: `<g ${S}>
<path d="M50 7 C58 25 80 37 80 62 C80 80 66 93 50 93 C34 93 20 80 20 62 C20 49 27 41 33 31 C35 41 39 45 44 45 C40 31 44 17 50 7 Z" fill="#ef3b4c"/>
<path d="M50 7 C58 25 80 37 80 62 C80 80 66 93 50 93 C34 93 20 80 20 62 C20 49 27 41 33 31 C35 41 39 45 44 45 C40 31 44 17 50 7 Z" fill="#ff8a1f" stroke="none" transform="translate(50 93) scale(0.82) translate(-50 -93)"/>
<path d="M50 7 C58 25 80 37 80 62 C80 80 66 93 50 93 C34 93 20 80 20 62 C20 49 27 41 33 31 C35 41 39 45 44 45 C40 31 44 17 50 7 Z" fill="#ffd23f" stroke="none" transform="translate(50 93) scale(0.5) translate(-50 -93)"/>
<path d="M50 7 C58 25 80 37 80 62 C80 80 66 93 50 93 C34 93 20 80 20 62 C20 49 27 41 33 31 C35 41 39 45 44 45 C40 31 44 17 50 7 Z" fill="none"/>
</g>`,
  },
  {
    id: 'ice',
    name: 'Лёд',
    svg: `<g ${S}>
<path d="M50 8 L86 28 L86 72 L50 92 L14 72 L14 28 Z" fill="#7fd0ff"/>
<path d="M14 28 L50 48 L50 92 L14 72 Z" fill="#7fd0ff"/>
<path d="M86 28 L50 48 L50 92 L86 72 Z" fill="#4a9cf0"/>
<path d="M50 8 L86 28 L50 48 L14 28 Z" fill="#d9f3ff"/>
<path d="M50 20 L69 30 L50 40 L31 30 Z" fill="#ffffff" stroke="none" opacity="0.65"/>
<path d="M18 36 V60" fill="none" stroke="#ffffff" stroke-width="3.5" opacity="0.9"/>
<path d="M80 40 V62" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.5"/>
<g stroke="#ffffff" stroke-width="2.4" fill="none" transform="translate(32 60)">
<path d="M0 -8 V8 M-7 -4 L7 4 M-7 4 L7 -4"/>
<path d="M-2 -6 L0 -4 L2 -6 M-2 6 L0 4 L2 6" stroke-width="1.6"/>
</g>
<path d="M50 8 L86 28 L86 72 L50 92 L14 72 L14 28 Z" fill="none"/>
</g>`,
  },
  {
    id: 'book',
    name: 'Книга',
    svg: `<g ${S}>
<path d="M14 26 L14 76 Q32 70 50 86 Q68 70 86 76 L86 26 Q68 18 50 28 Q32 18 14 26 Z" fill="#2f7bff"/>
<path d="M19 28 Q34 20 50 30 L50 77 Q34 65 19 70 Z" fill="#fff4d6"/>
<path d="M50 30 Q66 20 81 28 L81 70 Q66 65 50 77 Z" fill="#fff4d6"/>
<path d="M24 38 Q35 33 45 38 M24 47 Q35 42 45 47 M24 56 Q35 51 45 56 M24 65 Q31 61 38 63" fill="none" stroke="#8d94a5" stroke-width="2.5"/>
<path d="M66 38 Q73 34 77 36 M66 47 Q73 43 77 45 M66 56 Q73 52 77 54" fill="none" stroke="#8d94a5" stroke-width="2.5"/>
<path d="M54 30 V88 L59.5 82 L65 88 V33 Z" fill="#ef3b4c"/>
</g>`,
  },
  {
    id: 'clock',
    name: 'Будильник',
    svg: `<g ${S}>
<path d="M34 80 L30 86 M66 80 L70 86" fill="none" stroke-width="7"/>
<path d="M21 37 A13 13 0 0 1 43 24 Z" fill="#ffd23f" transform="rotate(-8 32 30)"/>
<path d="M57 24 A13 13 0 0 1 79 37 Z" fill="#ffd23f" transform="rotate(8 68 30)"/>
<path d="M50 28 V18" fill="none"/>
<circle cx="50" cy="16" r="3.5" fill="#1b1530" stroke="none"/>
<circle cx="50" cy="57" r="30" fill="#ef3b4c"/>
<circle cx="50" cy="57" r="22" fill="#ffffff"/>
<path d="M50 39.5 V42 M50 72 V74.5 M32.5 57 H35 M65 57 H67.5" fill="none" stroke-width="2.5"/>
<path d="M50 57 V44" fill="none" stroke-width="3"/>
<path d="M50 57 L60 63" fill="none" stroke-width="3.5"/>
<circle cx="50" cy="57" r="3" fill="#ffd23f"/>
<path d="M24 45 Q27 37 34 33" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.0"/>
</g>`,
  },
  {
    id: 'ladybug',
    name: 'Божья коровка',
    svg: `<g ${S}>
<path d="M44 21 Q40 15 37 13 M56 21 Q60 15 63 13" fill="none"/>
<circle cx="37" cy="13" r="3.2" fill="#1b1530"/>
<circle cx="63" cy="13" r="3.2" fill="#1b1530"/>
<ellipse cx="50" cy="59" rx="35" ry="33" fill="#ef3b4c"/>
<path d="M50 28 V92" fill="none"/>
<circle cx="33" cy="48" r="6.5" fill="#1b1530" stroke="none"/>
<circle cx="67" cy="48" r="6.5" fill="#1b1530" stroke="none"/>
<circle cx="29" cy="70" r="5.5" fill="#1b1530" stroke="none"/>
<circle cx="71" cy="70" r="5.5" fill="#1b1530" stroke="none"/>
<circle cx="41" cy="82" r="4" fill="#1b1530" stroke="none"/>
<circle cx="59" cy="82" r="4" fill="#1b1530" stroke="none"/>
<path d="M32 26 A18 15 0 0 1 68 26 Q68 38 50 38 Q32 38 32 26 Z" fill="#1b1530"/>
<circle cx="43" cy="27" r="4.5" fill="#ffffff" stroke="none"/>
<circle cx="57" cy="27" r="4.5" fill="#ffffff" stroke="none"/>
<circle cx="44" cy="28" r="1.8" fill="#1b1530" stroke="none"/>
<circle cx="56" cy="28" r="1.8" fill="#1b1530" stroke="none"/>
</g>`,
  },
];
