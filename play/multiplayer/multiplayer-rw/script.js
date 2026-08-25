const API = "http://127.0.0.1:8787";
const AUTH_API = "https://auth.scoreladder.org";

/* =========================================================
   CONSTANTS
   ========================================================= */

const TOTAL_QUESTIONS = 11;
const MATCH_DURATION_MS = 13 * 60 * 1000;
const COOLDOWN_DURATION_MS = 15 * 60 * 1000;

const COOLDOWN_STORAGE_KEY =
  "scoreladder_multiplayer_cooldown_until";

const KHAN_ACADEMY_SAT_URL =
  "https://www.khanacademy.org/test-prep/sat";

/* =========================================================
   ELEMENTS
   ========================================================= */

const startMatchButton =
  document.getElementById("startMatchButton");

const statusDiv =
  document.getElementById("status");

const timerDiv =
  document.getElementById("timer");

const questionsDiv =
  document.getElementById("questions");

const submitButton =
  document.getElementById("submitButton");

const resultDiv =
  document.getElementById("result");

const playerNameDiv =
  document.getElementById("playerName");

const playerEloDiv =
  document.getElementById("playerElo");

const opponentNameDiv =
  document.getElementById("opponentName");

const opponentEloDiv =
  document.getElementById("opponentElo");

/* =========================================================
   STATE
   ========================================================= */

let playerId = null;
let matchId = null;
let opponent = null;

let checkingMatch = false;
let matchSocket = null;

let inQueue = false;
let gameStarted = false;
let playerReady = false;

let matchConnectionConfirmed = false;

let challengeSubmitted = false;
let submissionInProgress = false;

let questions = [];
let selectedAnswers = [];

/* =========================================================
   MATCH TIMER
   ========================================================= */

let timerInterval = null;
let challengeDeadline = 0;
let timeRemaining = 0;

/* =========================================================
   COOLDOWN
   ========================================================= */

let cooldownUntil = 0;
let cooldownInterval = null;

/* =========================================================
   UI STATE
   ========================================================= */

let newGameMode = false;

/* =========================================================
   TOPICS
   ========================================================= */

const TOPIC_ALIASES = {
  central_idea: "central_ideas",
  central_ideas: "central_ideas",

  text_evidence: "command_evidence_textual",
  textual_evidence: "command_evidence_textual",
  command_evidence_textual:
    "command_evidence_textual",

  quantitative_evidence:
    "command_evidence_quantitative",
  command_evidence_quantitative:
    "command_evidence_quantitative",

  inference: "inferences",
  inferences: "inferences",

  word_in_context: "words_in_context",
  words_in_context: "words_in_context",

  structure_and_purpose:
    "text_structure_purpose",
  text_structure_purpose:
    "text_structure_purpose",

  cross_text:
    "cross_text_connections",
  cross_text_connections:
    "cross_text_connections",

  rhetorical:
    "rhetorical_synthesis",
  rhetorical_synthesis:
    "rhetorical_synthesis",

  transition: "transitions",
  transitions: "transitions",

  boundary: "boundaries",
  boundaries: "boundaries",

  form_structure_sense:
    "form_structure_sense"
};

const TOPIC_DISPLAY_NAMES = {
  central_ideas:
    "Central Ideas",

  command_evidence_textual:
    "Command of Evidence — Textual",

  command_evidence_quantitative:
    "Command of Evidence — Quantitative",

  inferences:
    "Inferences",

  words_in_context:
    "Words in Context",

  text_structure_purpose:
    "Text Structure & Purpose",

  cross_text_connections:
    "Cross-Text Connections",

  rhetorical_synthesis:
    "Rhetorical Synthesis",

  transitions:
    "Transitions",

  boundaries:
    "Boundaries",

  form_structure_sense:
    "Form, Structure & Sense"
};

function normalizeTopic(topic) {
  if (typeof topic !== "string") {
    return null;
  }

  const normalized =
    topic.trim().toLowerCase();

  return TOPIC_ALIASES[normalized] ?? null;
}

function getTopicDisplayName(topic) {
  const normalized =
    normalizeTopic(topic);

  return (
    TOPIC_DISPLAY_NAMES[normalized] ||
    topic ||
    "Unknown Topic"
  );
}

/* =========================================================
   BASIC UI
   ========================================================= */

function setStatus(message) {
  if (statusDiv) {
    statusDiv.textContent = message;
  }
}

