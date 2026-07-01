const API = "https://auth.scoreladder.org"
const BASE_URL = window.location.origin;

/* ---------------- ENTRY POINT ---------------- */

document.addEventListener("DOMContentLoaded", initLayout);

async function initLayout() {
  await load("header", `${BASE_URL}/components/header.html`);
  await load("footer", `${BASE_URL}/components/footer.html`);
  syncTopbarHeight();

  initTopbar();
  console.log("layout.js loaded");
}

/* ---------------- COMPONENT LOADER ---------------- */

async function load(id, file) {
  const res = await fetch(file);
  const html = await res.text();
  document.getElementById(id).innerHTML = html;
}

/* ---------------- TOPBAR LOGIC ---------------- */

function initTopbar() {
  initDarkMode();
  setupAuth();
}

/* ---------------- AUTH ---------------- */

async function setupAuth() {
  const loginBtn = document.getElementById("loginBtn");
  const profileBtn = document.getElementById("profileBtn");

  if (!loginBtn || !profileBtn) return;

  try {
    const res = await fetch(`${API}/me`, {
      credentials: "include"
    });

    if (!res.ok) return;

    const user = await res.json();

    loginBtn.style.display = "none";
    profileBtn.classList.remove("hidden");

    const discordId = user.id.replace("discord_", "");

    profileBtn.src = user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

    profileBtn.onclick = () => {
      location.href = `${BASE_URL}/profile/`;
    };

  } catch (e) {
    console.log("not logged in");
  }
}

function initDarkMode() {
  const btn = document.getElementById("darkmode-toggle");
  if (!btn) return;

  const saved = localStorage.getItem("darkmode") === "true";

  applyDarkMode(saved);

  btn.addEventListener("click", () => {
    const newValue = localStorage.getItem("darkmode") !== "true";
    localStorage.setItem("darkmode", newValue);
    applyDarkMode(newValue);
  });
}

function applyDarkMode(enabled) {
  document.body.classList.toggle("darkmode", enabled);
}

function syncTopbarHeight() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;

  const height = topbar.offsetHeight;
  document.documentElement.style.setProperty("--topbar-height", height + "px");
}