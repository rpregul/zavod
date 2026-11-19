const tiles = [...document.querySelectorAll('.tiles button')];
const timer = document.querySelector('#time');
const hint = document.querySelector('#hint');
let next = 1;
let started = null;
let interval;
function elapsed() {
  const seconds = Math.floor((performance.now() - started) / 1000);
  timer.value = [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
tiles.forEach(tile => tile.addEventListener('click', () => {
  if (Number(tile.textContent) !== next) {
    hint.textContent = 'Сейчас ищем число ' + next;
    return;
  }
  if (started === null) {
    started = performance.now();
    interval = setInterval(elapsed, 250);
  }
  tile.disabled = true;
  next += 1;
  if (next > 9) {
    clearInterval(interval);
    elapsed();
    hint.textContent = 'Готово! Ваше время: ' + timer.value;
    document.querySelector('#reset').focus();
  } else {
    hint.textContent = 'Следующее число: ' + next;
    if (tile === document.activeElement || document.activeElement === document.body) {
      tiles.find(button => !button.disabled)?.focus();
    }
  }
}));
document.querySelector('#reset').addEventListener('click', () => {
  clearInterval(interval);
  next = 1;
  started = null;
  timer.value = '00:00';
  hint.textContent = 'Начните с числа 1';
  const numbers = tiles.map((_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  tiles.forEach((tile, i) => {
    tile.disabled = false;
    tile.textContent = numbers[i];
  });
  tiles[0].focus();
});
const metrics = {
  reading: { title: 'Скорость чтения', unit: 'слов/мин', values: [210, 228, 221, 248], caption: 'Понимание по попыткам: 4 из 5, 4 из 5, 3 из 5, 4 из 5.' },
  attention: { title: 'Найдено чисел в таблице Шульте', unit: 'чисел', values: [18, 22, 21, 26], caption: 'Сравнивайте число найденных чисел за одинаковое время.' },
  memory: { title: 'Сколько слов удалось вспомнить', unit: 'слов', values: [8, 10, 9, 12], caption: 'Каждый столбец — отдельная попытка.' }
};
const controls = [...document.querySelectorAll('[data-metric]')];
function showMetric(key) {
  const metric = metrics[key];
  controls.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === key)));
  document.querySelector('#metric-name').textContent = metric.title;
  document.querySelector('#metric-caption').textContent = metric.caption;
  const bars = metric.values.map((value, index) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const score = document.createElement('b');
    score.textContent = value + ' ' + metric.unit;
    const fill = document.createElement('i');
    fill.style.height = (value / Math.max(...metric.values) * 100) + '%';
    fill.setAttribute('aria-hidden', 'true');
    const column = document.createElement('div');
    column.className = 'column';
    column.append(fill);
    const label = document.createElement('span');
    label.textContent = 'Попытка ' + (index + 1);
    bar.append(score, column, label);
    return bar;
  });
  document.querySelector('#bars').replaceChildren(...bars);
}
controls.forEach(button => button.addEventListener('click', () => showMetric(button.dataset.metric)));
showMetric('attention');
