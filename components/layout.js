const API = "https://auth.scoreladder.org";
const BASE_URL = window.location.origin;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLayout);
} else {
  initLayout();
}

async function initLayout() {
  try {
    await load("header", `${BASE_URL}/components/header.html`);
    await load("footer", `${BASE_URL}/components/footer.html`);

    initTopbar();
    syncTopbarHeight();

    console.log("layout.js loaded");
  } catch (error) {
    console.error("Layout initialization failed:", error);
  }
}

async function load(id, file) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Element #${id} was not found`);
  }

  const res = await fetch(file, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Failed to load ${file}: ${res.status}`);
  }

  element.innerHTML = await res.text();
}

function initTopbar() {
  initDarkMode();
  setupAuth();

  const loginBtn = document.getElementById("loginBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.href = "/login/";
    });
  }
}

function initDarkMode() {
  const btn = document.getElementById("darkmode-toggle");

  if (!btn) {
    console.error("Dark mode button was not found");
    return;
  }

  let saved = null;

  try {
    saved = localStorage.getItem("darkmode");
  } catch (error) {
    saved = null;
  }

  if (saved === "true") {
    setDarkMode(true);
  } else if (saved === "false") {
    setDarkMode(false);
  } else {
    setDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches, false);
  }

  btn.addEventListener("click", () => {
    const enabled = !document.documentElement.classList.contains("darkmode");
    setDarkMode(enabled, true);
  });
}

function setDarkMode(enabled, save = true) {
  const root = document.documentElement;

  root.classList.remove("darkmode", "lightmode");
  root.classList.add(enabled ? "darkmode" : "lightmode");

  if (save) {
    try {
      localStorage.setItem("darkmode", enabled ? "true" : "false");
    } catch (error) {}
  }

  const btn = document.getElementById("darkmode-toggle");

  if (!btn) return;

  btn.setAttribute("aria-pressed", enabled ? "true" : "false");
  btn.setAttribute(
    "aria-label",
    enabled ? "Switch to light mode" : "Switch to dark mode"
  );

  const icon = btn.querySelector("span");

  if (icon) {
    icon.textContent = enabled ? "☀️" : "🌙";
  }
}

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

    profileBtn.src = user.avatar ?
      `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png` :
      "https://cdn.discordapp.com/embed/avatars/0.png";

    const profileLink = profileBtn.closest("a");

    if (profileLink) {
      profileLink.href = `${BASE_URL}/profile/`;
    }
  } catch (error) {
    console.log("not logged in");
  }
}

function syncTopbarHeight() {
  const topbar = document.getElementById("topbar");

  if (!topbar) return;

  const height = topbar.offsetHeight;

  document.documentElement.style.setProperty(
    "--topbar-height",
    `${height}px`
  );
}