function showResult(message) {
  if (resultDiv) {
    resultDiv.textContent = message;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPassage(text) {
  if (typeof text !== "string") {
    return "";
  }

  return escapeHtml(text)
    .replace(
      /\[UNDERLINED\](.*?)\[\/UNDERLINED\]/g,
      "<u>$1</u>"
    )
    .replace(
      /\[\*\*UNDERLINED\*\*\](.*?)\[\/\*\*UNDERLINED\*\*\]/g,
      "<u>$1</u>"
    )
    .replace(/\n/g, "<br>");
}

/* =========================================================
   SESSION
   ========================================================= */

function getSessionId() {
  try {
    return sessionStorage.getItem(
      "scoreladder_session"
    );
  } catch (error) {
    console.error(
      "Failed to get session:",
      error
    );

    return null;
  }
}

/* =========================================================
   COOLDOWN
   ========================================================= */

function getStoredCooldownUntil() {
  try {
    const stored =
      localStorage.getItem(
        COOLDOWN_STORAGE_KEY
      );

    if (!stored) {
      return 0;
    }

    const timestamp =
      Number(stored);

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0
    ) {
      localStorage.removeItem(
        COOLDOWN_STORAGE_KEY
      );

      return 0;
    }

    return timestamp;
  } catch (error) {
    console.error(
      "Failed to read cooldown:",
      error
    );

    return 0;
  }
}

function saveCooldownUntil(timestamp) {
  cooldownUntil = timestamp;

  try {
    localStorage.setItem(
      COOLDOWN_STORAGE_KEY,
      String(timestamp)
    );
  } catch (error) {
    console.error(
      "Failed to save cooldown:",
      error
    );
  }
}

function clearCooldown() {
  cooldownUntil = 0;

  try {
    localStorage.removeItem(
      COOLDOWN_STORAGE_KEY
    );
  } catch (error) {
    console.error(
      "Failed to clear cooldown:",
      error
    );
  }

  stopCooldownTimer();
}

function getCooldownRemainingMs() {
  if (!cooldownUntil) {
    return 0;
  }

  return Math.max(
    0,
    cooldownUntil - Date.now()
  );
}

function isCoolingDown() {
  return getCooldownRemainingMs() > 0;
}

function formatCountdown(totalSeconds) {
  const safeSeconds =
    Math.max(
      0,
      Math.ceil(totalSeconds)
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    safeSeconds % 60;

  return `${minutes}:${String(
    seconds
  ).padStart(2, "0")}`;
}

/* =========================================================
   COOLDOWN UI
   ========================================================= */

function updateCooldownUI() {
  const remainingMs =
    getCooldownRemainingMs();

  if (remainingMs <= 0) {
    clearCooldown();

    if (
      !gameStarted &&
      !inQueue
    ) {
      enableQueueButton();
    }

    return;
  }

  const remainingSeconds =
    Math.ceil(
      remainingMs / 1000
    );

  if (startMatchButton) {
    startMatchButton.disabled = true;

    startMatchButton.textContent =
      `Cooldown: ${formatCountdown(
        remainingSeconds
      )}`;
  }

  if (
    submitButton &&
    newGameMode
  ) {
    submitButton.style.display =
      "block";

    submitButton.disabled = true;

    submitButton.textContent =
      `New Game (${formatCountdown(
        remainingSeconds
      )})`;
  }

  if (
    !gameStarted &&
    !inQueue
  ) {
    setStatus(
      `You can play again in ${formatCountdown(
        remainingSeconds
      )}.`
    );
  }
}

function startCooldownTimer() {
  stopCooldownTimer();

  updateCooldownUI();

  cooldownInterval =
    setInterval(() => {
      updateCooldownUI();

      if (
        getCooldownRemainingMs() <= 0
      ) {
        stopCooldownTimer();
      }
    }, 250);
}

function stopCooldownTimer() {
  if (cooldownInterval) {
    clearInterval(
      cooldownInterval
    );

    cooldownInterval = null;
  }
}

function beginCooldown() {
  gameStarted = false;
  inQueue = false;
  playerReady = false;
  matchConnectionConfirmed = false;

  clearMatchTimer();

  const until =
    Date.now() +
    COOLDOWN_DURATION_MS;

  saveCooldownUntil(until);

  newGameMode = true;

  if (submitButton) {
    submitButton.style.display =
      "block";

    submitButton.disabled = true;

    submitButton.textContent =
      `New Game (${formatCountdown(
        Math.ceil(
          COOLDOWN_DURATION_MS / 1000
        )
      )})`;
  }

  if (startMatchButton) {
    startMatchButton.disabled = true;

    startMatchButton.textContent =
      `Cooldown: ${formatCountdown(
        Math.ceil(
          COOLDOWN_DURATION_MS / 1000
        )
      )}`;
  }

  if (timerDiv) {
    timerDiv.textContent =
      "0:00";
  }

  setStatus(
    "Match complete. Practice your weakest topics while you wait."
  );

  renderCooldownPracticeMessage();

  startCooldownTimer();
}

function enableQueueButton() {
  if (!startMatchButton) {
    return;
  }

  if (
    gameStarted ||
    inQueue
  ) {
    return;
  }

  startMatchButton.disabled =
    false;

  startMatchButton.textContent =
    "Join Queue";

  if (
    submitButton &&
    newGameMode
  ) {
    submitButton.style.display =
      "none";

    submitButton.disabled = true;
  }

  setStatus(
    "Cooldown complete. You can join the queue."
  );

  renderCooldownCompleteMessage();
}

function initializeCooldown() {
  cooldownUntil =
    getStoredCooldownUntil();

  if (isCoolingDown()) {
    newGameMode = true;

    if (submitButton) {
      submitButton.style.display =
        "block";

      submitButton.disabled =
        true;

      submitButton.textContent =
        `New Game (${formatCountdown(
          Math.ceil(
            getCooldownRemainingMs() /
              1000
          )
        )})`;
    }

    if (startMatchButton) {
      startMatchButton.disabled =
        true;

      startMatchButton.textContent =
        `Cooldown: ${formatCountdown(
          Math.ceil(
            getCooldownRemainingMs() /
              1000
          )
        )}`;
    }

    startCooldownTimer();
    renderCooldownPracticeMessage();

    return;
  }

  clearCooldown();

  if (
    !gameStarted &&
    !inQueue
  ) {
    enableQueueButton();
  }
}

/* =========================================================
   COOLDOWN PRACTICE
   ========================================================= */

function getTopThreeWeakTopics() {
  const topicStats = {};

  const matches =
    Array.isArray(
      window.scoreladderRecentMatches
    )
      ? window.scoreladderRecentMatches
      : [];

  for (const match of matches) {
    const questionResults =
      extractQuestionResults(match);

    for (
      const result of questionResults
    ) {
      const topic =
        extractResultTopic(result);

      if (!topic) {
        continue;
      }

      if (!topicStats[topic]) {
        topicStats[topic] = {
          correct: 0,
          total: 0
        };
      }

      topicStats[topic].total++;

      if (
        result.correct === true ||
        result.correct === 1 ||
        result.correct === "1"
      ) {
        topicStats[topic].correct++;
      }
    }
  }

  return Object.entries(
    topicStats
  )
    .filter(
      ([, stats]) =>
        stats.total > 0
    )
    .sort(
      ([, a], [, b]) => {
        const accuracyA =
          a.correct / a.total;

        const accuracyB =
          b.correct / b.total;

        if (
          accuracyA !==
          accuracyB
        ) {
          return (
            accuracyA -
            accuracyB
          );
        }

        return (
          b.total -
          a.total
        );
      }
    )
    .slice(0, 3);
}

function renderCooldownPracticeMessage() {
  if (!resultDiv) {
    return;
  }

  const selectors = [
    ".cooldown-practice",
    ".recent-match-history",
    ".historical-topic-performance",
    ".current-topic-performance"
  ];

  selectors.forEach(
    selector => {
      const old =
        resultDiv.querySelector(
          selector
        );

      if (old) {
        old.remove();
      }
    }
  );

  const container =
    document.createElement("div");

  container.className =
    "cooldown-practice";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "While You Wait";

  container.appendChild(
    heading
  );

  const description =
    document.createElement("p");

  description.textContent =
    "Use the cooldown to practice your weakest SAT topics.";

  container.appendChild(
    description
  );

  const weakHeading =
    document.createElement("h4");

  weakHeading.textContent =
    "Top 3 Topics You Struggled With";

  container.appendChild(
    weakHeading
  );

  const weakTopics =
    getTopThreeWeakTopics();

  if (
    weakTopics.length === 0
  ) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "Play a few more matches to identify your weakest topics.";

    container.appendChild(
      empty
    );
  } else {
    weakTopics.forEach(
      ([topic, stats]) => {
        appendTopicRow(
          container,
          topic,
          stats,
          true
        );
      }
    );
  }

  const link =
    document.createElement("a");

  link.href =
    KHAN_ACADEMY_SAT_URL;

  link.target =
    "_blank";

  link.rel =
    "noopener noreferrer";

  link.textContent =
    "Practice SAT on Khan Academy";

  container.appendChild(
    link
  );

  resultDiv.appendChild(
    container
  );
}

function renderCooldownCompleteMessage() {
  if (!resultDiv) {
    return;
  }

  const old =
    resultDiv.querySelector(
      ".cooldown-practice"
    );

  if (old) {
    old.remove();
  }
}

/* =========================================================
   PLAYER INFORMATION
   ========================================================= */

function updatePlayer(player) {
  if (!player) {
    return;
  }

  if (playerNameDiv) {
    playerNameDiv.textContent =
      player.username ||
      player.display_name ||
      "You";
  }

  const elo =
    player.stats?.rw_elo ??
    player.rw_elo ??
    player.stats?.elo ??
    player.elo ??
    1200;

  if (playerEloDiv) {
    playerEloDiv.textContent =
      elo;
  }
}

function updateOpponent(player) {
  if (!player) {
    return;
  }

  opponent = player;

  if (opponentNameDiv) {
    opponentNameDiv.textContent =
      player.username ||
      player.display_name ||
      "Opponent";
  }

  const elo =
    player.stats?.rw_elo ??
    player.rw_elo ??
    player.stats?.elo ??
    player.elo ??
    1200;

  if (opponentEloDiv) {
    opponentEloDiv.textContent =
      elo;
  }
}

/* =========================================================
   REFRESH PLAYER STATS
   ========================================================= */

async function refreshPlayerStats() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    return null;
  }

  try {
    const response =
      await fetch(
        `${AUTH_API}/me?session=${encodeURIComponent(
          sessionId
        )}`
      );

    const player =
      await response.json();

    if (!response.ok) {
      console.error(
        "Failed to refresh player stats:",
        response.status,
        player
      );

      return null;
    }

    updatePlayer(player);

    return player;
  } catch (error) {
    console.error(
      "Failed to refresh player:",
      error
    );

    return null;
  }
}

