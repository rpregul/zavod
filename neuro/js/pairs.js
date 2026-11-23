import { esc } from './util.js?v=1.5.0';
export function pairsFrame(mode) {
  const frame=document.createElement('iframe');
  frame.title='Пары — упражнение на память';
  frame.src='pairs-preview/?v=10&mode='+mode;
  frame.style.cssText='display:block;width:100%;height:78vh;height:78dvh;border:0;border-radius:20px';
  frame.addEventListener('load',()=>{
    const main=frame.contentDocument?.querySelector('main');
    if(!main)return;
    const resize=()=>{frame.style.height=Math.ceil(main.getBoundingClientRect().height+4)+'px';};
    const observer=new ResizeObserver(resize);observer.observe(main);resize();
    frame.contentWindow.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  });
  return frame;
}
export function runPairs(ctx,{trial}) {
  return new Promise(resolve=>{
    const close=document.createElement('button');
    close.className='glass-btn';
    close.textContent='×';
    close.setAttribute('aria-label','Выйти из упражнения');
    close.onclick=()=>ctx.requestQuit();
    const frame=pairsFrame(trial?'trial':'full');
    ctx.onAbort=()=>{frame.remove();resolve(null);};
    frame.addEventListener('pairs-result',event=>{
      const {score,total,answers}=event.detail;
      const praise=score===total?'Отличная память!':score===0?'Попробуйте ещё раз':score===total-1?'Почти получилось!':'Хорошее начало!';
      const rows=answers.map(({given,correct,picture})=>{
        const right=given===correct;
        return `<div class="pair-review-row"><i style="background-position:${picture%5*25}% ${Math.floor(picture/5)*100/3}%"></i><strong class="${right?'':'miss'}">${right?'✓':'✕'} ${esc(given)}${right?'':'<small>Верно: '+esc(correct)+'</small>'}</strong></div>`;
      }).join('');
      const detail=`<section class="pair-review"><h3>${praise}</h3><p>Правильных ответов — ${score} из ${total}.</p>${rows}</section>`;
      frame.remove();
      resolve({score,meta:{total,study_seconds:trial?20:45},detail});
    },{once:true});
    ctx.root.append(close,frame);
  });
}
