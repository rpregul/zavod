import { openSubscription } from './subscription.js?v=1.5.0';
import { CLOUD } from './config.js?v=1.5.0';
import { esc, plural } from './util.js?v=1.5.0';
import { READING_TEXTS, randomReadingText } from './reading-texts.js?v=1.5.0';
import { trackAction } from './analytics.js?v=1.5.0';

async function readingRequest(store, action, row = null) {
  const response = await fetch(CLOUD.url + '/rest/v1/rpc/nz_reading', {
    method: 'POST', headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: store.session.token, p_action: action, p_row: row }),
    signal: AbortSignal.timeout(12000), cache: 'no-store',
  });
  if (!response.ok) { let detail; try { detail = await response.json(); } catch {} const error = new Error(detail?.message || detail?.error || 'reading_unavailable'); throw error; }
  return response.json();
}

export const readingAccess = store => readingRequest(store, 'status');
export async function runReading({ store, mount, onHome, mode }) {
  const root = document.createElement('div');
  root.className = 'reading';
  mount(root, 'reading');
  const controller = new AbortController();
  const modeTitle = mode === 'aloud' ? 'Чтение вслух' : 'Чтение про себя';
  const modeShort = mode === 'aloud' ? 'ЧтВ' : 'ЧтП';
  const pendingKey = 'nz.reading.pending.' + store.session.key + '.' + mode;
  const legacyPendingKey = 'nz.reading.pending.' + store.session.key;
  let history = [];
  let access = { active: false, free_available: {} };
  function locked() {
    paint('<section class="reading-intro glass"><h1>'+modeTitle+'</h1><p>Этот замер уже сохранён. История остаётся доступной, следующие замеры — по подписке.</p><button class="btn btn--primary btn--block" data-reading-subscribe>Посмотреть подписку</button></section>'+historyMarkup());
    root.querySelector('[data-reading-subscribe]').onclick = async () => { await openSubscription(store); onHome(); };
  }
  let passage;
  let stage = 'intro';
  let elapsed = 0;
  let startedAt = null;
  let timer = null;
  let resumeScroll = 0;

  function stopClock() {
    if (startedAt !== null) elapsed += performance.now() - startedAt;
    startedAt = null;
    clearInterval(timer);
  }
  function leave() {
    stopClock();
    controller.abort();
    onHome();
  }
  function paint(html) {
    root.innerHTML = `<header class="reading-header"><button class="link" data-reading-home>На главную</button><b>${modeTitle}</b></header>${html}`;
    root.querySelector('[data-reading-home]').onclick = leave;
    window.scrollTo(0, 0);
  }
  function pending() {
    try { return JSON.parse(localStorage.getItem(pendingKey) || localStorage.getItem(legacyPendingKey) || 'null'); } catch { return null; }
  }
  const rpc = (action, row = null) => readingRequest(store, action, row);
  function historyMarkup() {
    if (!history.length) return '<p class="reading-note">Первый замер станет вашей точкой отсчёта.</p>';
    return `<section class="reading-history"><h3>Ваши замеры ${modeShort}</h3><div class="reading-history-table"><table><thead><tr><th>Дата</th><th>Слов/мин</th><th>Понимание</th></tr></thead><tbody>${history.slice(0,7).map(row => `<tr><td>${new Date(row.created_at).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow',day:'numeric',month:'short'})}<small>${measurementTime(row.created_at)}</small></td><td>${row.wpm}</td><td>${row.correct} из ${row.questions}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function intro() {
    const saved = pending();
    if (!access.active && !access.free_available?.[mode] && !saved) return locked();
    const canStart = access.active || access.free_available?.[mode];
    stage = 'intro';
    paint(`<section class="reading-intro glass"><h1>${modeTitle}</h1><p>Прочитайте текст ${mode === 'aloud' ? 'вслух' : 'про себя'} в привычном темпе, затем ответьте на вопросы. Получите скорость в словах в минуту и отдельный результат понимания.</p><ol><li>Нажмите «Начать чтение» — текст выберется автоматически.</li><li>Прочитайте весь текст и нажмите «Я прочитал(а)».</li><li>Ответьте на вопросы по содержанию.</li></ol><p class="reading-note">Текст выбирается случайно. В следующий раз подряд будет другой текст. При уходе из вкладки таймер ставится на паузу.</p><button class="btn btn--primary btn--block" data-reading-start ${canStart ? '' : 'disabled'}>${canStart ? 'Начать чтение' : 'Замер уже выполнен'}</button>${saved ? '<p class="reading-note">Есть несохранённый замер' + (saved.mode ? '.' : ' прежней версии.') + '</p><button class="btn btn--glass btn--block" data-reading-restore>Сохранить предыдущий замер</button>' : ''}</section>${historyMarkup()}`);
    root.querySelector('[data-reading-start]').onclick = () => {
      const level = null;
      const lastKey = 'nz.reading.last.' + store.session.key;
      let previousId;
      try { previousId = localStorage.getItem(lastKey); } catch { /* Selection works without storage. */ }
      passage = randomReadingText(level, previousId);
      try { localStorage.setItem(lastKey, passage.id); } catch { /* Ignore unavailable storage. */ }
      elapsed = 0;
      trackAction('reading_' + mode + '_start');
      read();
    };
    root.querySelector('[data-reading-restore]')?.addEventListener('click', () => save(saved));
  }
  function updateClock() {
    if (!root.isConnected) { stopClock(); controller.abort(); return; }
    const seconds = Math.floor((elapsed + (startedAt === null ? 0 : performance.now() - startedAt)) / 1000);
    const clock = root.querySelector('[data-reading-clock]');
    if (clock) clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function read(restoring = false) {
    stage = 'reading';
    paint(`<div class="reading-toolbar"><span>${modeTitle}</span><b data-reading-clock>0:00</b></div><article class="reading-passage glass"><h1>${esc(passage.title)}</h1>${passage.paragraphs.map(p => '<p>' + esc(p) + '</p>').join('')}</article><div class="reading-finish"><p role="status" data-reading-warning></p><button class="btn btn--primary btn--block" data-reading-finish>Я прочитал(а)</button></div>`);
    if (restoring) requestAnimationFrame(() => window.scrollTo(0, resumeScroll));
    startedAt = performance.now();
    timer = setInterval(updateClock, 250);
    updateClock();
    root.querySelector('[data-reading-finish]').onclick = () => {
      if (elapsed + performance.now() - startedAt < 5000) {
        root.querySelector('[data-reading-warning]').textContent = 'Прочитайте текст целиком, чтобы замер отражал ваш темп.';
        return;
      }
      stopClock();
      quiz();
    };
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || stage !== 'reading') return;
    resumeScroll = window.scrollY;
    stopClock();
    stage = 'paused';
    paint('<section class="reading-intro glass"><h1>Чтение на паузе</h1><p>Продолжите с того места, где остановились. Время вне вкладки не учитывается.</p><button class="btn btn--primary btn--block" data-reading-resume>Продолжить чтение</button></section>');
    root.querySelector('[data-reading-resume]').onclick = () => read(true);
  }, {signal:controller.signal});
  function quiz() {
    stage = 'quiz';
    trackAction('reading_' + mode + '_quiz');
    paint(`<section class="reading-quiz"><h1>Что запомнилось?</h1><p>${passage.questions.length} вопроса по прочитанному тексту.</p><form>${passage.questions.map((question,index) => `<section class="reading-question" role="group" aria-labelledby="reading-q-${index}"><h2 id="reading-q-${index}">${index+1}. ${esc(question.prompt)}</h2><div class="reading-options glass">${question.options.map((option,value) => `<label><input type="radio" required name="q${index}" value="${value}"><span>${esc(option)}</span></label>`).join('')}</div></section>`).join('')}<button class="btn btn--primary btn--block" type="submit">Посмотреть результат</button></form></section>`);
    root.querySelector('form').onsubmit = event => {
      event.preventDefault();
      const form = event.target;
      const row = {id:crypto.randomUUID(),text_id:passage.id,mode,elapsed_ms:Math.round(elapsed),answers:passage.questions.map((_,i) => Number(form.elements['q'+i].value))};
      try { localStorage.setItem(pendingKey,JSON.stringify(row)); } catch { /* The result can still be saved online. */ }
      save(row);
    };
  }
  async function save(row) {
    stage = 'saving';
    paint('<section class="reading-intro glass"><p role="status">Сохраняем результат…</p></section>');
    try {
      const result = await rpc('save',row);
      try { localStorage.removeItem(row.mode ? pendingKey : legacyPendingKey); } catch { /* Storage may be disabled. */ }
      if (!root.isConnected) return;
      if (result.mode === mode) history = [result,...history.filter(item => item.id !== result.id)];
      stage = 'result';
      trackAction('reading_' + mode + '_complete');
      const advice = result.correct === result.questions
        ? 'Вы ответили на все вопросы. В следующий раз попробуйте другой текст и сравните скорость при сохранении понимания.'
        : 'Попробуйте чуть более спокойный темп: после каждого абзаца коротко сформулируйте его основную мысль.';
      paint(`<section class="reading-result glass"><h1>Ваш результат</h1><p class="reading-note">${result.mode ? (result.mode === 'aloud' ? 'ЧтВ · Чтение вслух' : 'ЧтП · Чтение про себя') : 'Замер прежней версии · режим не указан'}</p><div class="reading-score"><b>${result.wpm}</b><span>слов в минуту</span></div><p class="reading-comprehension">Понимание текста — <b>${result.correct} из ${result.questions}</b></p><p>${advice}</p><small>${result.words} слов за ${(result.elapsed_ms/1000).toFixed(1)} с. Скорость = число слов × 60 / время чтения.</small><button class="btn btn--primary btn--block" data-reading-again>${access.active ? 'Другой замер' : 'Продолжить с подпиской'}</button></section>${historyMarkup()}`);
      if (!access.active) access.free_available[mode] = false;
      void readingAccess(store).then(value => { access = value; }).catch(() => {});
      root.querySelector('[data-reading-again]')?.addEventListener('click', async () => { if (access.active) intro(); else { await openSubscription(store); onHome(); } });
    } catch (error) {
      if (!root.isConnected) return;
      if (error.message.includes('subscription_required')) { access.free_available[mode] = false; return locked(); }
      paint('<section class="reading-intro glass"><h2>Не удалось сохранить замер</h2><p>Проверьте соединение. Ваш результат сохранён на устройстве. Результат можно отправить повторно.</p><button class="btn btn--primary btn--block" data-reading-retry>Повторить сохранение</button></section>');
      root.querySelector('[data-reading-retry]').onclick = () => save(row);
    }
  }
  paint('<p role="status">Загружаем ваши замеры…</p>');
  try { [history, access] = await Promise.all([rpc('history', {mode}), readingAccess(store)]); if (root.isConnected) intro(); }
  catch {
    if (!root.isConnected) return;
    paint('<section class="reading-intro glass"><h1>Замер скорости чтения</h1><p>Не удалось загрузить замеры. Проверьте соединение, затем откройте этот раздел ещё раз.</p></section>');
  }
}



