const groups = {
  young: ['Практика для учёбы', '▤', ['Упражняться в запоминании слов.', 'Практиковаться выполнять задания по правилу.', 'Проверять, что удалось понять из прочитанного.']],
  adult: ['Зарядка перед рабочим днём', '◎', ['Потренироваться замечать детали.', 'Практиковать концентрацию в коротких заданиях.', 'Замерить скорость чтения и понимание текста.']],
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
