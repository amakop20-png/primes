const popupBalance = document.getElementById('popup_balance');
const openPopupBtn = document.getElementById('openPopup');
const closePopupBtn = document.getElementById('closePopup');
const scrollTopBtn = document.getElementById('scrollTopBtn');
const aside = document.getElementById('aside');
const closeAsideBtn = document.getElementById('close-btn');
const toggleBtn = document.getElementById('toggle-btn');
const modeText = document.getElementById('modeText');

function openPopup() {
    if (popupBalance) {
        popupBalance.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closePopup() {
    if (popupBalance) {
        popupBalance.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function toggleDark() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    if (modeText) {
        modeText.textContent = isDark ? 'Dark mode' : 'Light mode';
    }
    localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
}

function restoreTheme() {
    const storedTheme = localStorage.getItem('dashboardTheme');
    if (storedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (modeText) modeText.textContent = 'Dark mode';
    }
}

function handleScroll() {
    if (!scrollTopBtn) return;
    const show = window.scrollY > 240;
    scrollTopBtn.style.opacity = show ? '1' : '0';
    scrollTopBtn.style.pointerEvents = show ? 'auto' : 'none';
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleAside() {
    if (!aside) return;
    aside.classList.toggle('open');
}

function initPopupEvents() {
    if (openPopupBtn) openPopupBtn.addEventListener('click', openPopup);
    if (closePopupBtn) closePopupBtn.addEventListener('click', closePopup);
    if (popupBalance) {
        popupBalance.addEventListener('click', event => {
            if (event.target === popupBalance) {
                closePopup();
            }
        });
    }
}


function initScrollEvents() {
    if (!scrollTopBtn) return;
    scrollTopBtn.addEventListener('click', scrollToTop);
    window.addEventListener('scroll', handleScroll);
    handleScroll();
}

function initAsideEvents() {
    if (closeAsideBtn) closeAsideBtn.addEventListener('click', () => {
        aside.classList.remove('open');
    });
    if (toggleBtn) toggleBtn.addEventListener('click', toggleAside);
}

function init() {
    restoreTheme();
    initPopupEvents();
    initScrollEvents();
    initAsideEvents();
}

document.addEventListener('DOMContentLoaded', init);
/* =========================
   REMOVE LOADER
========================= */
window.addEventListener("load", () => {

    const loader = document.getElementById("loader");

    setTimeout(() => {
        loader.classList.add("hide");
    }, 2500);

});
window.addEventListener("load", () => {

    const loader = document.getElementById("loader");

    setTimeout(() => {
        loader.classList.add("hide");
    }, 3000);

});
window.addEventListener("load", function () {
  const loader = document.querySelector(".loader-wrapper");
  loader.style.transition = "opacity 0.6s ease";
  loader.style.opacity = "0";

  setTimeout(function () {
    loader.style.display = "none";
  }, 600);
});