/* =========================================================
   MATCH HISTORY
   ========================================================= */

async function loadRecentMatches() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    return;
  }

  try {
    const response =
      await fetch(
        `${AUTH_API}/match-history?session=${encodeURIComponent(
          sessionId
        )}&limit=5`
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Failed to load match history."
      );
    }

    const matches =
      Array.isArray(data.matches)
        ? data.matches.slice(0, 5)
        : [];

    window.scoreladderRecentMatches =
      matches;

    renderRecentMatches(
      matches
    );

    const hasQuestionData =
      matches.some(
        match =>
          extractQuestionResults(
            match
          ).length > 0
      );

    if (hasQuestionData) {
      renderHistoricalTopicPerformance(
        matches
      );
    } else {
      await loadHistoricalTopicPerformance();
    }

    if (isCoolingDown()) {
      renderCooldownPracticeMessage();
    }
  } catch (error) {
    console.error(
      "Failed to load recent matches:",
      error
    );
  }
}

/* =========================================================
   EXTRACT QUESTION RESULTS
   ========================================================= */

function extractQuestionResults(match) {
  if (
    !match ||
    typeof match !== "object"
  ) {
    return [];
  }

  const possibleFields = [
    match.questionResults,
    match.question_results,
    match.questions,
    match.results,
    match.questionLevelResults,
    match.question_level_results
  ];

  for (
    const value of possibleFields
  ) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function extractResultTopic(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return null;
  }

  return normalizeTopic(
    result.topic ??
    result.questionTopic ??
    result.question_topic ??
    result.question_type ??
    result.questionType ??
    result.type
  );
}

/* =========================================================
   HISTORICAL TOPIC PERFORMANCE
   ========================================================= */

function renderHistoricalTopicPerformance(
  matches
) {
  if (!resultDiv) {
    return;
  }

  const oldPerformance =
    resultDiv.querySelector(
      ".historical-topic-performance"
    );

  if (oldPerformance) {
    oldPerformance.remove();
  }

  const topicStats = {};

  for (
    const match of matches
  ) {
    const questionResults =
      extractQuestionResults(
        match
      );

    for (
      const result of questionResults
    ) {
      const topic =
        extractResultTopic(
          result
        );

      if (!topic) {
        continue;
      }

      if (!topicStats[topic]) {
        topicStats[topic] = {
          correct: 0,
          total: 0
        };
      }

      topicStats[topic].total++;

      if (
        result.correct === true ||
        result.correct === 1 ||
        result.correct === "1"
      ) {
        topicStats[topic].correct++;
      }
    }
  }

  const topics =
    Object.entries(
      topicStats
    );

  const container =
    document.createElement("div");

  container.className =
    "historical-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "Topics You Struggled With";

  container.appendChild(
    heading
  );

  const description =
    document.createElement("p");

  description.className =
    "topic-performance-description";

  description.textContent =
    "Based on your recent completed matches.";

  container.appendChild(
    description
  );

  if (
    topics.length === 0
  ) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "No question-level topic data was found in match history.";

    container.appendChild(
      empty
    );

    resultDiv.appendChild(
      container
    );

    return;
  }

  renderTopicStatsIntoContainer(
    container,
    topics
  );

  resultDiv.appendChild(
    container
  );
}

/* =========================================================
   SERVER TOPIC PERFORMANCE
   ========================================================= */

async function loadHistoricalTopicPerformance() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    return;
  }

  try {
    const response =
      await fetch(
        `${AUTH_API}/topic-performance?session=${encodeURIComponent(
          sessionId
        )}&limit=5`
      );

    const data =
      await response.json();

    if (!response.ok) {
      renderNoHistoricalTopicData(
        "The topic performance endpoint returned an error."
      );

      return;
    }

    if (
      !data ||
      data.success !== true
    ) {
      renderNoHistoricalTopicData(
        "The server could not calculate topic performance."
      );

      return;
    }

    let rawTopics = [];

    if (
      Array.isArray(data.topics)
    ) {
      rawTopics =
        data.topics;
    } else if (
      data.topics &&
      typeof data.topics === "object"
    ) {
      rawTopics =
        Object.entries(
          data.topics
        ).map(
          ([topic, stats]) => ({
            topic,
            ...(stats || {})
          })
        );
    } else if (
      Array.isArray(data.topicStats)
    ) {
      rawTopics =
        data.topicStats;
    } else if (
      data.topicStats &&
      typeof data.topicStats === "object"
    ) {
      rawTopics =
        Object.entries(
          data.topicStats
        ).map(
          ([topic, stats]) => ({
            topic,
            ...(stats || {})
          })
        );
    }

    const normalizedStats = {};

    for (
      const item of rawTopics
    ) {
      if (
        !item ||
        typeof item !== "object"
      ) {
        continue;
      }

      const topic =
        normalizeTopic(
          item.topic ??
          item.question_type ??
          item.questionType ??
          item.type ??
          item.name
        );

      if (!topic) {
        continue;
      }

      let correct =
        Number(
          item.correct ??
          item.questions_correct ??
          item.questionsCorrect ??
          item.correct_count ??
          item.correctCount ??
          0
        );

      let total =
        Number(
          item.total ??
          item.questions_answered ??
          item.questionsAnswered ??
          item.total_questions ??
          item.totalQuestions ??
          item.total_count ??
          item.totalCount ??
          item.attempts ??
          item.question_count ??
          item.questionCount ??
          0
        );

      if (
        !Number.isFinite(correct)
      ) {
        correct = 0;
      }

      if (
        !Number.isFinite(total)
      ) {
        total = 0;
      }

      if (
        correct === 0 &&
        total > 0 &&
        Number.isFinite(
          Number(item.accuracy)
        ) &&
        Number(item.accuracy) > 0
      ) {
        let accuracy =
          Number(item.accuracy);

        if (accuracy > 1) {
          accuracy /= 100;
        }

        correct =
          Math.round(
            accuracy * total
          );
      }

      if (total <= 0) {
        continue;
      }

      if (!normalizedStats[topic]) {
        normalizedStats[topic] = {
          correct: 0,
          total: 0
        };
      }

      normalizedStats[topic].correct +=
        correct;

      normalizedStats[topic].total +=
        total;
    }

    const topics =
      Object.entries(
        normalizedStats
      );

    if (
      topics.length === 0
    ) {
      renderNoHistoricalTopicData();

      return;
    }

    renderHistoricalTopicStats(
      topics
    );
  } catch (error) {
    console.error(
      "Failed to load historical topic performance:",
      error
    );

    renderNoHistoricalTopicData(
      "Failed to load topic performance."
    );
  }
}

