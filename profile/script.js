const Auth_API = "https://auth.scoreladder.org";

const LOCAL_SESSION_KEY = "scoreladder_session";


// ============================================================
// GET LOCAL SESSION
// ============================================================

function getSessionId() {
  const params = new URLSearchParams(window.location.search);

  // If the Worker just redirected us here with ?session=...
  const urlSession = params.get("session");

  if (urlSession) {
    // Save it so the session survives navigation to other pages.
    sessionStorage.setItem(
      LOCAL_SESSION_KEY,
      urlSession
    );

    return urlSession;
  }

  // Otherwise use the previously saved local session.
  return sessionStorage.getItem(
    LOCAL_SESSION_KEY
  );
}


// ============================================================
// LOAD PROFILE
// ============================================================

async function load() {
  try {
    const sessionId = getSessionId();

    console.log(
      "Profile session:",
      sessionId ? "found" : "missing"
    );

    let meUrl = `${Auth_API}/me`;

    if (sessionId) {
      meUrl =
        `${Auth_API}/me?session=${encodeURIComponent(sessionId)}`;
    }

    const res = await fetch(meUrl, {
      credentials: "include",
      cache: "no-store"
    });

    if (!res.ok) {
      console.error(
        "Authentication failed:",
        res.status
      );

      if (sessionId) {
        sessionStorage.removeItem(
          LOCAL_SESSION_KEY
        );
      }

      location.href = "/";
      return;
    }

    const user = await res.json();

    console.log(
      "Profile data loaded:",
      user
    );


    // --------------------------------------------------------
    // LOAD MINERAL RANKS
    //
    // This is deliberately dynamic so this profile script
    // remains a normal script and global functions such as
    // logout() and goSettings() continue to work.
    // --------------------------------------------------------

    let getMineralRank = null;

    try {
      const ranks =
        await import("../ranks.js");

      if (
        typeof ranks.getMineralRank === "function"
      ) {
        getMineralRank =
          ranks.getMineralRank;
      } else {
        console.error(
          "ranks.js does not export getMineralRank"
        );
      }

    } catch (rankError) {
      console.error(
        "Failed to load ranks.js:",
        rankError
      );
    }


    renderProfile(
      user,
      getMineralRank
    );

  } catch (error) {
    console.error(
      "Failed to load profile:",
      error
    );

    location.href = "/";
  }
}


// ============================================================
// RENDER PROFILE
// ============================================================

