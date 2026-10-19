/**
 * brand-logo.js — Official Theme-Aware NuraXQ Logo Switching Engine
 * 
 * Assets:
 *   - Dark mode logo:  nurasms.comLF.png  (Light purple text #C084FC - high contrast on dark)
 *   - Light mode logo: nurasms.comDFC.png (Dark purple text #6B21A8 - high contrast on light)
 *   - Logo icon only:  nuraxq-icon.png    (Used on login, signup, reset-password, and loaders)
 *
 * Automatically keeps all logo instances in sync with current theme
 * on initial page load, real-time theme toggles, and cross-tab storage updates.
 */

(function () {
  'use strict';

  const LOGO_DARK = 'nurasms.comLF.png';   // NuraXQ text is light purple (#C084FC) for dark mode
  const LOGO_LIGHT = 'nurasms.comDFC.png';  // NuraXQ text is dark purple (#6B21A8) for light mode
  const LOGO_ICON = 'nuraxq-icon.png';

  const LOGO_SELECTORS = [
    '.nuraxq-theme-logo',
    'img[data-nuraxq-logo]',
    '.header__logo-img',
    '.sidebar-logo',
    '.nuraxq-logo',
    '.nura-sq-logo',
    '.admin-sidebar-logo',
    '.admin-gate-logo-img'
  ];

  function isDarkMode() {
    const saved = localStorage.getItem('dashboardTheme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return document.body ? document.body.classList.contains('dark-theme') : false;
  }

  function getLogoSrc(isDark) {
    const dark = (typeof isDark === 'boolean') ? isDark : isDarkMode();
    return dark ? LOGO_DARK : LOGO_LIGHT;
  }

  function updateAllLogos(isDarkOverride) {
    const isDark = (typeof isDarkOverride === 'boolean') ? isDarkOverride : isDarkMode();
    const targetSrc = isDark ? LOGO_DARK : LOGO_LIGHT;

    const selectorStr = LOGO_SELECTORS.join(', ');
    const logos = document.querySelectorAll(selectorStr);

    logos.forEach(function (img) {
      if (img && img.tagName === 'IMG') {
        // Guard: Never overwrite icon-only images on login, signup, loader screens
        if (img.classList.contains('loader-logo') || 
            img.classList.contains('auth-logo-icon') || 
            img.classList.contains('auth-banner-logo') ||
            img.hasAttribute('data-icon-only')) {
          return;
        }
        const currentSrc = img.getAttribute('src');
        if (currentSrc !== targetSrc) {
          img.setAttribute('src', targetSrc);
        }
      }
    });
  }

  // Expose global controller
  window.NuraLogo = {
    LOGO_DARK: LOGO_DARK,
    LOGO_LIGHT: LOGO_LIGHT,
    LOGO_ICON: LOGO_ICON,
    isDarkMode: isDarkMode,
    getLogoSrc: getLogoSrc,
    updateAllLogos: updateAllLogos
  };

  // Immediate execution if body is already present
  function initThemeAndLogos() {
    if (!document.body) return;
    const isDark = isDarkMode();
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      // Only remove if not explicitly set elsewhere
      if (localStorage.getItem('dashboardTheme') === 'light') {
        document.body.classList.remove('dark-theme');
      }
    }
    updateAllLogos(isDark);
  }

  // Run as early as possible
  initThemeAndLogos();

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initThemeAndLogos();
    });
  } else {
    initThemeAndLogos();
  }

  // Cross-tab theme synchronization
  window.addEventListener('storage', function (e) {
    if (e.key === 'dashboardTheme') {
      const isDark = e.newValue === 'dark';
      if (document.body) {
        document.body.classList.toggle('dark-theme', isDark);
      }
      updateAllLogos(isDark);
    }
  });

  // Watch for dynamic class changes on <body> (e.g. toggleDark calls)
  function attachClassObserver() {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'class') {
          const isDark = document.body.classList.contains('dark-theme');
          updateAllLogos(isDark);
          break;
        }
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.body) {
    attachClassObserver();
  } else {
    document.addEventListener('DOMContentLoaded', attachClassObserver);
  }

})();
