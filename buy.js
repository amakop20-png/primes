// ======================================
// SIDEBAR TOGGLE
// ======================================

const toggleBtn = document.querySelector(".toggle-btn");
const sidebar = document.querySelector("aside");
const overlay = document.querySelector(".overlay");
const closeBtn = document.querySelector(".close");

// OPEN SIDEBAR
toggleBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.add("show");
});

// CLOSE SIDEBAR BUTTON
closeBtn.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
});

// CLOSE WHEN CLICKING OVERLAY
overlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
});

// CLOSE ON WINDOW RESIZE
window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  }
});