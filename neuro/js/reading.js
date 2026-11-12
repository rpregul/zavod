import { CLOUD } from './config.js?v=1.1.2';
import { esc } from './util.js?v=1.1.2';
import { READING_TEXTS, wordCount } from './reading-texts.js?v=1.3.0';
import { trackAction } from './analytics.js?v=1.2.2';

export async function runReading({ store, mount, onHome }) {
  const root = document.createElement('div');
  root.className = 'reading';
  mount(root, 'reading');
  const controller = new AbortController();
  const pendingKey = 'nz.reading.pending.' + store.session.key;
  let history = [];
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
    root.innerHTML = `<header class="reading-header"><button class="link" data-reading-home>На главную</button><b>Скорость чтения</b></header>${html}`;
    root.querySelector('[data-reading-home]').onclick = leave;
    window.scrollTo(0, 0);
  }
  function pending() {
    try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; }
  }
  async function rpc(action, row = null) {
    const response = await fetch(CLOUD.url + '/rest/v1/rpc/nz_reading', {
      method: 'POST', headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: store.session.token, p_action: action, p_row: row }),
      signal: AbortSignal.timeout(12000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('reading_unavailable');
    return response.json();
  }
  function historyMarkup() {
    if (!history.length) return '<p class="reading-note">Первый замер станет вашей точкой отсчёта.</p>';
    return `<section class="reading-history"><h3>Ваши последние замеры</h3><div class="reading-history-table"><table><thead><tr><th>Дата</th><th>Слов/мин</th><th>Понимание</th></tr></thead><tbody>${history.slice(0,7).map(row => `<tr><td>${new Date(row.created_at).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow',day:'numeric',month:'short'})}<small>${esc(READING_TEXTS.find(text => text.id === row.text_id)?.title || 'Текст')}</small></td><td>${row.wpm}</td><td>${row.correct} из ${row.questions}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function intro() {
    stage = 'intro';
    const saved = pending();
    paint(`<section class="reading-intro glass"><h1>Как быстро вы читаете?</h1><p>Прочитайте текст выбранного уровня в привычном темпе, затем ответьте на вопросы. Получите скорость в словах в минуту и отдельный результат понимания.</p><ol><li>Нажмите «Начать чтение» — появятся текст и таймер.</li><li>Прочитайте весь текст и нажмите «Я прочитал(а)».</li><li>Ответьте на вопросы по содержанию.</li></ol><label class="reading-select">Текст и уровень<select data-reading-text>${READING_TEXTS.map(text => `<option value="${text.id}">Уровень ${text.level} · ${esc(text.title)} · ${wordCount(text.paragraphs.join(' '))} слов</option>`).join('')}</select></label><p class="reading-note">Для следующего замера выбирайте незнакомый текст: повторное чтение знакомого текста влияет на скорость. При уходе из вкладки таймер ставится на паузу.</p><button class="btn btn--primary btn--block" data-reading-start>Начать чтение</button>${saved ? '<p class="reading-note">Есть несохранённый замер.</p><button class="btn btn--glass btn--block" data-reading-restore>Сохранить предыдущий замер</button>' : ''}</section>${historyMarkup()}`);
    root.querySelector('[data-reading-start]').onclick = () => {
      passage = READING_TEXTS.find(text => text.id === root.querySelector('[data-reading-text]').value);
      elapsed = 0;
      trackAction('reading_start');
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
    paint(`<div class="reading-toolbar"><span>Чтение</span><b data-reading-clock>0:00</b></div><article class="reading-passage glass"><h1>${esc(passage.title)}</h1>${passage.paragraphs.map(p => '<p>' + esc(p) + '</p>').join('')}</article><div class="reading-finish"><p role="status" data-reading-warning></p><button class="btn btn--primary btn--block" data-reading-finish>Я прочитал(а)</button></div>`);
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
    trackAction('reading_quiz');
    paint(`<section class="reading-quiz"><h1>Что запомнилось?</h1><p>${passage.questions.length} вопроса по прочитанному тексту.</p><form>${passage.questions.map((question,index) => `<fieldset class="glass"><legend>${index+1}. ${esc(question.prompt)}</legend>${question.options.map((option,value) => `<label><input type="radio" required name="q${index}" value="${value}"><span>${esc(option)}</span></label>`).join('')}</fieldset>`).join('')}<button class="btn btn--primary btn--block" type="submit">Посмотреть результат</button></form></section>`);
    root.querySelector('form').onsubmit = event => {
      event.preventDefault();
      const form = event.target;
      const row = {id:crypto.randomUUID(),text_id:passage.id,elapsed_ms:Math.round(elapsed),answers:passage.questions.map((_,i) => Number(form.elements['q'+i].value))};
      try { localStorage.setItem(pendingKey,JSON.stringify(row)); } catch { /* The result can still be saved online. */ }
      save(row);
    };
  }
  async function save(row) {
    stage = 'saving';
    paint('<section class="reading-intro glass"><p role="status">Сохраняем результат…</p></section>');
    try {
      const result = await rpc('save',row);
      try { localStorage.removeItem(pendingKey); } catch { /* Storage may be disabled. */ }
      if (!root.isConnected) return;
      history = [result,...history.filter(item => item.id !== result.id)];
      stage = 'result';
      trackAction('reading_complete');
      const advice = result.correct === result.questions
        ? 'Вы ответили на все вопросы. В следующий раз попробуйте другой текст и сравните скорость при сохранении понимания.'
        : 'Попробуйте чуть более спокойный темп: после каждого абзаца коротко сформулируйте его основную мысль.';
      paint(`<section class="reading-result glass"><h1>Ваш результат</h1><div class="reading-score"><b>${result.wpm}</b><span>слов в минуту</span></div><p class="reading-comprehension">Понимание текста — <b>${result.correct} из ${result.questions}</b></p><p>${advice}</p><small>${result.words} слов за ${(result.elapsed_ms/1000).toFixed(1)} с. Скорость = число слов × 60 / время чтения.</small><button class="btn btn--primary btn--block" data-reading-again>Другой замер</button></section>${historyMarkup()}`);
      root.querySelector('[data-reading-again]').onclick = intro;
    } catch {
      if (!root.isConnected) return;
      paint('<section class="reading-intro glass"><h2>Не удалось сохранить замер</h2><p>Проверьте соединение и действующую подписку. Результат можно отправить повторно.</p><button class="btn btn--primary btn--block" data-reading-retry>Повторить сохранение</button></section>');
      root.querySelector('[data-reading-retry]').onclick = () => save(row);
    }
  }
  paint('<p role="status">Загружаем ваши замеры…</p>');
  try { history = await rpc('history'); if (root.isConnected) intro(); }
  catch {
    if (!root.isConnected) return;
    paint('<section class="reading-intro glass"><h1>Замер скорости чтения</h1><p>Не удалось загрузить замеры. Проверьте соединение и подписку, затем откройте этот раздел ещё раз.</p></section>');
  }
}
