function initAsideEvents() {
    if (closeAsideBtn) closeAsideBtn.addEventListener('click', () => {
        aside.classList.remove('open');
    });
    if (toggleBtn) toggleBtn.addEventListener('click', toggleAside);
}