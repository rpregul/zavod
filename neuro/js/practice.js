// A single untimed action on the instruction screen, outside the scored round.
export function mountPractice(host, id, start) {
  if (id==='colors') {host.querySelector('[data-skip]').hidden=true;host.querySelector('small').hidden=true;}
  const prompt = host.querySelector('[data-prompt]');
  const field = host.querySelector('[data-example]');
  const feedback = host.querySelector('[role=status]');
  function show(text, html) {
    prompt.textContent = text;
    field.innerHTML = html;
    feedback.textContent = '';
  }
  function answer(correct, hint) {
    if (!correct) {
      feedback.textContent = hint;
      return;
    }
    show('Верно!', '<button class="btn btn--primary btn--lg btn--block btn--shine" data-begin>Начать упражнение</button>');
    const button = field.querySelector('[data-begin]');
    button.onclick = start;
    button.focus();
    host.querySelector('[data-skip]').hidden = true;
  }
  host.querySelector('[data-skip]').onclick = start;
  function options(labels, onPick) {
    for (const label of labels) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = () => onPick(label, button);
      field.append(button);
    }
  }
  if (id === 'sch_f' || id === 'sch_r') {
    const reverse = id === 'sch_r';
    const sequence = reverse ? [25,24] : [1,2];
    let index = 0;
    show('Нажмите ' + sequence[0], '');
    field.classList.add('number-grid');
    options(reverse ? [23,25,24,22] : [3,1,4,2], (value, button) => {
      if (value !== sequence[index]) return answer(false, 'Найдите число ' + sequence[index]);
      button.disabled = true;
      if (++index === sequence.length) return answer(true);
      feedback.textContent = '';
      prompt.textContent = 'Теперь ' + sequence[index];
    });
    if (reverse) for (const button of field.children) button.innerHTML='<span class="upside">'+button.textContent+'</span>';
  } else if (id === 'colors') {
    show('Какого цвета буквы?', '<strong class="ink">Красный</strong>');
    options(['Красного','Синего'], label => answer(label === 'Синего','Посмотрите на краску букв.'));
  } else if (id === 'dob') {
    show('Нажмите общий рисунок', '<div class="practice-card">🍋　🌙　🎈</div><div class="practice-card">⭐　🍋　🌷</div>');
    for (const card of field.children) {
      const symbols = card.textContent.split('　');
      card.replaceChildren();
      for (const symbol of symbols) {
        const button = document.createElement('button');
        button.textContent = symbol;
        button.onclick = () => answer(symbol === '🍋','Лимон есть на обеих карточках.');
        card.append(button);
      }
    }
  } else if (id === 'market') {
    show('Подберите сумму двух цен', '<strong>20 ₽ + 30 ₽</strong><label class="practice-scale"><input type="range" min="0" max="100" step="5" value="20" aria-label="Сумма"><output>20 ₽</output></label><button data-check>Проверить</button>');
    const slider = field.querySelector('input');
    slider.oninput = () => {field.querySelector('output').textContent = slider.value+' ₽';};
    field.querySelector('[data-check]').onclick = () => answer(Number(slider.value) === 50,'Передвиньте отметку к 50 ₽.');
  } else if (id === 'mem' || id === 'percent') {
    function entry() {
      const math = id === 'percent';
      show(math ? 'Сколько будет 10% от 100?' : 'Какое слово было на карточке?', '<form><input aria-label="Ваш ответ" placeholder="Ваш ответ" autocomplete="off"><button>Проверить</button></form>');
      const input = field.querySelector('input');
      if (math) input.inputMode='numeric';
      input.focus();
      field.querySelector('form').onsubmit = event => {
        event.preventDefault();
        const value=input.value.trim().toLowerCase();
        answer(math ? value === '10' : value === 'мост', math ? 'Разделите 100 на 100 и умножьте на 10.' : 'Подсказка — мост.');
      };
    }
    if (id === 'percent') entry();
    else {
      show('Запомните слово', '<strong>Мост</strong><button>Я запомнил</button>');
      field.querySelector('button').onclick = entry;
    }
  }
}
