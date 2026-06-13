const API = "https://auth.scoreladder.org";

/* ---------------- ENTRY POINT ---------------- */

document.addEventListener("DOMContentLoaded", initLayout);

async function initLayout() {
  await load("header", "/components/header.html");
  await load("footer", "/components/footer.html");

  initTopbar();
}

/* ---------------- COMPONENT LOADER ---------------- */

async function load(id, file) {
  const res = await fetch(file);
  const html = await res.text();
  document.getElementById(id).innerHTML = html;
}

/* ---------------- TOPBAR LOGIC ---------------- */

function initTopbar() {
  setupDarkMode();
  setupAuth();
  setLogo();
}

/* ---------------- DARK MODE ---------------- */

function setupDarkMode() {
  const btn = document.getElementById("darkToggle");
  if (!btn) return;

  const saved = localStorage.getItem("darkmode") === "true";
  applyTheme(saved);

  btn.onclick = () => {
    const newVal = localStorage.getItem("darkmode") !== "true";
    localStorage.setItem("darkmode", newVal);
    applyTheme(newVal);
  };
}

function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  setLogo();
}

/* ---------------- LOGO ---------------- */

function setLogo() {
  const logo = document.getElementById("logo");
  if (!logo) return;

  const dark = localStorage.getItem("darkmode") === "true";

  logo.src = dark
    ? "https://web.scoreladder.org/images%20and%20svgs/Scoreladder%20Logo%20Dark.png"
    : "https://web.scoreladder.org/images%20and%20svgs/Scoreladder%20Logo.png";
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
      location.href = "/profile/";
    };

  } catch (e) {
    console.log("not logged in");
  }
}
