'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument, fakeTimers } = require('./helpers');
const { createBannerPicker } = require('../../public/banner-picker');

function fakeFetch(results) {
  return async (url) => {
    const queries = [];
    if (typeof url === 'string') {
      queries.push(url);
    }
    return {
      ok: true,
      json: async () => ({ results }),
    };
  };
}

function key(el, key) {
  el.dispatchEvent({ type: 'keydown', key });
}

test('renders an input', () => {
  const { doc } = createDocument();
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch([]) });

  const input = picker.el.querySelector('input');
  assert.ok(input);
  assert.equal(input.type, 'text');
  assert.match(input.placeholder, /tag/);
});

test('input events debounce the search into one request', async () => {
  const { doc } = createDocument();
  const timers = fakeTimers();
  let searches = 0;
  const picker = createBannerPicker({
    document: doc,
    fetch: async () => {
      searches += 1;
      return { ok: true, json: async () => ({ results: [] }) };
    },
    debounceMs: 200,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  picker.input.value = 'hatsune';

  picker.input.dispatchEvent({ type: 'input' });
  picker.input.dispatchEvent({ type: 'input' });
  picker.input.dispatchEvent({ type: 'input' });
  assert.equal(searches, 0, 'no search while the debounce is pending');

  timers.fireAll();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(searches, 1);
});

test('shows suggestions for a query', async () => {
  const { doc } = createDocument();
  const results = [{ value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 }];
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch(results) });

  await picker.search('hatsune');

  const items = picker.el.querySelectorAll('li');
  assert.equal(items.length, 1);
  assert.equal(items[0].textContent, 'hatsune miku');
});

test('selecting a tag calls onChange and shows the chosen banner', async () => {
  const { doc } = createDocument();
  let selected = null;
  const tag = { value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 };
  const picker = createBannerPicker({
    document: doc,
    fetch: fakeFetch([tag]),
    onChange: (t) => {
      selected = t;
    },
  });

  await picker.search('hatsune');
  const item = picker.el.querySelectorAll('li')[0];
  item.click();

  assert.deepEqual(picker.getValue(), tag);
  assert.equal(selected.value, 'hatsune_miku');
  assert.equal(picker.chosen.textContent, 'hatsune miku');
  assert.equal(picker.chosen.hidden, false);
});

test('suggestions hide after selection', async () => {
  const { doc } = createDocument();
  const tag = { value: 'spaghetti', label: 'spaghetti', category: 0, post_count: 50 };
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch([tag]) });

  await picker.search('spaghetti');
  assert.equal(picker.el.querySelector('ul').hidden, false);

  picker.el.querySelectorAll('li')[0].click();
  assert.equal(picker.el.querySelector('ul').hidden, true);
});

test('shows a message when there are no results', async () => {
  const { doc } = createDocument();
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch([]) });

  await picker.search('zzzz');

  const item = picker.el.querySelector('li.empty');
  assert.ok(item);
  assert.match(item.textContent, /No matching tags/);
});

test('clears suggestions on an empty query', async () => {
  const { doc } = createDocument();
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch([]) });

  await picker.search('hatsune');
  assert.equal(picker.el.querySelector('ul').hidden, false);

  await picker.search('');
  assert.equal(picker.el.querySelector('ul').hidden, true);
});

test('arrow keys move the active suggestion and wrap', async () => {
  const { doc } = createDocument();
  const results = [
    { value: 'a', label: 'alpha', category: 4, post_count: 1 },
    { value: 'b', label: 'beta', category: 4, post_count: 2 },
    { value: 'c', label: 'gamma', category: 4, post_count: 3 },
  ];
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch(results) });
  await picker.search('a');

  const items = picker.el.querySelectorAll('li');
  assert.equal(items.length, 3);
  assert.equal(items[0].classList.contains('active'), true);
  assert.equal(items[0].getAttribute('aria-selected'), 'true');

  key(picker.input, 'ArrowDown');
  assert.equal(items[1].classList.contains('active'), true);
  assert.equal(items[0].classList.contains('active'), false);
  assert.equal(picker.input.getAttribute('aria-activedescendant'), 'suggestion-1');

  key(picker.input, 'ArrowUp');
  assert.equal(items[0].classList.contains('active'), true);

  key(picker.input, 'ArrowUp');
  assert.equal(items[2].classList.contains('active'), true);

  key(picker.input, 'ArrowDown');
  assert.equal(items[0].classList.contains('active'), true);
});