function renderHistoricalTopicStats(
  topics
) {
  if (!resultDiv) {
    return;
  }

  const old =
    resultDiv.querySelector(
      ".historical-topic-performance"
    );

  if (old) {
    old.remove();
  }

  const container =
    document.createElement("div");

  container.className =
    "historical-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "Topics You Struggled With";

  container.appendChild(
    heading
  );

  const description =
    document.createElement("p");

  description.className =
    "topic-performance-description";

  description.textContent =
    "Based on your recent completed matches.";

  container.appendChild(
    description
  );

  renderTopicStatsIntoContainer(
    container,
    topics
  );

  resultDiv.appendChild(
    container
  );
}

function renderTopicStatsIntoContainer(
  container,
  topics
) {
  topics = [...topics];

  topics.sort(
    ([, a], [, b]) => {
      const accuracyA =
        a.total > 0
          ? a.correct / a.total
          : 0;

      const accuracyB =
        b.total > 0
          ? b.correct / b.total
          : 0;

      return (
        accuracyA -
        accuracyB
      );
    }
  );

  const strugglingTopics =
    topics.filter(
      ([, stats]) => {
        const accuracy =
          stats.total > 0
            ? stats.correct /
              stats.total
            : 0;

        return (
          stats.total >= 3 &&
          accuracy < 0.70
        );
      }
    );

  if (
    strugglingTopics.length === 0
  ) {
    const good =
      document.createElement("p");

    good.textContent =
      "No clear weak topics yet. Keep playing to build a larger sample.";

    container.appendChild(
      good
    );
  } else {
    strugglingTopics.forEach(
      ([topic, stats]) => {
        appendTopicRow(
          container,
          topic,
          stats,
          true
        );
      }
    );
  }

  const allHeading =
    document.createElement("h4");

  allHeading.textContent =
    "All Topic Performance";

  container.appendChild(
    allHeading
  );

  topics.forEach(
    ([topic, stats]) => {
      appendTopicRow(
        container,
        topic,
        stats,
        false
      );
    }
  );
}

function appendTopicRow(
  container,
  topic,
  stats,
  struggling
) {
  const total =
    Number(stats.total) || 0;

  const correct =
    Number(stats.correct) || 0;

  const accuracy =
    total > 0
      ? Math.round(
          (correct / total) *
          100
        )
      : 0;

  const row =
    document.createElement("div");

  row.className =
    "topic-performance-row";

  if (struggling) {
    row.classList.add(
      "topic-struggling"
    );
  }

  const name =
    document.createElement("span");

  name.className =
    "topic-performance-name";

  name.textContent =
    getTopicDisplayName(topic);

  const score =
    document.createElement("span");

  score.className =
    "topic-performance-score";

  score.textContent =
    `${correct}/${total} (${accuracy}%)`;

  row.appendChild(name);
  row.appendChild(score);

  if (struggling) {
    const label =
      document.createElement("span");

    label.className =
      "topic-struggling-label";

    label.textContent =
      "Needs work";

    row.appendChild(label);
  }

  container.appendChild(row);
}

function renderNoHistoricalTopicData(
  reason =
    "Topic performance will appear after enough question-level match data is available."
) {
  if (!resultDiv) {
    return;
  }

  const old =
    resultDiv.querySelector(
      ".historical-topic-performance"
    );

  if (old) {
    old.remove();
  }

  const container =
    document.createElement("div");

  container.className =
    "historical-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "Topics You Struggled With";

  container.appendChild(
    heading
  );

  const description =
    document.createElement("p");

  description.textContent =
    "Based on your recent completed matches.";

  container.appendChild(
    description
  );

  const empty =
    document.createElement("p");

  empty.textContent =
    reason;

  container.appendChild(
    empty
  );

  resultDiv.appendChild(
    container
  );
}

/* =========================================================
   RECENT MATCH DISPLAY
   ========================================================= */

function renderRecentMatches(
  matches
) {
  if (!resultDiv) {
    return;
  }

  const oldHistory =
    resultDiv.querySelector(
      ".recent-match-history"
    );

  if (oldHistory) {
    oldHistory.remove();
  }

  const container =
    document.createElement("div");

  container.className =
    "recent-match-history";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "Recent Matches";

  container.appendChild(
    heading
  );

  if (
    matches.length === 0
  ) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "No completed matches yet.";

    container.appendChild(
      empty
    );

    resultDiv.appendChild(
      container
    );

    return;
  }

  matches.forEach(
    (match, index) => {
      const row =
        document.createElement("div");

      row.className =
        "recent-match-row";

      let result =
        match.result;

      if (!result) {
        if (
          match.won === true
        ) {
          result = "win";
        } else if (
          match.won === false
        ) {
          result = "loss";
        } else {
          result = "unknown";
        }
      }

      const opponentName =
        match.opponentUsername ||
        match.opponent?.username ||
        match.opponent?.display_name ||
        match.opponent ||
        "Opponent";

      const correct =
        Number(
          match.yourCorrect ??
          match.your_correct ??
          match.correct ??
          0
        );

      const total =
        Number(
          match.yourTotal ??
          match.your_total ??
          match.totalQuestions ??
          match.total_questions ??
          TOTAL_QUESTIONS
        );

      const rawAccuracy =
        match.yourAccuracy ??
        match.your_accuracy ??
        match.accuracy;

      const accuracy =
        Number.isFinite(
          Number(rawAccuracy)
        )
          ? Number(rawAccuracy)
          : (
              total > 0
                ? Math.round(
                    (correct / total) *
                    100
                  )
                : 0
            );

      const resultText =
        result === "win"
          ? "Won"
          : result === "loss"
            ? "Lost"
            : result === "tie"
              ? "Tie"
              : "Complete";

      row.innerHTML = `
        <div class="recent-match-number">
          #${index + 1}
        </div>

        <div class="recent-match-opponent">
          ${escapeHtml(opponentName)}
        </div>

        <div class="recent-match-result">
          ${escapeHtml(resultText)}
        </div>

        <div class="recent-match-score">
          ${correct}/${total} (${accuracy}%)
        </div>
      `;

      container.appendChild(
        row
      );
    }
  );

  resultDiv.appendChild(
    container
  );
}

