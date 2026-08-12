'use strict';

function createBannerPicker({ document, fetch: fetchImpl, onChange, debounceMs = 200 }) {
  const root = document.createElement('div');
  root.className = 'banner-picker';

  const label = document.createElement('label');
  label.textContent = 'Banner tag';
  label.htmlFor = 'banner-input';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'banner-input';
  input.placeholder = 'Search a tag\u2026';
  input.setAttribute('autocomplete', 'off');

  const chosen = document.createElement('div');
  chosen.className = 'chosen-banner';
  chosen.hidden = true;

  const list = document.createElement('ul');
  list.className = 'suggestions';
  list.hidden = true;

  root.append(label, input, chosen, list);

  let selected = null;
  let seq = 0;
  let debounceTimer = null;

  function clearSuggestions() {
    list.textContent = '';
    list.hidden = true;
  }

  function renderSuggestions(results) {
    list.textContent = '';
    if (results.length === 0) {
      const item = document.createElement('li');
      item.className = 'empty';
      item.textContent = 'No matching tags';
      list.append(item);
      list.hidden = false;
      return;
    }
    for (const result of results) {
      const item = document.createElement('li');
      item.textContent = result.label;
      item.dataset.value = result.value;
      item.addEventListener('click', () => selectTag(result));
      list.append(item);
    }
    list.hidden = false;
  }

  async function search(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      seq += 1;
      clearSuggestions();
      return;
    }
    const mySeq = ++seq;
    try {
      const res = await fetchImpl(`/api/autocomplete?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (mySeq !== seq) {
        return;
      }
      renderSuggestions(data.results || []);
    } catch {
      if (mySeq === seq) {
        renderSuggestions([]);
      }
    }
  }

  function selectTag(tag) {
    selected = tag;
    input.value = tag.label;
    chosen.textContent = tag.label;
    chosen.hidden = false;
    clearSuggestions();
    if (onChange) {
      onChange(tag);
    }
  }

  input.addEventListener('input', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => search(input.value), debounceMs);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clearSuggestions();
    }
  });

  return {
    el: root,
    input,
    chosen,
    search,
    clear: clearSuggestions,
    getValue: () => (selected ? { ...selected } : null),
  };
}

if (typeof window !== 'undefined') {
  window.createBannerPicker = createBannerPicker;
}

if (typeof module !== 'undefined') {
  module.exports = { createBannerPicker };
}
