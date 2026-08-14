'use strict';

function createGallery({ document, fetch: fetchImpl, pageSize = 30 }) {
  const root = document.createElement('div');
  root.className = 'gallery';

  const heading = document.createElement('h2');
  heading.textContent = 'Collection';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'gallery-empty';
  emptyEl.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.type = 'button';
  loadMoreBtn.className = 'gallery-more';
  loadMoreBtn.textContent = 'Load more';
  loadMoreBtn.hidden = true;

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
  root.append(heading, grid, emptyEl, loadMoreBtn, detail);

  let items = [];
  let page = 0;
  let total = 0;
  let loading = false;
  let detailItem = null;
  let detailIndex = -1;
  let confirmArmed = false;

  function srcFor(item) {
    return `/collections/${item.file_path}`;
  }

  function updateLoadMore() {
    loadMoreBtn.disabled = loading;
    loadMoreBtn.hidden = page * pageSize >= total;
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
    updateLoadMore();
  }

  function hasMore() {
    return page * pageSize < total;
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
    detailCounter.textContent = `${detailIndex + 1} of ${total}`;
    postLink.href = item.danbooru_url || '#';
    prevBtn.disabled = detailIndex <= 0;
    nextBtn.disabled = detailIndex >= items.length - 1 && !hasMore();
  }

  function openDetail(item) {
    detailIndex = items.findIndex((entry) => entry.post_id === item.post_id);
    if (detailIndex === -1) {
      detailIndex = items.length > 0 ? 0 : -1;
    }
    renderDetail();
    detail.hidden = false;
  }

  function goPrev() {
    if (detailIndex <= 0 || detail.hidden) {
      return;
    }
    detailIndex -= 1;
    renderDetail();
  }

  async function goNext() {
    if (detail.hidden || detailIndex < 0) {
      return;
    }
    if (detailIndex >= items.length - 1) {
      if (hasMore()) {
        await loadMore();
        if (detailIndex < items.length - 1) {
          detailIndex += 1;
          renderDetail();
        }
      }
      return;
    }
    detailIndex += 1;
    renderDetail();
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
    items = items.filter((item) => item.post_id !== postId);
    total = Math.max(0, total - 1);
    render();
    return true;
  }

  async function fetchPage(targetPage) {
    const res = await fetchImpl(`/api/earned?page=${targetPage}&limit=${pageSize}`);
    if (!res.ok) {
      return null;
    }
    return res.json();
  }

  async function load() {
    loading = true;
    updateLoadMore();
    try {
      const data = await fetchPage(1);
      if (data) {
        items = data.entries || [];
        page = 1;
        total = typeof data.total === 'number' ? data.total : items.length;
      }
    } catch {
      // gallery stays empty on failure
    } finally {
      loading = false;
    }
    render();
  }

  async function loadMore() {
    if (loading) {
      return;
    }
    loading = true;
    updateLoadMore();
    try {
      const data = await fetchPage(page + 1);
      if (data) {
        items = items.concat(data.entries || []);
        page += 1;
        if (typeof data.total === 'number') {
          total = data.total;
        }
      }
    } catch {
      // keep the loaded items on failure
    } finally {
      loading = false;
    }
    render();
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
  loadMoreBtn.addEventListener('click', () => {
    loadMore();
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
    loadMore,
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
  };
}

if (typeof window !== 'undefined') {
  window.createGallery = createGallery;
}

if (typeof module !== 'undefined') {
  module.exports = { createGallery };
}
