'use strict';

function createGallery({ document, fetch: fetchImpl }) {
  const root = document.createElement('div');
  root.className = 'gallery';

  const heading = document.createElement('h2');
  heading.textContent = 'Collection';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'gallery-empty';
  emptyEl.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

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
  root.append(heading, grid, emptyEl, detail);

  let items = [];
  let detailItem = null;
  let confirmArmed = false;

  function srcFor(item) {
    return `/collections/${item.file_path}`;
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
    render();
    return true;
  }

  async function load() {
    try {
      const res = await fetchImpl('/api/earned');
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      items = data.entries || [];
      render();
    } catch {
      // gallery stays empty on failure
    }
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

  return {
    el: root,
    load,
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
