/* Dcashop Uttamap – order-admin map. Loads only when expanded; never changes order fields. */
(function (window, document) {
  'use strict';
  var settings = window.dcUttOrder || {};
  var lib = window.maplibregl;
  lib = lib && (lib.default || lib);

  function start(details) {
    if (details.dataset.dcMapStarted === '1') { return; }
    var root = details.querySelector('.dcutt-order-canvas');
    var canvas = root;
    var fallback = details.querySelector('.dcutt-order-fallback');
    if (!root || !canvas) { return; }
    var lat = Number(root.dataset.lat), lng = Number(root.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 24 || lat > 41 || lng < 43 || lng > 64) { return; }
    details.dataset.dcMapStarted = '1';
    function fail() { if (fallback) { fallback.hidden = false; } }
    if (!lib || !lib.Map || !settings.key) { fail(); return; }
    try {
      if(lib.getRTLTextPluginStatus&&lib.getRTLTextPluginStatus()==='unavailable'){lib.setRTLTextPlugin('https://tiles.uttamap.ir/js/rtl-text.js',true);}
      var map = new lib.Map({
        container: canvas,
        style: 'https://tiles.uttamap.ir/styles/light/style.json?key='+encodeURIComponent(settings.key),
        center: [lng, lat], zoom: 16, minZoom: 4, maxZoom: 20,
        trackResize: true
      });
      // Position recorded at checkout is immutable for this order.
      if (lib.Marker) { new lib.Marker({color: '#446084'}).setLngLat([lng, lat]).addTo(map); }
      map.on('error', fail);
      window.setTimeout(function () { map.resize(); }, 100);
      details.addEventListener('toggle', function () {
        if (details.open) { window.setTimeout(function () { map.resize(); }, 80); }
      });
    } catch (err) { fail(); }
  }

  function boot() {
    document.querySelectorAll('.dcutt-order-details').forEach(function (node) {
      node.addEventListener('toggle', function () { if (node.open) { start(node); } });
      if (node.open) { start(node); }
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})(window, document);