/* =========================================================
   CURRENT MATCH TOPIC PERFORMANCE
   ========================================================= */

function renderTopicPerformance(
  data
) {
  if (!resultDiv) {
    return;
  }

  const old =
    resultDiv.querySelector(
      ".current-topic-performance"
    );

  if (old) {
    old.remove();
  }

  const questionResults =
    Array.isArray(
      data.questionResults
    )
      ? data.questionResults
      : [];

  const topicStats = {};

  questions.forEach(
    (question, questionIndex) => {
      const result =
        questionResults.find(
          item =>
            Number(
              item.questionIndex
            ) === questionIndex
        );

      if (!result) {
        return;
      }

      const topic =
        normalizeTopic(
          question.topic ||
          question.originalTopic ||
          result.topic
        );

      if (!topic) {
        return;
      }

      if (!topicStats[topic]) {
        topicStats[topic] = {
          correct: 0,
          total: 0
        };
      }

      topicStats[topic].total++;

      if (
        result.correct === true ||
        result.correct === 1 ||
        result.correct === "1"
      ) {
        topicStats[topic].correct++;
      }
    }
  );

  const topics =
    Object.entries(
      topicStats
    );

  if (
    topics.length === 0
  ) {
    return;
  }

  topics.sort(
    ([, a], [, b]) =>
      a.correct / a.total -
      b.correct / b.total
  );

  const performance =
    document.createElement("div");

  performance.className =
    "current-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "This Match: Topic Performance";

  performance.appendChild(
    heading
  );

  topics.forEach(
    ([topic, stats]) => {
      appendTopicRow(
        performance,
        topic,
        stats,
        stats.total >= 2 &&
        (
          stats.correct /
          stats.total
        ) < 0.70
      );
    }
  );

  resultDiv.appendChild(
    performance
  );
}

/* =========================================================
   MATCHMAKING
   ========================================================= */

async function startMatchmaking() {
  if (isCoolingDown()) {
    updateCooldownUI();

    setStatus(
      "You are still on cooldown."
    );

    return;
  }

  if (inQueue) {
    return;
  }

  const sessionId =
    getSessionId();

  if (!sessionId) {
    setStatus(
      "You must be logged in to play multiplayer."
    );

    return;
  }

  matchId = null;
  opponent = null;

  playerReady = false;
  gameStarted = false;

  challengeSubmitted = false;
  submissionInProgress = false;

  matchConnectionConfirmed =
    false;

  inQueue = true;

  if (startMatchButton) {
    startMatchButton.disabled = true;
    startMatchButton.textContent =
      "Joining Queue...";
  }

  if (submitButton) {
    submitButton.style.display =
      "none";
  }

  setStatus(
    "Finding an opponent..."
  );

  try {
    const response =
      await fetch(
        `${API}/matchmake?session=${encodeURIComponent(
          sessionId
        )}`
      );

    const data =
      await response.json();

    console.log(
      "Matchmaking response:",
      data
    );

    if (!response.ok) {
      if (data.cooldownUntil) {
        const serverCooldown =
          Number(data.cooldownUntil);

        if (
          Number.isFinite(serverCooldown) &&
          serverCooldown > Date.now()
        ) {
          saveCooldownUntil(
            serverCooldown
          );

          newGameMode = true;

          startCooldownTimer();

          renderCooldownPracticeMessage();
        }
      }

      throw new Error(
        data.error ||
        "Unable to enter matchmaking."
      );
    }

    if (
      data.status === "cooldown"
    ) {
      inQueue = false;

      if (data.nextGameAt) {
        const nextGameAt =
          Number(data.nextGameAt);

        if (
          Number.isFinite(nextGameAt) &&
          nextGameAt > Date.now()
        ) {
          saveCooldownUntil(
            nextGameAt
          );

          newGameMode = true;

          startCooldownTimer();

          renderCooldownPracticeMessage();

          return;
        }
      }

      throw new Error(
        "Game cooldown is active."
      );
    }

    playerId =
      data.playerId;

    if (data.player) {
      updatePlayer(
        data.player
      );
    }

    if (
      data.status === "matched"
    ) {
      matchId =
        data.matchId;

      inQueue = false;

      updateOpponent(
        data.opponent
      );

      setStatus(
        "Opponent found!"
      );

      startMatchButton.textContent =
        "Connecting...";

      onMatchFound();

      return;
    }

    startMatchButton.textContent =
      "In Queue";

    setStatus(
      "Waiting for opponent..."
    );

    checkForMatch();

  } catch (error) {
    console.error(
      "Matchmaking error:",
      error
    );

    setStatus(
      error.message ||
      "Unable to connect to matchmaking."
    );

    inQueue = false;

    if (isCoolingDown()) {
      updateCooldownUI();
      return;
    }

    startMatchButton.disabled =
      false;

    startMatchButton.textContent =
      "Join Queue";

    if (submitButton) {
      submitButton.style.display =
        "none";
    }
  }
}

/* =========================================================
   CHECK FOR MATCH
   ========================================================= */

async function checkForMatch() {
  if (
    checkingMatch ||
    !playerId ||
    matchId
  ) {
    return;
  }

  checkingMatch = true;

  try {
    const response =
      await fetch(
        `${API}/check-match?playerId=${encodeURIComponent(
          playerId
        )}`
      );

    const data =
      await response.json();

    console.log(
      "Match check:",
      data
    );

    if (
      response.ok &&
      data.status === "cooldown"
    ) {
      inQueue = false;

      if (data.nextGameAt) {
        const nextGameAt =
          Number(data.nextGameAt);

        if (
          Number.isFinite(nextGameAt) &&
          nextGameAt > Date.now()
        ) {
          saveCooldownUntil(
            nextGameAt
          );

          newGameMode = true;

          startCooldownTimer();

          renderCooldownPracticeMessage();

          return;
        }
      }
    }

    if (
      response.ok &&
      data.status === "matched"
    ) {
      matchId =
        data.matchId;

      inQueue = false;

      updateOpponent(
        data.opponent
      );

      setStatus(
        "Opponent found!"
      );

      startMatchButton.textContent =
        "Connecting...";

      onMatchFound();

      return;
    }

  } catch (error) {
    console.error(
      "Match check error:",
      error
    );
  } finally {
    checkingMatch = false;
  }

  if (
    !matchId &&
    inQueue &&
    !isCoolingDown()
  ) {
    setTimeout(
      checkForMatch,
      1000
    );
  }
}

/* =========================================================
   MATCH FOUND
   ========================================================= */

function onMatchFound() {
  console.log(
    "Match found:",
    matchId
  );

  console.log(
    "Opponent:",
    opponent
  );

  matchConnectionConfirmed =
    false;

  connectToRoom();
}

/* =========================================================
   WEBSOCKET
   ========================================================= */

