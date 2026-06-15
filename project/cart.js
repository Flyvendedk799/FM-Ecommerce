(function () {
  'use strict';

  var KEY = 'fm_cart_v1';

  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function write(items) {
    var normalized = items.map(normalizeItem).filter(Boolean);
    try {
      localStorage.setItem(KEY, JSON.stringify({ items: normalized, updated_at: new Date().toISOString() }));
    } catch (_) { /* ignore storage failures */ }
    updateBadges(normalized);
    window.dispatchEvent(new CustomEvent('fm-cart-change', { detail: { items: normalized } }));
    return normalized;
  }

  function clean(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max || 240);
  }

  function asInt(value, fallback) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return n;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function normalizeItem(item) {
    if (!item) return null;
    var sessionId = asInt(item.session_id, 0);
    var courseId = asInt(item.course_id, 0);
    if (!sessionId || !courseId) return null;
    return {
      session_id: sessionId,
      course_id: courseId,
      course_title: clean(item.course_title, 180),
      supplier_name: clean(item.supplier_name, 180),
      date: clean(item.date, 20),
      location: clean(item.location, 120),
      venue: clean(item.venue, 160),
      format: clean(item.format, 120),
      participants: clamp(asInt(item.participants, 1), 1, 999),
      unit_price: Math.max(0, asInt(item.unit_price, 0)),
      badge: clean(item.badge, 40),
      url: clean(item.url, 240),
      added_at: item.added_at || new Date().toISOString(),
    };
  }

  function itemKey(item) {
    return String(item.session_id);
  }

  function getItems() {
    return read();
  }

  function countParticipants(items) {
    return (items || read()).reduce(function (sum, item) { return sum + (asInt(item.participants, 1) || 1); }, 0);
  }

  function addItem(item) {
    var next = normalizeItem(item);
    if (!next) return { ok: false, items: read() };
    var items = read();
    var existing = items.find(function (i) { return itemKey(i) === itemKey(next); });
    if (existing) {
      existing.participants = clamp(asInt(existing.participants, 1) + next.participants, 1, 999);
      existing.added_at = new Date().toISOString();
    } else {
      items.push(next);
    }
    return { ok: true, item: next, items: write(items) };
  }

  function setParticipants(sessionId, participants) {
    var sid = asInt(sessionId, 0);
    var items = read().map(function (item) {
      if (item.session_id === sid) item.participants = clamp(asInt(participants, 1), 1, 999);
      return item;
    });
    return write(items);
  }

  function removeItem(sessionId) {
    var sid = asInt(sessionId, 0);
    return write(read().filter(function (item) { return item.session_id !== sid; }));
  }

  function clear() {
    return write([]);
  }

  function lineSubtotal(item) {
    return Math.max(0, asInt(item.unit_price, 0)) * clamp(asInt(item.participants, 1), 1, 999);
  }

  function lineDiscount(item) {
    var subtotal = lineSubtotal(item);
    return item.participants >= 3 ? Math.round(subtotal * 0.10) : 0;
  }

  function lineTotal(item) {
    return lineSubtotal(item) - lineDiscount(item);
  }

  function totals(items) {
    var list = items || read();
    var subtotal = list.reduce(function (sum, item) { return sum + lineSubtotal(item); }, 0);
    var discount = list.reduce(function (sum, item) { return sum + lineDiscount(item); }, 0);
    var totalExVat = subtotal - discount;
    var vat = Math.round(totalExVat * 0.25);
    return {
      subtotal_ex_vat: subtotal,
      discount_total: discount,
      total_ex_vat: totalExVat,
      vat_total: vat,
      total_inc_vat: totalExVat + vat,
      participants: countParticipants(list),
      item_count: list.length,
    };
  }

  function formatMoney(amount) {
    var n = Math.max(0, asInt(amount, 0));
    if (!n) return 'Gratis';
    return 'kr. ' + n.toLocaleString('da-DK');
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Dato ikke valgt';
    var d = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function updateBadges(items) {
    var count = countParticipants(items || read());
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = String(count);
      el.hidden = count === 0;
    });
    document.querySelectorAll('[data-cart-link]').forEach(function (el) {
      el.classList.toggle('has-items', count > 0);
      el.setAttribute('aria-label', count > 0 ? 'Kurv med ' + count + ' deltagere' : 'Kurv');
    });
  }

  window.FuturematchCart = {
    getItems: getItems,
    addItem: addItem,
    setParticipants: setParticipants,
    removeItem: removeItem,
    clear: clear,
    totals: totals,
    lineSubtotal: lineSubtotal,
    lineDiscount: lineDiscount,
    lineTotal: lineTotal,
    formatMoney: formatMoney,
    formatDate: formatDate,
    updateBadges: updateBadges,
  };

  document.addEventListener('DOMContentLoaded', function () { updateBadges(); });
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) updateBadges();
  });
})();
