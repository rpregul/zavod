import { esc } from './util.js?v=1.5.0';
export function pairsFrame(mode) {
  const frame=document.createElement('iframe');
  frame.title='Пары — упражнение на память';
  frame.src='pairs-preview/?v=9&mode='+mode;
  frame.style.cssText='display:block;width:100%;height:78vh;height:78dvh;border:0;border-radius:20px';
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
      const detail=answers.map(a=>a.given===a.correct?'✓ '+esc(a.correct):'✕ '+esc(a.given)+' → '+esc(a.correct)).join('<br>');
      frame.remove();
      resolve({score,meta:{total,study_seconds:trial?20:45},detail,extra:[{label:'Верно восстановлено',value:score+' из '+total}]});
    },{once:true});
    ctx.root.append(close,frame);
  });
}