function connectToRoom() {
  if (
    !matchId ||
    !playerId
  ) {
    console.error(
      "Cannot connect to room:",
      {
        matchId,
        playerId
      }
    );

    return;
  }

  const wsAPI =
    API
      .replace(
        "http://",
        "ws://"
      )
      .replace(
        "https://",
        "wss://"
      );

  const socketURL =
    `${wsAPI}/match?matchId=${encodeURIComponent(
      matchId
    )}` +
    `&playerId=${encodeURIComponent(
      playerId
    )}`;

  console.log(
    "Connecting to room:",
    socketURL
  );

  if (
    matchSocket &&
    matchSocket.readyState !==
      WebSocket.CLOSED &&
    matchSocket.readyState !==
      WebSocket.CLOSING
  ) {
    matchSocket.close();
  }

  const socket =
    new WebSocket(
      socketURL
    );

  matchSocket =
    socket;

  socket.addEventListener(
    "open",
    () => {
      console.log(
        "WebSocket connected."
      );

      setStatus(
        "Connected. Waiting for opponent..."
      );
    }
  );

  socket.addEventListener(
    "message",
    event => {
      console.log(
        "WebSocket message:",
        event.data
      );

      let data;

      try {
        data =
          JSON.parse(
            event.data
          );
      } catch (error) {
        console.error(
          "Invalid WebSocket message:",
          event.data
        );

        return;
      }

      if (
        matchSocket !== socket
      ) {
        console.warn(
          "Ignoring message from stale socket."
        );

        return;
      }

      switch (data.type) {

        case "connected":

          console.log(
            "Room connection confirmed:",
            data
          );

          if (
            data.opponent
          ) {
            updateOpponent(
              data.opponent
            );
          }

          return;

        case "waiting_for_opponent":

          if (
            !matchConnectionConfirmed &&
            !gameStarted
          ) {
            setStatus(
              "Waiting for opponent to connect..."
            );

            if (startMatchButton) {
              startMatchButton.disabled =
                true;

              startMatchButton.textContent =
                "Waiting for Opponent...";
            }
          }

          return;

        case "match_ready":

          matchConnectionConfirmed =
            true;

          inQueue = true;

          gameStarted = false;

          playerReady = false;

          setStatus(
            "Both players connected. Ready to start."
          );

          if (startMatchButton) {
            startMatchButton.disabled =
              false;

            startMatchButton.textContent =
              "Start Match";
          }

          return;

        case "opponent_ready":

          matchConnectionConfirmed =
            true;

          if (!gameStarted) {
            setStatus(
              "Opponent is ready. Click Start Match when ready."
            );
          }

          return;

        case "game_schedule":

          console.log(
            "Next game scheduled:",
            data.nextGameAt
          );

          if (
            data.nextGameAt &&
            !gameStarted
          ) {
            setStatus(
              data.message ||
              "Game scheduled."
            );
          }

          return;

        case "game_start":

          matchConnectionConfirmed =
            true;

          inQueue = false;

          handleGameStart(
            data
          );

          return;

        case "answer_update":

          return;

        case "opponent_submitted":

          setStatus(
            "Opponent has submitted. Finish your answers."
          );

          return;

        case "submission_received":

          if (data.automatic) {
            setStatus(
              "Time expired. Waiting for opponent..."
            );
          }

          return;

        case "game_result":

          handleGameResult(
            data
          );

          return;

        case "game_error":

          console.error(
            "Game error:",
            data.message
          );

          gameStarted = false;
          playerReady = false;
          inQueue = false;

          matchConnectionConfirmed =
            false;

          clearMatchTimer();

          setStatus(
            data.message ||
            "Unable to start match."
          );

          if (startMatchButton) {
            startMatchButton.disabled =
              false;

            startMatchButton.textContent =
              "Join Queue";
          }

          return;

        case "game_not_ready":

          setStatus(
            data.message ||
            "The game is not ready yet."
          );

          gameStarted = false;
          playerReady = false;

          if (
            matchConnectionConfirmed &&
            startMatchButton
          ) {
            startMatchButton.disabled =
              false;

            startMatchButton.textContent =
              "Start Match";
          }

          return;

        case "opponent_left":

          if (
            !matchConnectionConfirmed &&
            !gameStarted
          ) {
            console.warn(
              "Ignoring opponent_left before match was confirmed."
            );

            return;
          }

          console.warn(
            "Opponent disconnected."
          );

          setStatus(
            "Opponent disconnected."
          );

          if (submitButton) {
            submitButton.disabled =
              true;
          }

          if (startMatchButton) {
            startMatchButton.disabled =
              true;
          }

          stopMatchTimer();

          gameStarted = false;

          return;

        default:

          console.warn(
            "Unknown WebSocket message:",
            data
          );

          return;
      }
    }
  );

  socket.addEventListener(
    "error",
    error => {
      if (
        matchSocket !== socket
      ) {
        return;
      }

      console.error(
        "WebSocket error:",
        error
      );

      setStatus(
        "Connection to match failed."
      );
    }
  );

  socket.addEventListener(
    "close",
    event => {
      console.log(
        "WebSocket closed.",
        {
          code:
            event.code,
          reason:
            event.reason
        }
      );

      if (
        matchSocket === socket &&
        !gameStarted
      ) {
        console.log(
          "Socket closed before game start."
        );
      }
    }
  );
}

/* =========================================================
   HANDLE SERVER GAME START
   ========================================================= */

function handleGameStart(data) {
  console.log(
    "GAME START RECEIVED:",
    data
  );

  if (
    !data ||
    !Array.isArray(data.questions)
  ) {
    console.error(
      "Invalid game_start payload:",
      data
    );

    setStatus(
      "The server sent an invalid question set."
    );

    return;
  }

  if (
    data.questions.length !==
    TOTAL_QUESTIONS
  ) {
    console.error(
      "Unexpected question count:",
      data.questions.length
    );

    setStatus(
      `The server sent ${data.questions.length} questions instead of ${TOTAL_QUESTIONS}.`
    );

    return;
  }

  questions =
    data.questions;

  selectedAnswers =
    new Array(
      questions.length
    ).fill(-1);

  challengeSubmitted =
    false;

  submissionInProgress =
    false;

  playerReady =
    true;

  inQueue =
    false;

  gameStarted =
    true;

  newGameMode =
    false;

  if (submitButton) {
    submitButton.style.display =
      "block";

    submitButton.textContent =
      "Submit Answers";

    submitButton.disabled =
      true;
  }

  if (startMatchButton) {
    startMatchButton.disabled =
      true;

    startMatchButton.textContent =
      "Match In Progress";
  }

  if (resultDiv) {
    resultDiv.innerHTML = "";
  }

  renderQuestions();

  startMatchTimer(
    data.startTime
  );

  setStatus(
    "Match started. Answer all questions before time expires."
  );

  updateSubmitButton();
}

/* =========================================================
   MATCH TIMER
   ========================================================= */