test('enter fills the highlighted suggestion', async () => {
  const { doc } = createDocument();
  let changed = null;
  const results = [
    { value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 },
    { value: 'hatsune_ai', label: 'hatsune ai', category: 0, post_count: 10 },
  ];
  const picker = createBannerPicker({
    document: doc,
    fetch: fakeFetch(results),
    onChange: (t) => {
      changed = t;
    },
  });
  await picker.search('hatsune');

  key(picker.input, 'ArrowDown');
  key(picker.input, 'Enter');

  assert.equal(picker.getValue().value, 'hatsune_ai');
  assert.equal(changed.value, 'hatsune_ai');
  assert.equal(picker.el.querySelector('ul').hidden, true);
  assert.equal(picker.chosen.textContent, 'hatsune ai');
  assert.equal(picker.input.getAttribute('aria-expanded'), 'false');
});

test('tab fills the highlighted suggestion', async () => {
  const { doc } = createDocument();
  const tag = { value: 'spaghetti', label: 'spaghetti', category: 0, post_count: 50 };
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch([tag]) });
  await picker.search('spaghetti');

  key(picker.input, 'Tab');

  assert.equal(picker.getValue().value, 'spaghetti');
  assert.equal(picker.el.querySelector('ul').hidden, true);
});

test('a second enter rolls the selected banner', async () => {
  const { doc } = createDocument();
  let rolls = 0;
  const tag = { value: 'spaghetti', label: 'spaghetti', category: 0, post_count: 50 };
  const picker = createBannerPicker({
    document: doc,
    fetch: fakeFetch([tag]),
    onSubmit: () => {
      rolls += 1;
    },
  });

  await picker.search('spaghetti');
  key(picker.input, 'Enter');
  assert.equal(rolls, 0);

  key(picker.input, 'Enter');
  assert.equal(rolls, 1);
});

test('enter with the list open fills instead of rolling', async () => {
  const { doc } = createDocument();
  let rolls = 0;
  const results = [{ value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 }];
  const picker = createBannerPicker({
    document: doc,
    fetch: fakeFetch(results),
    onSubmit: () => {
      rolls += 1;
    },
  });
  await picker.search('hatsune');

  key(picker.input, 'Enter');

  assert.equal(rolls, 0);
  assert.equal(picker.el.querySelector('ul').hidden, true);
});

test('enter with an open empty list does not roll', async () => {
  const { doc } = createDocument();
  let rolls = 0;
  const tag = { value: 'spaghetti', label: 'spaghetti', category: 0, post_count: 50 };
  const fetchImpl = async (url) => {
    const results = String(url).includes('zzzz') ? [] : [tag];
    return { ok: true, json: async () => ({ results }) };
  };
  const picker = createBannerPicker({
    document: doc,
    fetch: fetchImpl,
    onSubmit: () => {
      rolls += 1;
    },
  });

  await picker.search('spaghetti');
  picker.el.querySelectorAll('li')[0].click();
  assert.deepEqual(picker.getValue(), tag);
  assert.equal(picker.el.querySelector('ul').hidden, true);

  await picker.search('zzzz');
  assert.equal(picker.el.querySelector('ul').hidden, false);

  key(picker.input, 'Enter');

  assert.equal(rolls, 0);
});

test('escape closes the suggestions', async () => {
  const { doc } = createDocument();
  const picker = createBannerPicker({
    document: doc,
    fetch: fakeFetch([{ value: 'a', label: 'a', category: 4, post_count: 1 }]),
  });
  await picker.search('a');
  assert.equal(picker.el.querySelector('ul').hidden, false);

  key(picker.input, 'Escape');

  assert.equal(picker.el.querySelector('ul').hidden, true);
  assert.equal(picker.input.getAttribute('aria-expanded'), 'false');
});

test('exposes combobox and listbox semantics', async () => {
  const { doc } = createDocument();
  const results = [{ value: 'a', label: 'a', category: 4, post_count: 1 }];
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch(results) });
  assert.equal(picker.input.getAttribute('role'), 'combobox');
  assert.equal(picker.input.getAttribute('aria-expanded'), 'false');

  await picker.search('a');

  assert.equal(picker.input.getAttribute('aria-expanded'), 'true');
  assert.equal(picker.el.querySelector('ul').getAttribute('role'), 'listbox');
  const item = picker.el.querySelectorAll('li')[0];
  assert.equal(item.getAttribute('role'), 'option');
  assert.equal(item.id, 'suggestion-0');
  assert.equal(item.getAttribute('aria-selected'), 'true');
  assert.equal(picker.input.getAttribute('aria-activedescendant'), 'suggestion-0');
});
