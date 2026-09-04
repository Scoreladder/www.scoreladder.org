import {
  getMineralRankClass,
  formatMineralRank
} from "../ranks.js";

const API = "https://auth.scoreladder.org";

const rwLeaderboard = document.querySelector("#rw-leaderboard");
const mathLeaderboard = document.querySelector("#math-leaderboard");

/* ============================================================
   LOAD LEADERBOARD
   ============================================================ */

async function loadLeaderboard() {
  setLeaderboardLoading(rwLeaderboard);
  setLeaderboardLoading(mathLeaderboard);

  try {
    const response = await fetch(`${API}/leaderboards`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Leaderboard request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to load leaderboard");
    }

    renderLeaderboard(rwLeaderboard, data.rw);
    renderLeaderboard(mathLeaderboard, data.math);
  } catch (err) {
    console.error("LEADERBOARD ERROR:", err);
    showLeaderboardError(rwLeaderboard);
    showLeaderboardError(mathLeaderboard);
  }
}

/* ============================================================
   LOADING STATE
   ============================================================ */

function setLeaderboardLoading(container) {
  if (!container) return;
  container.innerHTML = "";
  const loading = document.createElement("div");
  loading.className = "empty";
  const message = document.createElement("p");
  message.textContent = "Loading leaderboard...";
  loading.appendChild(message);
  container.appendChild(loading);
}

/* ============================================================
   RENDER LEADERBOARD
   ============================================================ */

function renderLeaderboard(container, players) {
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(players) || players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const message = document.createElement("p");
    message.textContent = "No players yet.";
    empty.appendChild(message);
    container.appendChild(empty);
    return;
  }

  // Cap at top 50
  const top50 = players.slice(0, 50);

  for (const player of top50) {
    const row = document.createElement("div");
    row.className = "player";

    /* --------------------------------------------------------
       POSITION NUMBER
       -------------------------------------------------------- */

    const ranking = document.createElement("div");
    ranking.className = "ranking";
    ranking.textContent = player.rank;

    /* --------------------------------------------------------
       PLAYER INFO
       -------------------------------------------------------- */

    const playerInfo = document.createElement("div");
    playerInfo.className = "player-info";

    /* --------------------------------------------------------
       AVATAR
       -------------------------------------------------------- */

    const avatar = document.createElement("img");
    avatar.className = "avatar";

    const discordId = String(player.id || "").replace(/^discord_/, "");

if (player.avatar) {
  avatar.src =
    /^https?:\/\//i.test(player.avatar)
      ? player.avatar
      : discordId
        ? `https://cdn.discordapp.com/avatars/${discordId}/${player.avatar}.png?size=64`
        : "";
  
  if (!avatar.src) {
    avatar.style.display = "none";
  }
} else {
  avatar.style.display = "none";
}

    avatar.alt = "";

    /* --------------------------------------------------------
       TEXT WRAPPER
       -------------------------------------------------------- */

    const playerText = document.createElement("div");
    playerText.className = "player-text";

    /* --------------------------------------------------------
       USERNAME
       -------------------------------------------------------- */

    const username = document.createElement("p");
    username.className = "username";
    username.textContent =
      player.username || player.display_name || "Username not set";

    /* --------------------------------------------------------
       MINERAL RANK
       -------------------------------------------------------- */

    const mineralRank = document.createElement("p");
    mineralRank.className = "mineral-rank";

    const rankClass = getMineralRankClass(player.elo);
    if (rankClass) mineralRank.classList.add(rankClass);

    mineralRank.textContent = formatMineralRank(player.elo);

    /* --------------------------------------------------------
       ELO SCORE
       -------------------------------------------------------- */

    const score = document.createElement("div");
    score.className = "score";
    const elo = Number(player.elo);
    score.textContent = Number.isFinite(elo) ? elo : "—";

    /* --------------------------------------------------------
       ASSEMBLE
       -------------------------------------------------------- */

    playerText.appendChild(username);
    playerText.appendChild(mineralRank);

    playerInfo.appendChild(avatar);
    playerInfo.appendChild(playerText);

    row.appendChild(ranking);
    row.appendChild(playerInfo);
    row.appendChild(score);

    container.appendChild(row);
  }
}

/* ============================================================
   ERROR STATE
   ============================================================ */

function showLeaderboardError(container) {
  if (!container) return;
  container.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  const message = document.createElement("p");
  message.textContent = "Unable to load leaderboard.";
  empty.appendChild(message);
  container.appendChild(empty);
}

/* ============================================================
   INITIALIZE
   ============================================================ */

loadLeaderboard();
