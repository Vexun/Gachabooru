'use strict';

function createGallery({ document, fetch: fetchImpl, pageSize = 20 }) {
  const root = document.createElement('div');
  root.className = 'gallery';

  const heading = document.createElement('h2');
  heading.textContent = 'Collection';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'gallery-empty';
  emptyEl.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  const pager = document.createElement('nav');
  pager.className = 'gallery-pager';
  pager.hidden = true;

  const pageFirstBtn = document.createElement('button');
  pageFirstBtn.type = 'button';
  pageFirstBtn.className = 'pager-first';
  pageFirstBtn.textContent = '\u00ab';
  pageFirstBtn.setAttribute('aria-label', 'First page');

  const pagePrevBtn = document.createElement('button');
  pagePrevBtn.type = 'button';
  pagePrevBtn.className = 'pager-prev';
  pagePrevBtn.textContent = '\u2039';
  pagePrevBtn.setAttribute('aria-label', 'Previous page');

  const pagesEl = document.createElement('div');
  pagesEl.className = 'pager-pages';

  const pageNextBtn = document.createElement('button');
  pageNextBtn.type = 'button';
  pageNextBtn.className = 'pager-next';
  pageNextBtn.textContent = '\u203a';
  pageNextBtn.setAttribute('aria-label', 'Next page');

  const pageLastBtn = document.createElement('button');
  pageLastBtn.type = 'button';
  pageLastBtn.className = 'pager-last';
  pageLastBtn.textContent = '\u00bb';
  pageLastBtn.setAttribute('aria-label', 'Last page');

  pager.append(pageFirstBtn, pagePrevBtn, pagesEl, pageNextBtn, pageLastBtn);

  const detail = document.createElement('div');
  detail.className = 'gallery-detail';
  detail.hidden = true;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'gallery-nav gallery-prev';
  prevBtn.textContent = '\u2039';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'gallery-nav gallery-next';
  nextBtn.textContent = '\u203a';

  const detailImg = document.createElement('img');
  detailImg.className = 'gallery-detail-img';
  const detailMeta = document.createElement('div');
  detailMeta.className = 'gallery-detail-meta';
  const detailCounter = document.createElement('div');
  detailCounter.className = 'gallery-counter';
  const postLink = document.createElement('a');
  postLink.className = 'gallery-post-link';
  postLink.textContent = 'View on Danbooru';
  postLink.target = '_blank';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'gallery-delete';
  deleteBtn.textContent = 'Delete';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'gallery-close';
  closeBtn.textContent = 'Close';

  detail.append(
    prevBtn,
    detailImg,
    detailMeta,
    detailCounter,
    postLink,
    deleteBtn,
    closeBtn,
    nextBtn,
  );
  root.append(heading, grid, emptyEl, pager, detail);

  let items = [];
  let page = 1;
  let total = 0;
  let loading = false;
  let detailItem = null;
  let detailIndex = -1;
  let confirmArmed = false;

  function srcFor(item) {
    return `/collections/${item.file_path}`;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(total / pageSize));
  }

  function globalIndex() {
    return (page - 1) * pageSize + detailIndex;
  }

  // Always show page 1 and the last page, plus the pages around the
  // current one. Insert an ellipsis wherever the page numbers jump.
  function pageWindow(current, count) {
    const pages = new Set([1, count]);
    for (let p = current - 2; p <= current + 2; p++) {
      if (p >= 1 && p <= count) {
        pages.add(p);
      }
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const entries = [];
    for (const p of sorted) {
      const last = entries[entries.length - 1];
      if (last && last.page !== undefined && p - last.page > 1) {
        entries.push({ ellipsis: true });
      }
      entries.push({ page: p });
    }
    return entries;
  }

  function render() {
    grid.textContent = '';
    emptyEl.hidden = items.length !== 0;
    emptyEl.textContent = items.length === 0 ? 'Nothing collected yet.' : '';
    for (const item of items) {
      const card = document.createElement('figure');
      card.className = 'gallery-item';
      card.dataset.postId = String(item.post_id);
      const img = document.createElement('img');
      img.src = srcFor(item);
      img.alt = `post ${item.post_id}`;
      card.append(img);
      if (item.downloaded === false) {
        const chip = document.createElement('div');
        chip.className = 'gallery-pending-chip';
        chip.textContent = 'pending';
        card.append(chip);
      }
      card.addEventListener('click', () => openDetail(item));
      grid.append(card);
    }
    renderPager();
  }

  function renderPager() {
    const count = pageCount();
    pager.hidden = count <= 1;
    if (pager.hidden) {
      return;
    }
    pageFirstBtn.disabled = loading || page <= 1;
    pagePrevBtn.disabled = loading || page <= 1;
    pageNextBtn.disabled = loading || page >= count;
    pageLastBtn.disabled = loading || page >= count;

    pagesEl.textContent = '';
    for (const entry of pageWindow(page, count)) {
      if (entry.ellipsis) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pager-ellipsis';
        ellipsis.textContent = '\u2026';
        pagesEl.append(ellipsis);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'page-number';
      btn.textContent = String(entry.page);
      if (entry.page === page) {
        btn.classList.add('page-current');
        btn.setAttribute('aria-current', 'page');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          goToPage(entry.page);
        });
      }
      pagesEl.append(btn);
    }
  }

  function renderDetail() {
    const item = items[detailIndex];
    if (!item) {
      return;
    }
    detailItem = item;
    confirmArmed = false;
    deleteBtn.textContent = 'Delete';
    detailImg.src = srcFor(item);
    detailImg.alt = `post ${item.post_id}`;
    detailMeta.textContent = `${item.banner_tag} — earned ${new Date(
      item.earned_at,
    ).toLocaleString()}`;
    detailCounter.textContent = `${globalIndex() + 1} of ${total}`;
    postLink.href = item.danbooru_url || '#';
    prevBtn.disabled = globalIndex() <= 0;
    nextBtn.disabled = globalIndex() >= total - 1;
  }

  function openDetail(item) {
    detailIndex = items.findIndex((entry) => entry.post_id === item.post_id);
    if (detailIndex === -1) {
      detailIndex = items.length > 0 ? 0 : -1;
    }
    renderDetail();
    detail.hidden = false;
  }

  async function goPrev() {
    if (detail.hidden || detailIndex < 0) {
      return;
    }
    if (detailIndex > 0) {
      detailIndex -= 1;
      renderDetail();
      return;
    }
    if (page > 1) {
      const loaded = await goToPage(page - 1);
      if (loaded && items.length > 0) {
        detailIndex = items.length - 1;
        renderDetail();
      }
    }
  }

  async function goNext() {
    if (detail.hidden || detailIndex < 0) {
      return;
    }
    if (detailIndex < items.length - 1) {
      detailIndex += 1;
      renderDetail();
      return;
    }
    if (page < pageCount()) {
      const loaded = await goToPage(page + 1);
      if (loaded && items.length > 0) {
        detailIndex = 0;
        renderDetail();
      }
    }
  }

  function closeDetail() {
    detailItem = null;
    detailIndex = -1;
    confirmArmed = false;
    detail.hidden = true;
  }

  async function removeItem(postId) {
    const res = await fetchImpl(`/api/earned/${postId}`, { method: 'DELETE' });
    if (!res.ok) {
      return false;
    }
    total = Math.max(0, total - 1);
    // Deleting an entry shifts later entries up a page slot; refetch the
    // current page so the grid matches the server again.
    await goToPage(page, { force: true });
    return true;
  }

  async function fetchPage(targetPage) {
    const res = await fetchImpl(`/api/earned?page=${targetPage}&limit=${pageSize}`);
    if (!res.ok) {
      return null;
    }
    return res.json();
  }

  async function goToPage(target, opts = {}) {
    const clamped = Math.min(Math.max(1, target), pageCount());
    if (loading || (!opts.force && clamped === page && items.length > 0)) {
      return false;
    }
    loading = true;
    renderPager();
    let loaded = false;
    try {
      const data = await fetchPage(clamped);
      if (data) {
        items = data.entries || [];
        page = clamped;
        total = typeof data.total === 'number' ? data.total : items.length;
        loaded = true;
      }
    } catch {
      // keep the current page on failure
    } finally {
      loading = false;
    }
    render();
    return loaded;
  }

  function load() {
    return goToPage(1, { force: true });
  }

  deleteBtn.addEventListener('click', () => {
    if (!detailItem) {
      return;
    }
    if (!confirmArmed) {
      confirmArmed = true;
      deleteBtn.textContent = 'Confirm delete?';
      return;
    }
    removeItem(detailItem.post_id).then((removed) => {
      if (removed) {
        closeDetail();
      }
    });
  });

  closeBtn.addEventListener('click', closeDetail);
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', () => {
    goNext();
  });
  pageFirstBtn.addEventListener('click', () => {
    goToPage(1);
  });
  pagePrevBtn.addEventListener('click', () => {
    goToPage(page - 1);
  });
  pageNextBtn.addEventListener('click', () => {
    goToPage(page + 1);
  });
  pageLastBtn.addEventListener('click', () => {
    goToPage(pageCount());
  });
  document.addEventListener('keydown', (event) => {
    if (detail.hidden) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      goPrev();
      if (event.preventDefault) {
        event.preventDefault();
      }
    } else if (event.key === 'ArrowRight') {
      goNext();
      if (event.preventDefault) {
        event.preventDefault();
      }
    } else if (event.key === 'Escape') {
      closeDetail();
    }
  });

  return {
    el: root,
    load,
    goToPage,
    render,
    openDetail,
    closeDetail,
    goPrev,
    goNext,
    removeItem,
    getItems: () => items,
    getDetail: () => (detailItem ? { ...detailItem } : null),
    getDetailIndex: () => detailIndex,
    isDetailOpen: () => !detail.hidden,
    getPage: () => page,
    getPageCount: () => pageCount(),
  };
}

if (typeof window !== 'undefined') {
  window.createGallery = createGallery;
}

if (typeof module !== 'undefined') {
  module.exports = { createGallery };
}