function renderProfile(
  user,
  getMineralRank
) {
  const profile =
    user.profile || {};

  const stats =
    user.stats || {};

  const questionTypeStats =
    user.question_type_stats || [];


  // ==========================================================
  // ELO
  // ==========================================================

const rwEloHidden =
  Boolean(stats.rw_elo_hidden);

const mathEloHidden =
  Boolean(stats.math_elo_hidden);

const rwElo =
  rwEloHidden
    ? null
    : Number(stats.rw_elo);

const mathElo =
  mathEloHidden
    ? null
    : Number(stats.math_elo);

  // ==========================================================
  // MINERAL RANKS
  // ==========================================================

const rwRank =
  !rwEloHidden && getMineralRank
    ? getMineralRank(rwElo)
    : null;

const mathRank =
  !mathEloHidden && getMineralRank
    ? getMineralRank(mathElo)
    : null;

  // -------------------------
  // BASIC PROFILE
  // -------------------------

  document.getElementById("name").innerText =
    user.display_name ||
    user.username ||
    "User";

  document.getElementById("id").innerText =
    user.username
      ? `@${user.username}`
      : user.id;

  document.getElementById("bio").innerText =
    profile.bio ||
    "No bio yet.";


  // -------------------------
  // BANNER
  // -------------------------

  const banner =
    document.getElementById("banner");

  banner.style.background =
    profile.banner
      ? `url("${profile.banner}") center/cover`
      : "linear-gradient(135deg, #5865F2, #3b3f9c)";


  // -------------------------
  // AVATAR
  // -------------------------

  const avatar =
    document.getElementById("avatar");

  const discordId =
    user.id.replace(
      "discord_",
      ""
    );

avatar.src =
  user.avatar
    ? /^https?:\/\//i.test(user.avatar)
      ? user.avatar
      : `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`
    : "https://cdn.discordapp.com/embed/avatars/0.png";


  // ==========================================================
  // OVERALL ACCURACY
  // ==========================================================

  const rwAnswered =
    Number(
      stats.rw_questions_answered
    ) || 0;

  const rwCorrect =
    Number(
      stats.rw_questions_correct
    ) || 0;

  const mathAnswered =
    Number(
      stats.math_questions_answered
    ) || 0;

  const mathCorrect =
    Number(
      stats.math_questions_correct
    ) || 0;

  const rwAccuracy =
    rwAnswered > 0
      ? Math.round(
          (rwCorrect / rwAnswered) * 100
        )
      : 0;

  const mathAccuracy =
    mathAnswered > 0
      ? Math.round(
          (mathCorrect / mathAnswered) * 100
        )
      : 0;


// ==========================================================
// OVERALL STATS
// ==========================================================

document.getElementById(
  "stats"
).innerHTML = `
  <div class="stat">
    <span>RW Elo</span>
    <b>${rwElo == null ? "???" : rwElo}</b>
  </div>

  <div class="stat">
    <span>RW Rank</span>
    <b class="${rwRank?.className || ""}">
      ${rwRank ? rwRank.name : "???"}
    </b>
  </div>

  <div class="stat">
    <span>Math Elo</span>
    <b>${mathElo == null ? "???" : mathElo}</b>
  </div>

  <div class="stat">
    <span>Math Rank</span>
    <b class="${mathRank?.className || ""}">
      ${mathRank ? mathRank.name : "???"}
    </b>
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

  // ==========================================================
  // QUESTION TYPE STATS
  // ==========================================================

  renderQuestionTypeStats(
    questionTypeStats
  );


// ==========================================================
// SOCIAL LINKS
// ==========================================================

const socials = [];

const twitterUrl =
  getSafeExternalUrl(
    profile.twitter
  );

const instagramUrl =
  getSafeExternalUrl(
    profile.instagram
  );

const youtubeUrl =
  getSafeExternalUrl(
    profile.youtube
  );

const websiteUrl =
  getSafeExternalUrl(
    profile.website
  );

function getSafeExternalUrl(value) {
  try {
    const url =
      new URL(String(value));

    return ["https:", "http:"].includes(
      url.protocol
    )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

if (twitterUrl) {
  socials.push(`
    <a
      href="${escapeAttribute(twitterUrl)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      Twitter
    </a>
  `);
}

if (instagramUrl) {
  socials.push(`
    <a
      href="${escapeAttribute(instagramUrl)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      Instagram
    </a>
  `);
}

if (youtubeUrl) {
  socials.push(`
    <a
      href="${escapeAttribute(youtubeUrl)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      YouTube
    </a>
  `);
}

if (websiteUrl) {
  socials.push(`
    <a
      href="${escapeAttribute(websiteUrl)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      Website
    </a>
  `);
}

document.getElementById(
  "socials"
).innerHTML =
  socials.join("");

}
  
  // ============================================================
// QUESTION TYPE STATS
// ============================================================

function renderQuestionTypeStats(
  questionTypeStats
) {
  const existing =
    document.getElementById(
      "questionTypeStats"
    );

  if (existing) {
    existing.remove();
  }

  const section =
    document.createElement("div");

  section.id =
    "questionTypeStats";

  section.className =
    "question-type-stats";


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


  for (const stat of questionTypeStats) {
    const answered =
      Number(
        stat.questions_answered
      ) || 0;

    const correct =
      Number(
        stat.questions_correct
      ) || 0;

    const accuracy =
      answered > 0
        ? Math.round(
            (correct / answered) * 100
          )
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

    row.appendChild(
      accuracyElement
    );

    row.appendChild(
      count
    );

    section.appendChild(row);
  }


  if (
    questionTypeStats.length === 0
  ) {
    const empty =
      document.createElement("p");

    empty.innerText =
      "No Reading & Writing data yet.";

    section.appendChild(empty);
  }


  const stats =
    document.getElementById(
      "stats"
    );

  stats.insertAdjacentElement(
    "afterend",
    section
  );
}


// ============================================================
// HELPERS
// ============================================================

function escapeAttribute(value) {
  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    );
}


// ============================================================
// SETTINGS
// ============================================================


// ============================================================
// LOGOUT
// ============================================================

async function logout() {
  try {
    const sessionId =
      sessionStorage.getItem(
        LOCAL_SESSION_KEY
      );

    if (sessionId) {
      await fetch(
        `${Auth_API}/logout?session=${encodeURIComponent(sessionId)}`,
        {
          credentials: "include"
        }
      );

    } else {
      await fetch(
        `${Auth_API}/logout`,
        {
          credentials: "include"
        }
      );
    }

  } finally {
    // Delete local development session.
    sessionStorage.removeItem(
      LOCAL_SESSION_KEY
    );

    location.href = "/";
  }
}

window.logout = logout;

// ============================================================
// START
// ============================================================

load();