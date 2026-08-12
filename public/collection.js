'use strict';

function createCollectionPage({
  document,
  fetch: fetchImpl,
  createGallery: galleryFactory,
  createWebSocket,
  wireCloseDetection: closeDetection,
}) {
  const gallerySection = document.getElementById('gallery-section');
  const gallery = galleryFactory({ document, fetch: fetchImpl });
  gallerySection.append(gallery.el);

  return {
    gallery,
    init: () => {
      if (closeDetection && createWebSocket) {
        closeDetection(createWebSocket);
      }
      gallery.load();
    },
  };
}

if (typeof window !== 'undefined') {
  const page = createCollectionPage({
    document,
    fetch,
    createGallery: typeof createGallery !== 'undefined' ? createGallery : null,
    createWebSocket: (url) => new WebSocket(url),
    wireCloseDetection: typeof wireCloseDetection !== 'undefined' ? wireCloseDetection : null,
  });
  page.init();
}

if (typeof module !== 'undefined') {
  module.exports = { createCollectionPage };
}
