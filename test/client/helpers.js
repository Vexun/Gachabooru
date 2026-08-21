'use strict';

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;

class FakeClassList {
  constructor(el) {
    this.el = el;
    this.names = new Set();
  }

  add(...names) {
    for (const name of names) {
      if (typeof name === 'string' && name.trim()) {
        this.names.add(name);
      }
    }
  }

  remove(...names) {
    for (const name of names) {
      this.names.delete(name);
    }
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    if (force === true) {
      this.add(name);
      return true;
    }
    if (force === false) {
      this.remove(name);
      return false;
    }
    if (this.names.has(name)) {
      this.remove(name);
      return false;
    }
    this.add(name);
    return true;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = NODE_ELEMENT;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.style = {};
    this.id = '';
    this._className = '';
    this._text = '';
    this.value = '';
    this.type = '';
    this.checked = false;
    this.hidden = false;
  }

  get className() {
    return [...this.classList.names].join(' ');
  }

  set className(value) {
    this.classList = new FakeClassList(this);
    for (const name of String(value).trim().split(/\s+/)) {
      if (name) {
        this.classList.names.add(name);
      }
    }
  }

  get textContent() {
    let out = this._text;
    for (const child of this.children) {
      out += child.textContent;
    }
    return out;
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  get innerHTML() {
    return this.children.length ? '<nodes>' : this._text;
  }

  set innerHTML(value) {
    if (value === '') {
      this._text = '';
      this.children = [];
    }
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.appendChild(this.ownerDocument.createTextNode(node));
      } else {
        this.appendChild(node);
      }
    }
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (!list) {
      return;
    }
    const idx = list.indexOf(handler);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;
    const list = this.listeners.get(event.type) || [];
    for (const handler of list) {
      handler.call(this, event);
    }
    return !event.defaultPrevented;
  }

  click() {
    return this.dispatchEvent({ type: 'click' });
  }

  focus() {
    this.focused = true;
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  querySelector(selector) {
    return queryAll(this, selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryAll(this, selector);
  }
}

function parseSelector(selector) {
  selector = selector.trim();
  const parts = selector.split(/([.#])/);
  const out = { tag: null, id: null, classes: [] };
  let idx = 0;
  if (parts.length && /^[a-zA-Z*]/.test(parts[0])) {
    out.tag = parts[0].toUpperCase();
    // Skip the tag token; the class/id pairs start at index 1.
    idx = 1;
  } else if (parts.length) {
    // No tag token; class/id pairs still start at index 1.
    idx = 1;
  }
  while (idx + 1 < parts.length) {
    const sep = parts[idx];
    const name = parts[idx + 1];
    if (sep === '#') {
      out.id = name;
    } else if (sep === '.') {
      out.classes.push(name);
    }
    idx += 2;
  }
  return out;
}

function matchesSimple(el, simple) {
  const parsed = parseSelector(simple);
  if (el.nodeType !== NODE_ELEMENT) {
    return false;
  }
  if (parsed.tag && el.tagName !== parsed.tag) {
    return false;
  }
  if (parsed.id && el.id !== parsed.id) {
    return false;
  }
  for (const cls of parsed.classes) {
    if (!el.classList.contains(cls)) {
      return false;
    }
  }
  return true;
}

// Supports compound selectors ("div.card") and descendant selectors
// (".coin-container .coin"). Combinators other than whitespace are not
// supported.
function matchesSelector(el, selector) {
  const parts = selector.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  if (!matchesSimple(el, parts[parts.length - 1])) {
    return false;
  }
  let node = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (node && !matchesSimple(node, parts[i])) {
      node = node.parentNode;
    }
    if (!node || node.nodeType !== NODE_ELEMENT) {
      return false;
    }
  }
  return true;
}

function queryAll(root, selector) {
  const result = [];
  function walk(node) {
    for (const child of node.children) {
      if (matchesSelector(child, selector)) {
        result.push(child);
      }
      walk(child);
    }
  }
  walk(root);
  return result;
}

class FakeDocument {
  constructor() {
    this.body = this.createElement('body');
    this.head = this.createElement('head');
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    return { nodeType: NODE_TEXT, textContent: String(text), parentNode: null };
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (!list) {
      return;
    }
    const idx = list.indexOf(handler);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const handler of list) {
      handler.call(this, event);
    }
  }

  getElementById(id) {
    return queryAll(this.body, `#${id}`)[0] || null;
  }

  querySelector(selector) {
    return queryAll(this.body, selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryAll(this.body, selector);
  }
}

function createDocument(rootHtml) {
  const doc = new FakeDocument();
  if (rootHtml) {
    const body = doc.createElement('body');
    const text = doc.createTextNode(rootHtml);
    body.append(text);
    return { doc, body: doc.body };
  }
  return { doc, body: doc.body };
}

function click(el) {
  el.click();
}

function textOf(el) {
  return el.textContent;
}

function fakeTimers() {
  const timers = [];
  let nextId = 1;
  return {
    setTimeout(cb, ms) {
      const timer = { id: nextId++, cb, ms };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const idx = timers.findIndex((timer) => timer.id === id);
      if (idx !== -1) {
        timers.splice(idx, 1);
      }
    },
    count() {
      return timers.length;
    },
    pending() {
      return timers.map((timer) => timer.ms);
    },
    fireAll() {
      const copy = [...timers];
      timers.length = 0;
      for (const timer of copy) {
        timer.cb();
      }
    },
  };
}

module.exports = {
  FakeElement,
  FakeDocument,
  createDocument,
  click,
  textOf,
  queryAll,
  fakeTimers,
};
