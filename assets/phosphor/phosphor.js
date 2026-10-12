// assets/phosphor/phosphor.js
// Local offline loader for Phosphor icons with fallback to CDN if files are not accessible
(function() {
  if (window.__phosphorLoaded) return;
  window.__phosphorLoaded = true;

  // Determine base path to assets/phosphor relative to current page
  var scripts = document.getElementsByTagName('script');
  var currentScript = document.currentScript;
  var basePath = 'assets/phosphor';

  if (currentScript && currentScript.src) {
    basePath = currentScript.src.substring(0, currentScript.src.lastIndexOf('/'));
  }

  var weights = ['regular', 'bold', 'fill', 'thin', 'light', 'duotone'];
  var head = document.getElementsByTagName('head')[0] || document.documentElement;

  for (var i = 0; i < weights.length; i++) {
    var weight = weights[i];
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = basePath + '/' + weight + '/style.css';
    head.appendChild(link);
  }
})();
