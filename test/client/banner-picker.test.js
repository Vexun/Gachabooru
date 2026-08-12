'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument } = require('./helpers');
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

test('renders an input', () => {
  const { doc } = createDocument();
  const picker = createBannerPicker({ document: doc, fetch: fakeFetch([]) });

  const input = picker.el.querySelector('input');
  assert.ok(input);
  assert.equal(input.type, 'text');
  assert.match(input.placeholder, /tag/);
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
