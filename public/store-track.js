/* Analytics do site da loja → CRM (/api/loja/track). Sem cookies, sem IP.
   Uso: <script src="https://<crm>/store-track.js" defer></script>
        StoreTrack.event('product_view', { product_slug: 'yhwh-tee' }) */
(function () {
  var script = document.currentScript;
  var endpoint = new URL('/api/loja/track', script ? script.src : location.href).href;
  var SESSION_IDLE_MS = 30 * 60 * 1000;
  var queue = [];
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

  function rid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function store(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (!v) {
        v = fallback();
        localStorage.setItem(key, v);
      }
      return v;
    } catch (e) {
      return fallback();
    }
  }
  var visitorId = store('st_vid', rid);
  var sessionId = (function () {
    try {
      var last = Number(localStorage.getItem('st_last') || 0);
      var sid = localStorage.getItem('st_sid');
      if (!sid || Date.now() - last > SESSION_IDLE_MS) {
        sid = rid();
        localStorage.setItem('st_sid', sid);
      }
      return sid;
    } catch (e) {
      return rid();
    }
  })();
  function touch() {
    try { localStorage.setItem('st_last', String(Date.now())); } catch (e) { /* sem storage */ }
  }

  function flush(useBeacon) {
    if (!queue.length) return;
    var batch = queue.splice(0, 20);
    var body = JSON.stringify({ events: batch });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }));
    } else {
      fetch(endpoint, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
        .catch(function () { /* analytics nunca quebra a loja */ });
    }
    if (queue.length) flush(useBeacon);
  }

  function event(type, data) {
    data = data || {};
    queue.push({
      visitor_id: visitorId,
      session_id: sessionId,
      type: type,
      path: location.pathname + location.search,
      product_slug: data.product_slug || null,
      value: data.value != null ? String(data.value) : null,
      referrer: data.referrer || null,
      utm_source: data.utm_source || null,
      utm_medium: data.utm_medium || null,
      utm_campaign: data.utm_campaign || null,
      duration_ms: data.duration_ms != null ? data.duration_ms : null,
    });
    touch();
    if (queue.length >= 20) flush(false);
  }

  function elapsed() {
    if (visibleSince == null) return 0;
    var d = Date.now() - visibleSince;
    visibleSince = Date.now();
    return Math.min(d, 60000);
  }

  var params = new URLSearchParams(location.search);
  event('page_view', {
    referrer: document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : null,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
  });

  setInterval(function () {
    if (document.visibilityState === 'visible') event('heartbeat', { duration_ms: elapsed() });
  }, 15000);
  setInterval(function () { flush(false); }, 5000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      event('leave', { duration_ms: elapsed() });
      visibleSince = null;
      flush(true);
    } else {
      visibleSince = Date.now();
    }
  });
  window.addEventListener('pagehide', function () { flush(true); });

  window.StoreTrack = { event: event, flush: function () { flush(false); } };
  // Nome usado no plano; mantém os dois.
  window.EssenceTrack = window.StoreTrack;
  setTimeout(function () { flush(false); }, 1000);
})();
