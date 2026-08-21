const Auth_API = "https://auth.scoreladder.org";

async function load() {
  try {
    const res = await fetch(`${Auth_API}/me`, {
      credentials: "include"
    });

    if (!res.ok) {
      location.href = "/";
      return;
    }

    const user = await res.json();

    console.log("Profile data loaded:", user);

    renderProfile(user);

  } catch (error) {
    console.error("Failed to load profile:", error);
    location.href = "/";
  }
}

function renderProfile(user) {
  const profile = user.profile || {};
  const stats = user.stats || {};
  const questionTypeStats = user.question_type_stats || [];

  // -------------------------
  // BASIC PROFILE
  // -------------------------

  document.getElementById("name").innerText =
    user.display_name || user.username || "User";

  document.getElementById("id").innerText =
    user.username
      ? `@${user.username}`
      : user.id;

  document.getElementById("bio").innerText =
    profile.bio || "No bio yet.";


  // -------------------------
  // BANNER
  // -------------------------

  const banner = document.getElementById("banner");

  banner.style.background =
    profile.banner
      ? `url("${profile.banner}") center/cover`
      : "linear-gradient(135deg, #5865F2, #3b3f9c)";


  // -------------------------
  // AVATAR
  // -------------------------

  const avatar = document.getElementById("avatar");

  const discordId = user.id.replace("discord_", "");

  avatar.src =
    user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";


  // -------------------------
  // OVERALL ACCURACY
  // -------------------------

  const rwAnswered =
    Number(stats.rw_questions_answered) || 0;

  const rwCorrect =
    Number(stats.rw_questions_correct) || 0;

  const mathAnswered =
    Number(stats.math_questions_answered) || 0;

  const mathCorrect =
    Number(stats.math_questions_correct) || 0;

  const rwAccuracy =
    rwAnswered > 0
      ? Math.round((rwCorrect / rwAnswered) * 100)
      : 0;

  const mathAccuracy =
    mathAnswered > 0
      ? Math.round((mathCorrect / mathAnswered) * 100)
      : 0;


  // -------------------------
  // OVERALL STATS
  // -------------------------

  document.getElementById("stats").innerHTML = `
    <div class="stat">
      <span>RW Elo</span>
      <b>${stats.rw_elo ?? 1200}</b>
    </div>

    <div class="stat">
      <span>Math Elo</span>
      <b>${stats.math_elo ?? 1200}</b>
    </div>

    <div class="stat">
      <span>RW Wins</span>
      <b>${stats.rw_wins ?? 0}</b>
    </div>

    <div class="stat">
      <span>Math Wins</span>
      <b>${stats.math_wins ?? 0}</b>
    </div>

    <div class="stat">
      <span>RW Accuracy</span>
      <b>${rwAccuracy}%</b>
    </div>

    <div class="stat">
      <span>Math Accuracy</span>
      <b>${mathAccuracy}%</b>
    </div>

    <div class="stat">
      <span>Daily Challenge Streak</span>
      <b>${stats.daily_streak ?? 0}</b>
    </div>
  `;


  // -------------------------
  // QUESTION TYPE STATS
  // -------------------------

  renderQuestionTypeStats(questionTypeStats);


  // -------------------------
  // SOCIAL LINKS
  // -------------------------

  const socials = [];

  if (profile.twitter) {
    socials.push(`
      <a
        href="${escapeAttribute(profile.twitter)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Twitter
      </a>
    `);
  }

  if (profile.instagram) {
    socials.push(`
      <a
        href="${escapeAttribute(profile.instagram)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Instagram
      </a>
    `);
  }

  if (profile.youtube) {
    socials.push(`
      <a
        href="${escapeAttribute(profile.youtube)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        YouTube
      </a>
    `);
  }

  if (profile.website) {
    socials.push(`
      <a
        href="${escapeAttribute(profile.website)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Website
      </a>
    `);
  }

  document.getElementById("socials").innerHTML =
    socials.join("");
}


function renderQuestionTypeStats(questionTypeStats) {

  const existing =
    document.getElementById("questionTypeStats");

  if (existing) {
    existing.remove();
  }


  const section =
    document.createElement("div");

  section.id = "questionTypeStats";
  section.className = "question-type-stats";


  const title =
    document.createElement("h3");

  title.innerText =
    "Reading & Writing Performance";

  section.appendChild(title);


  const names = {
    central_ideas:
      "Central Ideas and Details",

    command_evidence_textual:
      "Command of Evidence (Textual)",

    command_evidence_quantitative:
      "Command of Evidence (Quantitative)",

    inferences:
      "Inferences",

    words_in_context:
      "Words in Context",

    text_structure_purpose:
      "Text Structure and Purpose",

    cross_text_connections:
      "Cross-Text Connections",

    rhetorical_synthesis:
      "Rhetorical Synthesis",

    transitions:
      "Transitions",

    boundaries:
      "Boundaries",

    form_structure_sense:
      "Form, Structure, and Sense"
  };


  // Create a row for every question type
  for (const stat of questionTypeStats) {

    const answered =
      Number(stat.questions_answered) || 0;

    const correct =
      Number(stat.questions_correct) || 0;

    const accuracy =
      answered > 0
        ? Math.round((correct / answered) * 100)
        : 0;


    const row =
      document.createElement("div");

    row.className =
      "question-type-stat";


    const name =
      document.createElement("span");

    name.className =
      "question-type-name";

    name.innerText =
      names[stat.question_type] ||
      stat.question_type;


    const accuracyElement =
      document.createElement("span");

    accuracyElement.className =
      "question-type-accuracy";

    accuracyElement.innerText =
      `${accuracy}%`;


    const count =
      document.createElement("span");

    count.className =
      "question-type-count";

    count.innerText =
      `${correct}/${answered}`;


    row.appendChild(name);
    row.appendChild(accuracyElement);
    row.appendChild(count);

    section.appendChild(row);
  }


  if (questionTypeStats.length === 0) {

    const empty =
      document.createElement("p");

    empty.innerText =
      "No Reading & Writing data yet.";

    section.appendChild(empty);
  }


  const stats =
    document.getElementById("stats");

  stats.insertAdjacentElement(
    "afterend",
    section
  );
}


function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function goSettings() {
  location.href = "/settings";
}


async function logout() {
  try {
    await fetch(`${Auth_API}/logout`, {
      credentials: "include"
    });
  } finally {
    location.href = "/";
  }
}


load();