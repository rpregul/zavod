// Глифы 24x24 (контур, round caps). Оборачиваются в «жидкое стекло» через gi().
const G = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const glyph = {
  grid: G('<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
  gridRev: G('<g transform="rotate(180 12 12)"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/></g><path d="M16.5 8.2 12 12.7 9.5 10.2" stroke-width="2.2"/>'),
  cards: G('<circle cx="9.5" cy="10" r="6.2"/><path d="M15.2 7.6a6.2 6.2 0 1 1-1.3 10.4"/><circle cx="8" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="11.4" cy="11.4" r="1.1" fill="currentColor" stroke="none"/>'),
  words: G('<path d="M4 6.5h9M4 11h13M4 15.5h7"/><path d="m16 17.2 1.9 1.9 3.6-4.2" stroke-width="2.2"/>'),
  brain: G('<path d="M9.5 4.2A3 3 0 0 0 6.6 7a3 3 0 0 0-1.9 4.9 3.2 3.2 0 0 0 1.5 5.6A3 3 0 0 0 12 18.5V6.4a2.4 2.4 0 0 0-2.5-2.2Z"/><path d="M14.5 4.2A3 3 0 0 1 17.4 7a3 3 0 0 1 1.9 4.9 3.2 3.2 0 0 1-1.5 5.6A3 3 0 0 1 12 18.5"/>'),
  chart: G('<path d="M4 19.5h16"/><path d="m5.5 15.5 4-5 3.5 3 5.5-7"/><circle cx="18.5" cy="6.5" r="1.4" fill="currentColor" stroke="none"/>'),
  flame: G('<path d="M12 3.2c.6 3 3.6 4.7 3.6 8.6a3.6 3.6 0 0 1-7.2 0c0-1.6.7-2.6 1.4-3.4.3 1 .9 1.7 1.6 1.9-.2-2.7-.3-4.8.6-7.1Z"/><path d="M12 20.3a5.8 5.8 0 0 0 5.8-5.8c0-2.2-1-3.6-2.1-5" opacity=".0"/>'),
  home: G('<path d="m4 11.2 8-6.7 8 6.7"/><path d="M6 10v8.5a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V10"/>'),
  play: G('<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4A.8.8 0 0 0 8 5.6Z" fill="currentColor"/>'),
  check: G('<path d="m5 12.8 4.4 4.4L19 7.4" stroke-width="2.6"/>'),
  close: G('<path d="M6 6l12 12M18 6 6 18" stroke-width="2.4"/>'),
  arrow: G('<path d="M5 12h14M13 6l6 6-6 6" stroke-width="2.4"/>'),
  back: G('<path d="M19 12H5M11 6l-6 6 6 6" stroke-width="2.4"/>'),
  gear: G('<circle cx="12" cy="12" r="3.1"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>'),
  trophy: G('<path d="M8 4.5h8v5a4 4 0 0 1-8 0v-5Z"/><path d="M8 6.5H5.2c0 2.6 1 3.9 2.9 4.3M16 6.5h2.8c0 2.6-1 3.9-2.9 4.3M12 13.5v3M8.8 19.5h6.4l-.6-3h-5.2l-.6 3Z"/>'),
  user: G('<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c.6-3.6 3.5-5.5 7-5.5s6.4 1.9 7 5.5"/>'),
  sound: G('<path d="M4.5 9.8v4.4h3L12 18V6L7.5 9.8h-3Z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M17.8 6.5a7.5 7.5 0 0 1 0 11"/>'),
  vibe: G('<rect x="8" y="3.5" width="8" height="17" rx="2.2"/><path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3"/>'),
  eye: G('<path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.7"/>'),
  download: G('<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>'),
  logout: G('<path d="M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14M10 8l-4 4 4 4M6 12h9"/>'),
  cloud: G('<path d="M7 18.5a4.2 4.2 0 0 1-.6-8.4A5.6 5.6 0 0 1 17 8.7a4.9 4.9 0 0 1 .4 9.8H7Z"/>'),
  clock: G('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  target: G('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
  sparkle: G('<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6L4.5 10.8 10.2 9 12 3.5Z" fill="currentColor"/><path d="M19 3.5v3M17.5 5h3"/>'),
  share: G('<path d="M12 15V4.5M8 8.2l4-4 4 4M6.5 12v6.5h11V12"/>'),
  plus: G('<path d="M12 5v14M5 12h14" stroke-width="2.4"/>'),
};

// Иконка в стиле «жидкого стекла» iOS: цветная полупрозрачная плитка с бликом
export function gi(name, color = 'orange', size = 'md') {
  return `<span class="gi gi--${color} gi--${size}">${glyph[name] || ''}</span>`;
}
