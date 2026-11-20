(() => {
  const changeKey = 'neuro-landing-text-draft';
  const selector = 'header a, main h1, main h2, main h3, main p, main figcaption, main li, main a, #signal, #demo-reset, footer a';
  const excluded = '#age-title, #age-list, #demo-status, .review-pic, [aria-hidden="true"]';

  function textFields(root) {
    const walker = root.createTreeWalker(root.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return node.data.trim() && parent.closest(selector) && !parent.closest(excluded)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const fields = [];
    while (walker.nextNode()) fields.push(walker.currentNode);
    return fields;
  }

  const fields = textFields(document);
  const source = fields.map(node => node.data);
  const draft = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(changeKey) || '[]');
    for (const {index, original, value} of saved) {
      if (typeof value !== 'string') continue;
      if (source[index] === original) {
        draft.set(index, value);
      } else {
        const match = source.indexOf(original);
        if (match !== -1 && match === source.lastIndexOf(original)) draft.set(match, value);
      }
    }
  } catch {
    // The editor also works without persistent browser storage.
  }

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('editor.css?v=1', document.currentScript.src);
  document.head.append(css);

  const toolbar = document.createElement('aside');
  toolbar.className = 'edit-toolbar';
  toolbar.setAttribute('aria-label', 'Редактор текста');
  toolbar.innerHTML = `
    <div class="edit-toolbar-row">
      <strong>Редактор текста</strong>
      <button type="button" data-preview aria-pressed="false">Предпросмотр</button>
      <button type="button" data-download>Скачать index.html</button>
      <a data-exit href="./">Выйти</a>
    </div>
    <p data-editor-status role="status">Нажмите на выделенный текст, чтобы изменить его.</p>
  `;
  document.body.prepend(toolbar);

  const status = toolbar.querySelector('[data-editor-status]');
  const previewButton = toolbar.querySelector('[data-preview]');
  const download = toolbar.querySelector('[data-download]');
  let editing = true;
  let storageFailed = false;

  function saveDraft() {
    download.disabled = draft.size === 0;
    try {
      localStorage.setItem(changeKey, JSON.stringify([...draft].map(([index, value]) => ({
        index, original: source[index], value
      }))));
    } catch {
      storageFailed = true;
    }
    status.textContent = storageFailed
      ? 'Браузер не сохраняет черновик. Скачайте файл перед выходом.'
      : draft.size ? 'Черновик сохранён в этом браузере.' : 'Нажмите на выделенный текст, чтобы изменить его.';
  }

  const editors = fields.map((node, index) => {
    const editor = document.createElement('span');
    editor.className = 'edit-text';
    editor.contentEditable = 'plaintext-only';
    editor.textContent = draft.get(index) ?? node.data;
    node.replaceWith(editor);
    editor.addEventListener('input', () => {
      if (editor.textContent === source[index]) draft.delete(index);
      else draft.set(index, editor.textContent);
      saveDraft();
    });
    editor.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        editor.blur();
      }
    });
    editor.addEventListener('paste', event => {
      event.preventDefault();
      const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\s*[\r\n]+\s*/g, ' ');
      document.execCommand('insertText', false, text);
    });
    return editor;
  });
  saveDraft();

  function blockActivation(event) {
    if (!editing) return;
    const target = event.target.closest('a, button');
    if (!target || toolbar.contains(target) || target.matches('[data-age]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  document.addEventListener('click', blockActivation, true);

  previewButton.addEventListener('click', () => {
    editing = !editing;
    previewButton.textContent = editing ? 'Предпросмотр' : 'Продолжить правки';
    previewButton.setAttribute('aria-pressed', String(!editing));
    editors.forEach(editor => { editor.contentEditable = editing ? 'plaintext-only' : 'false'; });
  });

  download.addEventListener('click', async () => {
    download.disabled = true;
    try {
      const url = new URL(location.pathname, location.origin);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Page unavailable');
      const exported = new DOMParser().parseFromString(await response.text(), 'text/html');
      const exportedFields = textFields(exported);
      if (source.length !== exportedFields.length || source.some((text, index) => text !== exportedFields[index].data)) {
        status.textContent = 'Страница обновилась. Откройте редактор ещё раз перед скачиванием.';
        return;
      }
      for (const [index, value] of draft) exportedFields[index].data = value;
      const documentHtml = '<!doctype html>\n' + exported.documentElement.outerHTML + '\n';
      const file = URL.createObjectURL(new Blob([documentHtml], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = file;
      link.download = 'index.html';
      toolbar.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(file), 1000);
      status.textContent = 'Файл готов. Чтобы опубликовать правки, пришлите его в чат.';
    } catch {
      status.textContent = 'Не удалось скачать файл. Попробуйте ещё раз.';
    } finally {
      download.disabled = draft.size === 0;
    }
  });
})();
