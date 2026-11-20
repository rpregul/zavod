const groups = {
  young: ['Практика для учёбы', '▤', ['Упражняться в запоминании слов.', 'Практиковаться выполнять задания по правилу.', 'Проверять, что удалось понять из прочитанного.']],
  adult: ['Зарядка перед рабочим днём', '◎', ['Повысить личную продуктивность и эффективность.', 'Делать меньше ошибок и недочётов на работе.', 'Держать мозг в тонусе в течение дня.', 'Начать быстрее читать и понимать больше информации.']],
  senior: ['Занятия в своём темпе', '✦', ['Регулярно решать задачи на внимание.', 'Практиковаться вспоминать слова.', 'Сравнивать результаты со своими прошлыми попытками.']]
};
const controls = [...document.querySelectorAll('[data-age]')];
controls.forEach(button => button.addEventListener('click', () => {
  const [title, icon, points] = groups[button.dataset.age];
  controls.forEach(control => control.setAttribute('aria-pressed', String(control === button)));
  document.querySelector('#age-title').textContent = title;
  document.querySelector('#age-icon').textContent = icon;
  document.querySelector('#age-list').replaceChildren(...points.map(point => {
    const item = document.createElement('li');
    item.textContent = point;
    return item;
  }));
}));
const pulse = document.querySelector('.pulse');
document.querySelector('#signal').addEventListener('click', () => {
  pulse.classList.remove('firing');
  void pulse.getBoundingClientRect();
  pulse.classList.add('firing');
});

const tiles = [...document.querySelectorAll('[data-number]')];
const demoStatus = document.querySelector('#demo-status');
const resetDemo = document.querySelector('#demo-reset');
let nextNumber = 1;

tiles.forEach((tile, index) => tile.addEventListener('click', () => {
  if (tile.disabled) return;
  if (Number(tile.dataset.number) !== nextNumber) {
    demoStatus.textContent = `Сначала найдите число ${nextNumber}`;
    return;
  }

  tile.disabled = true;
  nextNumber += 1;
  if (nextNumber > tiles.length) {
    demoStatus.textContent = 'Готово! Все числа на месте.';
    resetDemo.hidden = false;
    resetDemo.focus();
    return;
  }

  demoStatus.textContent = `Теперь найдите число ${nextNumber}`;
  const remaining = [...tiles.slice(index + 1), ...tiles.slice(0, index)];
  remaining.find(candidate => !candidate.disabled).focus();
}));

resetDemo.addEventListener('click', () => {
  nextNumber = 1;
  tiles.forEach(tile => { tile.disabled = false; });
  demoStatus.textContent = 'Найдите число 1';
  resetDemo.hidden = true;
  tiles[0].focus();
});
