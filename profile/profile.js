
  async function load() {
  const res = await fetch("https://auth.scoreladder.org/me", { credentials: "include" });

  if (!res.ok) {
    location.href = "/";
    return;
  }

  const user = await res.json();

  document.getElementById("name").innerText =
    user.display_name || user.username;

  document.getElementById("id").innerText = user.id;

  document.getElementById("avatar").src =
    user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id.replace("discord_", "")}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

  renderProfile(user)
}

function renderProfile(user) {
  document.getElementById("name").innerText =
    user.display_name || user.username;

  document.getElementById("id").innerText = user.id;

  document.getElementById("bio").innerText =
    user.profile.bio || "No bio yet.";

  // Banner
  document.getElementById("banner").style.background =
    user.profile.banner
      ? `url(${user.profile.banner}) center/cover`
      : "linear-gradient(135deg, #5865F2, #3b3f9c)";

  // Avatar
  const discordId = user.id.replace("discord_", "");
  document.getElementById("avatar").src =
    user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

  // Stats
  document.getElementById("stats").innerHTML = `
    <div class="stat">Level<b>${user.stats.level}</b></div>
    <div class="stat">Elo<b>${user.stats.elo}</b></div>
    <div class="stat">Wins<b>${user.stats.wins}</b></div>
    <div class="stat">Losses<b>${user.stats.losses}</b></div>
  `;

  // Socials
  const socials = [];

  if (user.profile.twitter)
    socials.push(`<a href="${user.profile.twitter}">Twitter</a>`);

  if (user.profile.instagram)
    socials.push(`<a href="${user.profile.instagram}">Instagram</a>`);

  if (user.profile.youtube)
    socials.push(`<a href="${user.profile.youtube}">YouTube</a>`);

  if (user.profile.website)
    socials.push(`<a href="${user.profile.website}">Website</a>`);

  document.getElementById("socials").innerHTML = socials.join("");
}

function goSettings() {
  location.href = "/settings";
}

async function logout() {
  await fetch("https://auth.scoreladder.org/logout", { credentials: "include" });
  location.href = "/";
}

load();