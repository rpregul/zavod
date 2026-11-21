import { makeHud } from './ui.js?v=1.5.0';
import { sfx, haptic } from './fx.js?v=1.5.0';

export function percentProblem(level, previous = null, random = Math.random) {
  const parts = [[5,10,15,20,25,30,40,50,60,75,80,90],[10,20,25,50],[5,15,30,35,45,60,65,75,85]][level];
  const wholes = [[100],[40,60,80,120,160,200,240,300,400],[60,140,180,220,260,320,360,420,540,620]][level];
  const options = parts.flatMap(percent => wholes.map(base => ({percent,base,answer:base*percent/100})))
    .filter(item => !previous || item.percent !== previous.percent || item.base !== previous.base);
  return options[Math.floor(random()*options.length)];
}

export function runPercent(ctx, { step = '', trial = false } = {}) {
  return new Promise(resolve => {
    const { root } = ctx;
    const duration = trial ? 30000 : 60000;
    const hud = makeHud(ctx, { label: 'Правильно', step });
    const stage = document.createElement('section');
    stage.className = 'pct-stage';
    stage.setAttribute('aria-label', 'Проценты');
    const captions = ['Разминка', 'Чуть сложнее', 'Вызов'];
    stage.innerHTML = `
      <ol class="pct-levels" aria-label="Уровни сложности">${captions.map((label,i)=>`<li><b>${i+1}</b><span>${label}</span></li>`).join('')}</ol>
      <div class="pct-card glass"><span class="pct-decoration" aria-hidden="true">%</span>
        <h2 class="pct-problem" aria-live="polite"></h2>
        <div class="pct-entry" aria-label="Введённый ответ">—</div>
      </div>
      <div class="pct-feedback" role="status" aria-atomic="true"></div>
      <div class="pct-keypad" aria-label="Цифровая клавиатура">
        ${[1,2,3,4,5,6,7,8,9,'erase',0,'submit'].map(key=>`<button type="button" data-pct-key="${key}" class="pct-key pct-key--${key}"${key==='erase'?' aria-label="Стереть цифру"':key==='submit'?' aria-label="Проверить ответ"':''}>${key==='erase'?'⌫':key==='submit'?'↵':key}</button>`).join('')}
      </div>
      <div class="pct-pause glass" hidden><p>Раунд на паузе</p><button type="button" class="btn btn--primary" data-pct-resume>Продолжить</button></div>`;
    root.replaceChildren(hud.node,stage);
    const problem = stage.querySelector('.pct-problem');
    const entry = stage.querySelector('.pct-entry');
    const feedback = stage.querySelector('.pct-feedback');
    const keypad = stage.querySelector('.pct-keypad');
    const pause = stage.querySelector('.pct-pause');
    const levels = [...stage.querySelectorAll('.pct-levels li')];
    const submitKey = keypad.querySelector('[data-pct-key="submit"]');
    let current, digits = '', score = 0, attempts = 0, highest = 0;
    let elapsed = 0, since = performance.now(), frame, delay, animation;
    let paused = false, locked = false, finished = false;
    const used = () => elapsed + (paused ? 0 : performance.now()-since);

    function cleanup() {
      cancelAnimationFrame(frame);
      clearTimeout(delay);
      animation?.cancel();
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', keyboard);
    }
    function finish(aborted = false) {
      if (finished) return;
      finished = true;
      cleanup();
      const accuracy = attempts ? Math.round(score/attempts*100) : 0;
      resolve(aborted ? null : {
        score, meta:{ attempts, errors:attempts-score, accuracy, duration_ms:duration, level:highest+1 },
        extra:[{label:'Верных ответов',value:score},{label:'Точность',value:accuracy+'%'},{label:'Уровень',value:(highest+1)+' из 3'}]
      });
    }
    function next() {
      if (finished || paused) return;
      if (used() >= duration) return finish();
      const level = Math.min(2,Math.floor(used()*3/duration));
      highest = Math.max(level,highest);
      current = percentProblem(level,current);
      levels.forEach((node,index)=>{
        node.classList.toggle('is-passed',index<level);
        if (index===level) node.setAttribute('aria-current','step'); else node.removeAttribute('aria-current');
      });
      digits = '';
      entry.textContent = '—';
      delete stage.dataset.answer;
      feedback.textContent = '';
      problem.innerHTML = `<strong>${current.percent}%</strong><span> от ${current.base}</span>`;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation?.cancel();
        animation = problem.animate([{opacity:0,transform:'translateY(12px) scale(.98)'},{opacity:1,transform:'none'}],
          {duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
      submitKey.setAttribute('aria-label','Проверить ответ');
      locked = false;
    }
    function key(value) {
      if (paused || finished || used()>=duration) return;
      if (locked) {
        if (value==='submit') { clearTimeout(delay); next(); }
        return;
      }
      if (value==='submit') {
        if (!digits) return;
        locked = true;
        attempts += 1;
        const { percent, base, answer } = current;
        const correct = Number(digits)===answer;
        stage.dataset.answer = correct ? 'correct' : 'wrong';
        if (correct) {
          score += 1;
          hud.setScore(score);
          sfx('ok');
          haptic(12);
          feedback.textContent = 'Верно!';
        } else {
          feedback.textContent = `Ответ: ${answer}. Сначала делим ${base} на 100, затем умножаем на ${percent}: (${base} ÷ 100) × ${percent} = ${answer}.`;
          submitKey.setAttribute('aria-label','Следующий пример');
        }
        delay = setTimeout(next,correct ? 220 : 2800);
        return;
      }
      digits = value==='erase' ? digits.slice(0,-1) : (digits+value).replace(/^0+(?=\d)/,'').slice(0,4);
      entry.textContent = digits || '—';
    }
    function tick() {
      const ms = Math.min(duration,used());
      hud.setTime(duration-ms,ms/duration);
      if (ms>=duration) { finish(); return; }
      frame=requestAnimationFrame(tick);
    }
    function visibility() {
      if (document.visibilityState!=='hidden' || paused || finished) return;
      elapsed=used();
      paused=true;
      cancelAnimationFrame(frame);
      clearTimeout(delay);
      pause.hidden=false;
      keypad.inert=true;
    }
    function keyboard(event) {
      if (paused || finished || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const value = /^[0-9]$/.test(event.key) ? event.key :
        event.key==='Backspace' ? 'erase' :
        event.key==='Enter' && !event.target.closest?.('button') ? 'submit' : '';
      if (!value) return;
      event.preventDefault();
      key(value);
    }
    keypad.addEventListener('click',event=>{
      const button=event.target.closest('[data-pct-key]');
      if (button) key(button.dataset.pctKey);
    });
    pause.querySelector('button').addEventListener('click',()=>{
      if (!paused || finished) return;
      paused=false;
      since=performance.now();
      pause.hidden=true;
      keypad.inert=false;
      if (locked) next();
      tick();
      submitKey.focus({preventScroll:true});
    });
    ctx.onCleanup(cleanup);
    ctx.onAbort=()=>finish(true);
    document.addEventListener('visibilitychange',visibility);
    document.addEventListener('keydown',keyboard);
    next();
    tick();
    visibility();
  });
}