const measurementDate = value => new Date(value).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'});
const measurementTime = value => new Date(value).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
export function measurementTrend(rows) {
  const recent = rows.slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).slice(-7);
  const latest = recent.at(-1), previous = recent.at(-2), first = recent[0];
  const percent = base => base?.wpm > 0 && latest ? (latest.wpm-base.wpm)/base.wpm*100 : null;
  return {recent,latest,previous,previousPercent:percent(previous),firstPercent:recent.length>1?percent(first):null};
}
const percentText = value => (value>0?'+':value<0?'−':'')+Math.abs(value).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
function measurementMarkup(rows,group) {
  const {recent,latest,previous,previousPercent,firstPercent} = measurementTrend(rows);
  if (!latest) return '<p class="reading-note">Пока нет замеров '+group.short+'.</p>';
  const width = Math.max(280,recent.length*64), height=200, top=30, bottom=156;
  const max = Math.max(1,...recent.map(row=>row.wpm));
  const x = i => (i+.5)*width/recent.length;
  const y = row => bottom-row.wpm/max*(bottom-top);
  const chart = '<div class="measurement-trend-scroll" tabindex="0" aria-label="График скорости чтения, горизонтальная прокрутка"><svg class="measurement-trend-svg" style="min-width:'+width+'px" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+group.title+': '+recent.map(row=>measurementDate(row.created_at)+', '+row.wpm+' слов в минуту').join('; ')+'">'
    + recent.map((row,i)=>'<rect x="'+(x(i)-13)+'" y="'+y(row)+'" width="26" height="'+(bottom-y(row))+'" rx="5" fill="#dfc9ef"/>').join('')
    + (recent.length>1?'<polyline points="'+recent.map((row,i)=>x(i)+','+y(row)).join(' ')+'" fill="none" stroke="#8439b3" stroke-width="2.5" stroke-linejoin="round"/>':'')
    + recent.map((row,i)=>'<circle cx="'+x(i)+'" cy="'+y(row)+'" r="4" fill="#8439b3"/><text x="'+x(i)+'" y="'+(y(row)-12)+'" text-anchor="middle" fill="#49335e" font-size="12" font-weight="800">'+row.wpm+'</text><text x="'+x(i)+'" y="178" text-anchor="middle" fill="#625071" font-size="11">'+measurementDate(row.created_at).slice(0,5)+'</text>').join('')+'</svg></div>';
  return '<p class="measurement-latest">Последний результат — <b>'+latest.wpm+' слов/мин</b></p>'
    + (previousPercent===null?'<p class="reading-note">Первый замер — ваша точка отсчёта. После следующего появится изменение скорости.</p>':'<p class="measurement-change"><b>'+percentText(previousPercent)+'</b> к предыдущему замеру<br><span>'+percentText(firstPercent)+' к первому на графике</span></p><p class="reading-note">Понимание: '+latest.correct+' из '+latest.questions+' · ранее '+previous.correct+' из '+previous.questions+'</p>')
    + chart + '<p class="reading-note">Скорость, слов/мин · последние '+recent.length+' '+plural(recent.length,'замер','замера','замеров')+'. Сравнивается один способ чтения. Учитывайте понимание текста.</p>'
    + (group.id==='legacy'?'<p class="reading-note">В этих замерах способ чтения не указывался.</p>':'')
    + '<div class="reading-history-table"><table><thead><tr><th>Дата замера</th><th>Слов/мин</th><th>Понимание</th></tr></thead><tbody>'
    + recent.slice().reverse().map(row=>'<tr><td>'+measurementDate(row.created_at)+'<small>'+measurementTime(row.created_at)+'</small></td><td>'+row.wpm+'</td><td>'+row.correct+' из '+row.questions+'</td></tr>').join('')+'</tbody></table></div>';
}

