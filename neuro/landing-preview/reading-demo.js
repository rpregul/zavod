(() => {
  const demo = document.querySelector('.reading-demo');
  const get = id => demo.querySelector('#' + id);
  const tabs = [...demo.querySelectorAll('[role="tab"]')];
  const usual = get('reading-usual-text');
  const highlighted = get('reading-highlighted');
  const transcript = get('reading-focus-text');
  const usualPlay = get('reading-usual-play');
  const focusPlay = get('reading-focus-play');
  const speed = get('reading-speed');
  const before = get('reading-word-before');
  const pivot = get('reading-word-pivot');
  const after = get('reading-word-after');
  const status = get('reading-focus-status');
  let usualTimer, focusTimer, usualObserver;
  let tokens = [], words = [], marked = [];
  let cursor = 0, wordIndex = 0, lastRollback = 0;

  function stopUsual(label) {
    clearTimeout(usualTimer);
    usualTimer = undefined;
    usualPlay.textContent = label;
  }

  function stopFocus(label) {
    clearTimeout(focusTimer);
    focusTimer = undefined;
    focusPlay.textContent = label;
  }

  function activateTab(next, moveFocus = false) {
    if (usualTimer !== undefined) stopUsual('Продолжить');
    if (focusTimer !== undefined) stopFocus('Продолжить');
    tabs.forEach(tab => {
      const active = tab === next;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      get(tab.getAttribute('aria-controls')).hidden = !active;
    });
    if (moveFocus) next.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      const next = {
        ArrowRight: tabs[(index + 1) % tabs.length],
        ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1]
      }[event.key];
      if (!next) return;
      event.preventDefault();
      activateTab(next, true);
    });
  });

  function showPair(start, returning) {
    marked.forEach(word => word.classList.remove('is-current', 'is-return'));
    marked = tokens.slice(start, start + 2);
    marked.forEach(word => word.classList.add(returning ? 'is-return' : 'is-current'));
  }

  function rollbackAt(start) {
    let line = 0;
    let top = tokens[0].offsetTop;
    for (let i = 1; i <= start; i += 1) {
      const nextTop = tokens[i].offsetTop;
      if (nextTop === top) continue;
      top = nextTop;
      line += 1;
      if (line % 3 === 0 && i > lastRollback) return i;
    }
    return 0;
  }

  function tickUsual() {
    if (cursor >= tokens.length) {
      highlighted.hidden = true;
      usual.classList.remove('reading-source-active');
      get('reading-usual-status').textContent = 'Демонстрация завершена.';
      cursor = 0;
      stopUsual('Посмотреть ещё раз');
      return;
    }
    const boundary = rollbackAt(cursor);
    if (boundary) {
      lastRollback = boundary;
      cursor = Math.max(0, cursor - 4);
    }
    showPair(cursor, Boolean(boundary));
    const count = marked.length;
    cursor += count;
    usualTimer = setTimeout(tickUsual, count * 60000 / 200);
  }

  const splitWords = text => text.trim().match(/\S+/g) || [];

  function toggleUsual() {
    usualObserver?.disconnect();
    if (usualTimer !== undefined) {
      stopUsual('Продолжить');
      return;
    }
    if (cursor === 0) {
      tokens = splitWords(usual.textContent).map(text => {
        const token = document.createElement('span');
        token.textContent = text;
        return token;
      });
      if (tokens.length === 0) return;
      highlighted.replaceChildren(...tokens.flatMap((token, index) => index ? [' ', token] : [token]));
      usual.classList.add('reading-source-active');
      highlighted.hidden = false;
      lastRollback = 0;
    }
    get('reading-usual-status').textContent = '';
    usualPlay.textContent = 'Пауза';
    tickUsual();
  }

  usualPlay.addEventListener('click', toggleUsual);
  const isEditor = new URLSearchParams(location.search).get('edit') === '1';
  if (!isEditor && !matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    usualObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) toggleUsual();
    }, { rootMargin: '0px 0px -15% 0px' });
    usualObserver.observe(highlighted.parentElement);
  }

  function showWord(word) {
    const letters = [...word];
    const indexes = letters.flatMap((letter, index) => /\p{L}/u.test(letter) ? [index] : []);
    const center = indexes[Math.floor((indexes.length - 1) / 2)] ?? Math.floor(letters.length / 2);
    before.textContent = letters.slice(0, center).join('');
    pivot.textContent = letters[center];
    after.textContent = letters.slice(center + 1).join('');
  }

  const delay = () => 60000 / Number(speed.value);
  function tickFocus() {
    if (wordIndex >= words.length) {
      wordIndex = 0;
      status.textContent = 'Текст закончился. Сформулируйте его главную мысль.';
      stopFocus('Читать снова');
      return;
    }
    showWord(words[wordIndex]);
    wordIndex += 1;
    focusTimer = setTimeout(tickFocus, delay());
  }

  speed.addEventListener('input', () => {
    get('reading-speed-value').textContent = speed.value + ' слов/мин';
    speed.setAttribute('aria-valuetext', speed.value + ' слов в минуту');
    if (focusTimer === undefined) return;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(tickFocus, delay());
  });

  focusPlay.addEventListener('click', () => {
    if (focusTimer !== undefined) {
      stopFocus('Продолжить');
      return;
    }
    if (wordIndex === 0) words = splitWords(transcript.textContent);
    if (words.length === 0) return;
    status.textContent = '';
    focusPlay.textContent = 'Пауза';
    tickFocus();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (usualTimer !== undefined) stopUsual('Продолжить');
    if (focusTimer !== undefined) stopFocus('Продолжить');
  });
})();
