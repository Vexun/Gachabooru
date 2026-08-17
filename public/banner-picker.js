'use strict';

function createBannerPicker({ document, fetch: fetchImpl, onChange, onSubmit, debounceMs = 200 }) {
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
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');

  const chosen = document.createElement('div');
  chosen.className = 'chosen-banner';
  chosen.hidden = true;

  const list = document.createElement('ul');
  list.className = 'suggestions';
  list.hidden = true;
  list.setAttribute('role', 'listbox');

  root.append(label, input, chosen, list);

  let selected = null;
  let seq = 0;
  let debounceTimer = null;
  let activeIndex = -1;
  let suggestions = [];
  let items = [];

  function clearSuggestions() {
    list.textContent = '';
    list.hidden = true;
    suggestions = [];
    items = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlightActive() {
    for (let i = 0; i < items.length; i++) {
      const active = i === activeIndex;
      items[i].classList.toggle('active', active);
      if (active) {
        items[i].setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', items[i].id);
        if (items[i].scrollIntoView) {
          items[i].scrollIntoView({ block: 'nearest' });
        }
      } else {
        items[i].setAttribute('aria-selected', 'false');
      }
    }
    if (items.length === 0) {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function renderSuggestions(results) {
    list.textContent = '';
    suggestions = results;
    items = [];
    if (results.length === 0) {
      const item = document.createElement('li');
      item.className = 'empty';
      item.textContent = 'No matching tags';
      list.append(item);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }
    for (let i = 0; i < results.length; i++) {
      const item = document.createElement('li');
      item.textContent = results[i].label;
      item.dataset.value = results[i].value;
      item.id = `suggestion-${i}`;
      item.setAttribute('role', 'option');
      item.addEventListener('click', () => selectTag(results[i]));
      list.append(item);
      items.push(item);
    }
    activeIndex = 0;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlightActive();
  }

  function selectActive(event) {
    const idx = activeIndex >= 0 ? activeIndex : 0;
    const tag = suggestions[idx];
    if (!tag) {
      return;
    }
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    selectTag(tag);
  }

  function moveActive(delta, event) {
    if (items.length === 0) {
      return;
    }
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    activeIndex = (activeIndex + delta + items.length) % items.length;
    highlightActive();
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
      return;
    }
    if (event.key === 'ArrowDown') {
      moveActive(1, event);
      return;
    }
    if (event.key === 'ArrowUp') {
      moveActive(-1, event);
      return;
    }
    if (event.key === 'Enter') {
      if (items.length > 0) {
        selectActive(event);
      } else if (list.hidden && selected && onSubmit) {
        onSubmit();
      }
      return;
    }
    if (event.key === 'Tab' && items.length > 0) {
      selectActive(event);
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
