import A from './partA.js?v=1.1.1';
import B from './partB.js?v=1.1.1';
import C from './partC.js?v=1.1.1';
import D from './partD.js?v=1.1.1';

export const SYMBOLS = [...A, ...B, ...C, ...D];

let mounted = false;
// Один скрытый спрайт на страницу: карточки ссылаются на символы через <use>
export function ensureSprite() {
  if (mounted) return;
  mounted = true;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = `<defs>${SYMBOLS.map((s, i) => `<g id="sy-${i}">${s.svg}</g>`).join('')}</defs>`;
  document.body.prepend(svg);
}