function startMatchTimer(
  serverStartTime
) {
  stopMatchTimer();

  const startTime =
    Number(
      serverStartTime
    );

  if (
    !Number.isFinite(
      startTime
    )
  ) {
    console.error(
      "Invalid server start time:",
      serverStartTime
    );

    setStatus(
      "Unable to start timer."
    );

    return;
  }

  challengeDeadline =
    startTime +
    MATCH_DURATION_MS;

  gameStarted =
    true;

  timeRemaining =
    Math.max(
      0,
      Math.ceil(
        (
          challengeDeadline -
          Date.now()
        ) / 1000
      )
    );

  updateMatchTimer();

  timerInterval =
    setInterval(
      () => {
        if (!gameStarted) {
          stopMatchTimer();

          return;
        }

        const remaining =
          Math.max(
            0,
            Math.ceil(
              (
                challengeDeadline -
                Date.now()
              ) / 1000
            )
          );

        timeRemaining =
          remaining;

        updateMatchTimer();

        if (
          remaining <= 0
        ) {
          stopMatchTimer();

          if (
            gameStarted &&
            !challengeSubmitted &&
            !submissionInProgress
          ) {
            submitMatch(true);
          }
        }
      },
      250
    );
}

function stopMatchTimer() {
  if (timerInterval) {
    clearInterval(
      timerInterval
    );

    timerInterval = null;
  }
}

function clearMatchTimer() {
  stopMatchTimer();

  challengeDeadline =
    0;

  timeRemaining =
    0;
}