export async function paintMeasurementStats(host, store) {
  if (!host) return;
  host.innerHTML = '<p class="reading-note" role="status">Загружаем статистику замеров…</p>';
  try {
    const [aloud, silent, legacy] = await Promise.all(['aloud','silent','legacy'].map(mode => readingRequest(store,'history',{mode})));
    if (!host.isConnected) return;
    const groups = [
      {id:'aloud',short:'ЧтВ',title:'Чтение вслух',rows:aloud},
      {id:'silent',short:'ЧтП',title:'Чтение про себя',rows:silent},
    ];
    if (legacy.length) groups.push({id:'legacy',short:'Ранее',title:'Замеры прежней версии',rows:legacy});
    host.innerHTML = '<h3 class="sec__t">Статистика замеров</h3><div class="measurement-stats glass"><div class="seg" role="tablist" aria-label="Способ чтения">'
      + groups.map(group => '<button class="seg__b" role="tab" data-measure-tab="'+group.id+'">'+group.short+'</button>').join('')
      + '</div><div data-measure-chart role="tabpanel"></div></div>';
    const chart = host.querySelector('[data-measure-chart]');
    function select(group) {
      host.querySelectorAll('[data-measure-tab]').forEach(button => {
        const selected = button.dataset.measureTab === group.id;
        button.classList.toggle('on',selected);
        button.setAttribute('aria-selected',String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      chart.innerHTML = '<h4>'+group.title+'</h4>';
      if (!group.rows.length) {
        chart.innerHTML += '<p class="reading-note">Здесь появятся скорость и понимание после первого замера '+group.short+'.</p>';
        return;
      }
      chart.innerHTML += measurementMarkup(group.rows,group);
      const scroll = chart.querySelector('.measurement-trend-scroll');
      if (scroll) scroll.scrollLeft = scroll.scrollWidth;
    }
    select(groups[0]);
    host.querySelectorAll('[data-measure-tab]').forEach((button,index) => {
      button.onclick = () => select(groups[index]);
      button.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const next = (index+(event.key==='ArrowRight'?1:-1)+groups.length)%groups.length;
        select(groups[next]);
        host.querySelector('[data-measure-tab="'+groups[next].id+'"]').focus();
      };
    });
  } catch {
    if (!host.isConnected) return;
    host.innerHTML = '<h3 class="sec__t">Статистика замеров</h3><p class="reading-note">Не удалось загрузить замеры.</p><button class="link" data-measure-retry>Повторить</button>';
    host.querySelector('[data-measure-retry]').onclick = () => paintMeasurementStats(host,store);
  }
}

