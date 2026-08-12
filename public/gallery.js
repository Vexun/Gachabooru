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

  const detailImg = document.createElement('img');
  detailImg.className = 'gallery-detail-img';
  const detailMeta = document.createElement('div');
  detailMeta.className = 'gallery-detail-meta';
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

  detail.append(detailImg, detailMeta, postLink, deleteBtn, closeBtn);
  root.append(heading, grid, emptyEl, loadMoreBtn, detail);

  let items = [];
  let page = 0;
  let total = 0;
  let loading = false;
  let detailItem = null;
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
      card.addEventListener('click', () => openDetail(item));
      grid.append(card);
    }
    updateLoadMore();
  }

  function openDetail(item) {
    detailItem = item;
    confirmArmed = false;
    deleteBtn.textContent = 'Delete';
    detailImg.src = srcFor(item);
    detailImg.alt = `post ${item.post_id}`;
    detailMeta.textContent = `${item.banner_tag} — earned ${new Date(
      item.earned_at,
    ).toLocaleString()}`;
    postLink.href = item.danbooru_url || '#';
    detail.hidden = false;
  }

  function closeDetail() {
    detailItem = null;
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
  loadMoreBtn.addEventListener('click', () => {
    loadMore();
  });

  return {
    el: root,
    load,
    loadMore,
    render,
    openDetail,
    closeDetail,
    removeItem,
    getItems: () => items,
    getDetail: () => (detailItem ? { ...detailItem } : null),
    isDetailOpen: () => !detail.hidden,
  };
}

if (typeof window !== 'undefined') {
  window.createGallery = createGallery;
}

if (typeof module !== 'undefined') {
  module.exports = { createGallery };
}