function updateMatchTimer() {
  if (!timerDiv) {
    return;
  }

  if (!gameStarted) {
    return;
  }

  const safeSeconds =
    Math.max(
      0,
      Math.ceil(
        timeRemaining
      )
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    safeSeconds % 60;

  timerDiv.textContent =
    `${minutes}:${String(
      seconds
    ).padStart(2, "0")}`;
}

/* =========================================================
   RENDER QUESTIONS
   ========================================================= */

function renderQuestions() {
  if (!questionsDiv) {
    return;
  }

  questionsDiv.innerHTML =
    "";

  questions.forEach(
    (q, questionIndex) => {
      const card =
        document.createElement(
          "div"
        );

      card.className =
        "card";

      const questionNumber =
        document.createElement(
          "div"
        );

      questionNumber.className =
        "question-number";

      questionNumber.textContent =
        `Question ${
          questionIndex + 1
        }`;

      card.appendChild(
        questionNumber
      );

      const meta =
        document.createElement(
          "div"
        );

      meta.className =
        "meta";

      meta.textContent =
        `${getTopicDisplayName(
          q.topic
        )}` +
        `${
          q.difficulty
            ? " • " +
              q.difficulty
            : ""
        }`;

      card.appendChild(
        meta
      );

      if (q.passage) {
        const passage =
          document.createElement(
            "div"
          );

        passage.className =
          "passage";

        passage.innerHTML =
          formatPassage(
            q.passage
          );

        card.appendChild(
          passage
        );
      }

      const questionText =
        document.createElement(
          "p"
        );

      questionText.textContent =
        q.question || "";

      card.appendChild(
        questionText
      );

      const choices =
        Array.isArray(q.choices)
          ? q.choices
          : [];

      choices.forEach(
        (
          choice,
          choiceIndex
        ) => {
          const button =
            document.createElement(
              "button"
            );

          button.className =
            "choice";

          button.type =
            "button";

          const letter =
            ["A", "B", "C", "D"][
              choiceIndex
            ];

          button.innerHTML = `
            <span class="choice-letter">
              ${letter}.
            </span>
            ${escapeHtml(choice)}
          `;

          button.addEventListener(
            "click",
            () => {
              selectAnswer(
                questionIndex,
                choiceIndex
              );
            }
          );

          card.appendChild(
            button
          );
        }
      );

      questionsDiv.appendChild(
        card
      );
    }
  );
}

/* =========================================================
   SELECT ANSWER
   ========================================================= */

function selectAnswer(
  questionIndex,
  choiceIndex
) {
  if (!gameStarted) {
    return;
  }

  if (challengeSubmitted) {
    return;
  }

  if (submissionInProgress) {
    return;
  }

  if (
    questionIndex < 0 ||
    questionIndex >=
      selectedAnswers.length
  ) {
    return;
  }

  selectedAnswers[
    questionIndex
  ] = choiceIndex;

  const card =
    questionsDiv.children[
      questionIndex
    ];

  if (!card) {
    return;
  }

  const buttons =
    card.querySelectorAll(
      ".choice"
    );

  buttons.forEach(
    button => {
      button.classList.remove(
        "selected"
      );
    }
  );

  if (
    buttons[choiceIndex]
  ) {
    buttons[choiceIndex]
      .classList.add(
        "selected"
      );
  }

  updateSubmitButton();

  sendRoomMessage({
    type:
      "answer_update",

    questionIndex
  });
}

/* =========================================================
   SUBMIT BUTTON
   ========================================================= */

function updateSubmitButton() {
  if (!submitButton) {
    return;
  }

  if (newGameMode) {
    submitButton.disabled =
      true;

    return;
  }

  const allAnswered =
    selectedAnswers.length ===
      TOTAL_QUESTIONS &&
    selectedAnswers.every(
      answer =>
        answer !== -1
    );

  submitButton.disabled =
    !allAnswered ||
    challengeSubmitted ||
    submissionInProgress ||
    !gameStarted;
}

/* =========================================================
   SUBMIT MATCH
   ========================================================= */

async function submitMatch(
  autoSubmitted = false
) {
  if (challengeSubmitted) {
    return;
  }

  if (submissionInProgress) {
    return;
  }

  if (!gameStarted) {
    return;
  }

  if (!autoSubmitted) {
    const unanswered =
      selectedAnswers.filter(
        answer =>
          answer === -1
      ).length;

    if (
      unanswered > 0
    ) {
      alert(
        `You still have ${unanswered} unanswered question${
          unanswered === 1
            ? ""
            : "s"
        }.`
      );

      return;
    }
  }

  submissionInProgress =
    true;

  if (submitButton) {
    submitButton.disabled =
      true;
  }

  stopMatchTimer();

  console.log(
    "Submitting multiplayer answers:",
    selectedAnswers
  );

  const sent =
    sendRoomMessage({
      type:
        "submit_answers",

      answers:
        selectedAnswers.map(
          (
            selected,
            questionIndex
          ) => ({
            questionIndex,
            selected
          })
        )
    });

  if (!sent) {
    submissionInProgress =
      false;

    if (submitButton) {
      submitButton.disabled =
        false;
    }

    alert(
      "Connection to match was lost."
    );

    return;
  }

  setStatus(
    autoSubmitted
      ? "Time expired. Waiting for opponent..."
      : "Answers submitted. Waiting for opponent..."
  );
}

/* =========================================================
   GAME RESULT
   ========================================================= */

async function handleGameResult(
  data
) {
  console.log(
    "MATCH RESULT RECEIVED:",
    data
  );

  gameStarted =
    false;

  challengeSubmitted =
    true;

  submissionInProgress =
    false;

  inQueue =
    false;

  playerReady =
    false;

  matchConnectionConfirmed =
    false;

  clearMatchTimer();

  const yourCorrect =
    Number(
      data.yourCorrect ?? 0
    );

  const yourTotal =
    Number(
      data.yourTotal ??
      questions.length
    );

  const yourAccuracy =
    yourTotal > 0
      ? Math.round(
          (yourCorrect /
            yourTotal) *
          100
        )
      : 0;

  let message;

  if (
    data.result === "win"
  ) {
    message =
      `You won! ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else if (
    data.result === "loss"
  ) {
    message =
      `You lost. ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else if (
    data.result === "tie"
  ) {
    message =
      `Tie! ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else {
    message =
      `Match complete: ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  }

  showResult(
    message
  );

  renderTopicPerformance(
    data
  );

  renderResults(
    data
  );

  if (
    data.statsRecorded &&
    data.statsRecorded.success ===
      false
  ) {
    console.error(
      "SERVER FAILED TO RECORD STATS:",
      data.statsRecorded
    );

    setStatus(
      "Match complete, but the server could not update your stats."
    );
  } else {
    setStatus(
      "Match complete. Refreshing stats..."
    );
  }

  await refreshPlayerStats();

  await loadRecentMatches();

  beginCooldown();
}

/* =========================================================
   RENDER ANSWER RESULTS
   ========================================================= */

function renderResults(data) {
  const questionResults =
    Array.isArray(
      data.questionResults
    )
      ? data.questionResults
      : [];

  questions.forEach(
    (q, questionIndex) => {
      const card =
        questionsDiv.children[
          questionIndex
        ];

      if (!card) {
        return;
      }

      const result =
        questionResults.find(
          item =>
            Number(
              item.questionIndex
            ) === questionIndex
        );

      if (!result) {
        return;
      }

      const selected =
        Number.isInteger(
          result.selected
        )
          ? result.selected
          : -1;

      const correctChoice =
        Number.isInteger(
          result.correctChoice
        )
          ? result.correctChoice
          : -1;

      const isCorrect =
        result.correct === true ||
        result.correct === 1 ||
        result.correct === "1";

      const oldBanner =
        card.querySelector(
          ".question-result"
        );

      if (oldBanner) {
        oldBanner.remove();
      }

      const resultBanner =
        document.createElement(
          "div"
        );

      resultBanner.className =
        `question-result ${
          isCorrect
            ? "question-result-correct"
            : "question-result-incorrect"
        }`;

      if (isCorrect) {
        resultBanner.innerHTML = `
          <strong>✓ Correct</strong>
          <span>
            You selected
            ${
              selected >= 0 &&
              selected < 4
                ? ["A", "B", "C", "D"][
                    selected
                  ] + "."
                : "No answer"
            }
          </span>
        `;
      } else {
        resultBanner.innerHTML = `
          <strong>✗ Incorrect</strong>

          <span>
            You selected:
            ${
              selected === -1
                ? "No answer"
                : ["A", "B", "C", "D"][
                    selected
                  ]
            }
          </span>

          <span>
            Correct answer:
            ${
              correctChoice >= 0 &&
              correctChoice < 4
                ? ["A", "B", "C", "D"][
                    correctChoice
                  ]
                : "Unknown"
            }
          </span>
        `;
      }

      card.insertBefore(
        resultBanner,
        card.firstChild
      );

      const buttons =
        card.querySelectorAll(
          ".choice"
        );

      buttons.forEach(
        (
          button,
          choiceIndex
        ) => {
          button.disabled =
            true;

          if (
            choiceIndex ===
            correctChoice
          ) {
            button.classList.add(
              "choice-correct"
            );
          }

          if (
            choiceIndex ===
              selected &&
            selected !==
              correctChoice
          ) {
            button.classList.add(
              "choice-incorrect"
            );
          }
        }
      );
    }
  );
}

/* =========================================================
   SEND ROOM MESSAGE
   ========================================================= */

function sendRoomMessage(
  message
) {
  if (
    !matchSocket ||
    matchSocket.readyState !==
      WebSocket.OPEN
  ) {
    console.error(
      "WebSocket is not connected."
    );

    return false;
  }

  try {
    matchSocket.send(
      JSON.stringify(
        message
      )
    );

    return true;
  } catch (error) {
    console.error(
      "Failed to send room message:",
      error
    );

    return false;
  }
}

/* =========================================================
   START / QUEUE BUTTON
   ========================================================= */

if (startMatchButton) {
  startMatchButton.addEventListener(
    "click",
    () => {

      if (isCoolingDown()) {
        updateCooldownUI();

        return;
      }

      if (!matchId) {
        if (!inQueue) {
          startMatchmaking();
        }

        return;
      }

      if (gameStarted) {
        return;
      }

      if (playerReady) {
        return;
      }

      if (!matchConnectionConfirmed) {
        setStatus(
          "Waiting for opponent to connect..."
        );

        return;
      }

      if (
        !matchSocket ||
        matchSocket.readyState !==
          WebSocket.OPEN
      ) {
        console.error(
          "Cannot start match: WebSocket is not connected."
        );

        setStatus(
          "Not connected to match room."
        );

        return;
      }

      playerReady =
        true;

      startMatchButton.disabled =
        true;

      startMatchButton.textContent =
        "Waiting for Opponent...";

      setStatus(
        "Waiting for opponent to start..."
      );

      const sent =
        sendRoomMessage({
          type:
            "start_ready"
        });

      if (!sent) {
        playerReady =
          false;

        startMatchButton.disabled =
          false;

        startMatchButton.textContent =
          "Start Match";

        setStatus(
          "Unable to start match."
        );
      }
    }
  );
}

/* =========================================================
   NEW GAME BUTTON
   ========================================================= */

if (submitButton) {
  submitButton.addEventListener(
    "click",
    () => {

      if (newGameMode) {

        if (isCoolingDown()) {
          updateCooldownUI();

          return;
        }

        newGameMode =
          false;

        submitButton.style.display =
          "none";

        submitButton.disabled =
          true;

        matchId = null;
        opponent = null;
        playerReady = false;
        matchConnectionConfirmed =
          false;

        enableQueueButton();

        return;
      }

      submitMatch(false);
    }
  );
}

/* =========================================================
   INITIAL STATE
   ========================================================= */

if (startMatchButton) {
  startMatchButton.disabled =
    false;

  startMatchButton.textContent =
    "Join Queue";
}

if (submitButton) {
  submitButton.style.display =
    "none";

  submitButton.disabled =
    true;
}

if (timerDiv) {
  timerDiv.textContent =
    "13:00";
}

setStatus(
  "Ready to join queue."
);

/* =========================================================
   LOAD HISTORY
   ========================================================= */

loadRecentMatches();

/* =========================================================
   INITIALIZE COOLDOWN
   ========================================================= */

initializeCooldown();