/* ============================================================
   FUTUREMATCH — card-media.js
   Shared media frame behaviour for course cards.

   Supplier artwork arrives as anything from a 3000px classroom photo to a
   400×120 logo strip, and one presentation can't flatter both: cropping a
   logo to fill the frame beheads it, while a photo shown whole floats in
   dead space. So every image is measured once it decodes and its frame is
   told what it got:

     .is-photo   fills the frame (cover) under a scrim that keeps chips legible
     .is-logo    stays whole (contain) on a soft tint of the course colour
     .is-failed  never arrived — the frame falls back to its monogram

   Exposed as window.FMCardMedia so the catalogue, landing page and course
   page can all re-run it after they inject cards.
   ============================================================ */
(function () {
  'use strict';

  // Photos are large in both directions and roughly landscape-to-square.
  // Logos, badges, banners and screenshots are small, very wide or very tall.
  const MIN_PHOTO_EDGE = 400;
  const MIN_PHOTO_RATIO = 0.8;
  const MAX_PHOTO_RATIO = 2.4;

  function classify(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return 'is-logo';
    const ratio = w / h;
    return (Math.min(w, h) >= MIN_PHOTO_EDGE && ratio >= MIN_PHOTO_RATIO && ratio <= MAX_PHOTO_RATIO)
      ? 'is-photo'
      : 'is-logo';
  }

  function settle(frame, img) {
    frame.classList.remove('is-loading', 'is-failed');
    frame.classList.add(classify(img));
  }

  function fail(frame) {
    frame.classList.remove('is-loading', 'is-photo', 'is-logo', 'has-img');
    frame.classList.add('is-failed');
  }

  function apply(frame) {
    if (!frame || frame.dataset.cardMediaReady) return;
    frame.dataset.cardMediaReady = '1';
    const img = frame.querySelector('img');
    if (!img || !img.getAttribute('src')) { fail(frame); return; }
    // a cached image can already be decoded before this runs; one that is
    // "complete" with no intrinsic size has errored
    if (img.complete) {
      if (img.naturalWidth) settle(frame, img);
      else fail(frame);
      return;
    }
    frame.classList.add('is-loading');
    img.addEventListener('load', () => settle(frame, img), { once: true });
    img.addEventListener('error', () => fail(frame), { once: true });
  }

  function enhance(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-card-media]').forEach(apply);
  }

  // Re-measure a frame whose image was swapped underneath it — a gallery can
  // step from a photo straight to a logo, and the frame has to follow.
  function refresh(frame) {
    if (!frame) return;
    frame.classList.remove('is-photo', 'is-logo', 'is-failed');
    delete frame.dataset.cardMediaReady;
    apply(frame);
  }

  // Initials for the fallback frame — first letters of the two leading words,
  // so an imageless card still reads as designed rather than as a blank slab.
  function monogram(title) {
    const words = String(title || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'FM';
    const letters = words.slice(0, 2).map(w => w[0]).join('');
    return letters.toUpperCase().slice(0, 2);
  }

  window.FMCardMedia = { enhance, refresh, classify, monogram };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhance(document));
  } else {
    enhance(document);
  }
})();
