import {
  createDisconnectManager
} from "./match-disconnect.js";

import {
  createReconnectManager
} from "./match-reconnect.js";

/* =========================================================
   API
   ========================================================= */

export const API = "http://127.0.0.1:8787";

export const AUTH_API =
  "https://auth.scoreladder.org";

export const RESUME_MATCH_STORAGE_KEY =
  "scoreladder_multiplayer_resume_match";

export const ACTIVE_MATCH_STATE_STORAGE_KEY =
  "scoreladder_multiplayer_active_match_state";


/* =========================================================
   CONSTANTS
   ========================================================= */

export const TOTAL_QUESTIONS = 11;

export const MATCH_DURATION_MS =
  13 * 60 * 1000;

export const COOLDOWN_DURATION_MS =
  15 * 60 * 1000;

export const COOLDOWN_STORAGE_KEY =
  "scoreladder_multiplayer_cooldown_until";

export const KHAN_ACADEMY_SAT_URL =
  "https://www.khanacademy.org/test-prep/sat";


/* =========================================================
   ELEMENTS
   ========================================================= */

export const elements = {
  startMatchButton:
    document.getElementById("startMatchButton"),

  statusDiv:
    document.getElementById("status"),

  timerDiv:
    document.getElementById("timer"),

  questionsDiv:
    document.getElementById("questions"),

  submitButton:
    document.getElementById("submitButton"),

  resultDiv:
    document.getElementById("result"),

  playerNameDiv:
    document.getElementById("playerName"),

  playerEloDiv:
    document.getElementById("playerElo"),

  opponentNameDiv:
    document.getElementById("opponentName"),

  opponentEloDiv:
    document.getElementById("opponentElo")
};


/* =========================================================
   SHARED STATE
   ========================================================= */

export const state = {
  playerId: null,

  reconnecting: false,

  matchId: null,

  opponent: null,

  checkingMatch: false,

  matchSocket: null,

  inQueue: false,

  gameStarted: false,

  playerReady: false,

  matchConnectionConfirmed: false,

  challengeSubmitted: false,

  submissionInProgress: false,

  questions: [],

  selectedAnswers: [],

  timerInterval: null,

  challengeDeadline: 0,

  timeRemaining: 0,

  cooldownUntil: 0,

  cooldownInterval: null,

  newGameMode: false,

  /* Resume state */
  resumeAvailable: false,

  resumeMatchId: null,

  /*
   * Prevent duplicate resume attempts while reconnecting.
   */
  resumeInProgress: false
};


/* =========================================================
   TOPICS
   ========================================================= */

export const TOPIC_ALIASES = {
  central_idea:
    "central_ideas",

  central_ideas:
    "central_ideas",

  text_evidence:
    "command_evidence_textual",

  textual_evidence:
    "command_evidence_textual",

  command_evidence_textual:
    "command_evidence_textual",

  quantitative_evidence:
    "command_evidence_quantitative",

  command_evidence_quantitative:
    "command_evidence_quantitative",

  inference:
    "inferences",

  inferences:
    "inferences",

  word_in_context:
    "words_in_context",

  words_in_context:
    "words_in_context",

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

  transition:
    "transitions",

  transitions:
    "transitions",

  boundary:
    "boundaries",

  boundaries:
    "boundaries",

  form_structure_sense:
    "form_structure_sense"
};

export const TOPIC_DISPLAY_NAMES = {
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

export function normalizeTopic(topic) {
  if (typeof topic !== "string") {
    return null;
  }

  const normalized =
    topic.trim().toLowerCase();

  return (
    TOPIC_ALIASES[normalized] ??
    null
  );
}

export function getTopicDisplayName(topic) {
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

export function setStatus(message) {
  if (elements.statusDiv) {
    elements.statusDiv.textContent =
      message;
  }
}

export function showResult(message) {
  if (elements.resultDiv) {
    elements.resultDiv.textContent =
      message;
  }
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatPassage(text) {
  if (typeof text !== "string") {
    return "";
  }

  return escapeHtml(text)
    .replace(
      /\[\/\*UNDERLINED\*\/\](.*?)\[\/\*UNDERLINED\*\/\]/gs,
      "<u>$1</u>"
    )
    .replace(
      /\[\/\*UNDERLINED\*\/\](.*?)\[\/\*UNDERLINED\*\/\]/gs,
      "<u>$1</u>"
    )
    .replace(/\n/g, "<br>");
}


/* =========================================================
   SESSION
   ========================================================= */

export function getSessionId() {
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
   AUTH API URL HELPER
   ========================================================= */

export function getAuthApiUrl(path) {
  const base =
    AUTH_API.replace(/\/+$/, "");

  const cleanPath =
    String(path).replace(/^\/+/, "");

  return `${base}/${cleanPath}`;
}


/* =========================================================
   COOLDOWN
   ========================================================= */

export function getStoredCooldownUntil() {
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

export function saveCooldownUntil(timestamp) {
  state.cooldownUntil =
    timestamp;

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

export function clearCooldown() {
  state.cooldownUntil = 0;

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

export function getCooldownRemainingMs() {
  if (!state.cooldownUntil) {
    return 0;
  }

  return Math.max(
    0,
    state.cooldownUntil - Date.now()
  );
}

export function isCoolingDown() {
  return (
    getCooldownRemainingMs() > 0
  );
}

export function formatCountdown(totalSeconds) {
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
   ACTIVE MATCH PERSISTENCE
   ========================================================= */

export function getStoredActiveMatchState() {
  try {
    const raw =
      localStorage.getItem(
        ACTIVE_MATCH_STATE_STORAGE_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      localStorage.removeItem(
        ACTIVE_MATCH_STATE_STORAGE_KEY
      );

      return null;
    }

    if (
      typeof parsed.matchId !== "string" ||
      parsed.matchId.length === 0
    ) {
      localStorage.removeItem(
        ACTIVE_MATCH_STATE_STORAGE_KEY
      );

      return null;
    }

    return parsed;
  } catch (error) {
    console.error(
      "Failed to read active match state:",
      error
    );

    return null;
  }
}

function isLogicalMatchId(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

export function saveActiveMatchState() {
  if (
    !isLogicalMatchId(state.matchId)
  ) {
    console.warn(
      "Refusing to persist invalid logical matchId:",
      state.matchId
    );

    return false;
  }

  const activeMatchState = {
    matchId:
      state.matchId,

    playerId:
      state.playerId,

    opponent:
      state.opponent || null,

    questions:
      Array.isArray(state.questions)
        ? state.questions
        : [],

    selectedAnswers:
      Array.isArray(state.selectedAnswers)
        ? [...state.selectedAnswers]
        : [],

    challengeDeadline:
      Number(state.challengeDeadline) || 0,

    timeRemaining:
      Number(state.timeRemaining) || 0,

    gameStarted:
      state.gameStarted === true,

    playerReady:
      state.playerReady === true,

    matchConnectionConfirmed:
      state.matchConnectionConfirmed === true,

    challengeSubmitted:
      state.challengeSubmitted === true,

    savedAt:
      Date.now()
  };

  try {
    localStorage.setItem(
      ACTIVE_MATCH_STATE_STORAGE_KEY,
      JSON.stringify(
        activeMatchState
      )
    );

    localStorage.setItem(
      RESUME_MATCH_STORAGE_KEY,
      state.matchId
    );

    state.resumeAvailable =
      true;

    state.resumeMatchId =
      state.matchId;

    return true;
  } catch (error) {
    console.error(
      "Failed to save active match state:",
      error
    );

    return false;
  }
}

export function restoreActiveMatchState() {
  const saved =
    getStoredActiveMatchState();

  const storedResumeMatchId =
    getStoredResumeMatchId();

  const isUuid =
    value =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim()
      );

  const logicalMatchId =
    isUuid(storedResumeMatchId)
      ? storedResumeMatchId.trim()
      : isUuid(saved?.matchId)
        ? saved.matchId.trim()
        : null;

  if (!logicalMatchId) {
    return false;
  }

  state.matchId =
    logicalMatchId;

  state.playerId =
    saved?.playerId ??
    state.playerId ??
    null;

  state.opponent =
    saved?.opponent ??
    null;

  state.questions =
    Array.isArray(
      saved?.questions
    )
      ? saved.questions
      : [];

  state.selectedAnswers =
    Array.isArray(
      saved?.selectedAnswers
    )
      ? saved.selectedAnswers
      : [];

  state.challengeDeadline =
    Number(
      saved?.challengeDeadline
    ) || 0;

  state.timeRemaining =
    Number(
      saved?.timeRemaining
    ) || 0;

  state.gameStarted =
    saved?.gameStarted === true;

  state.playerReady =
    saved?.playerReady === true;

  state.matchConnectionConfirmed =
    false;

  state.challengeSubmitted =
    saved?.challengeSubmitted === true;

  state.submissionInProgress =
    false;

  state.checkingMatch =
    false;

  state.inQueue =
    false;

  state.resumeAvailable =
    true;

  state.resumeMatchId =
    logicalMatchId;

  state.resumeInProgress =
    false;

  state.reconnecting =
    false;

  if (state.opponent) {
    updateOpponent(
      state.opponent
    );
  }

  if (
    saved &&
    saved.matchId !==
      logicalMatchId
  ) {
    try {
      const repairedState = {
        ...saved,

        matchId:
          logicalMatchId,

        playerId:
          state.playerId,

        opponent:
          state.opponent,

        questions:
          state.questions,

        selectedAnswers:
          state.selectedAnswers,

        challengeDeadline:
          state.challengeDeadline,

        timeRemaining:
          state.timeRemaining,

        gameStarted:
          state.gameStarted,

        playerReady:
          state.playerReady,

        challengeSubmitted:
          state.challengeSubmitted,

        savedAt:
          Date.now()
      };

      localStorage.setItem(
        ACTIVE_MATCH_STATE_STORAGE_KEY,
        JSON.stringify(
          repairedState
        )
      );
    } catch (error) {
      console.error(
        "Failed to repair active match state:",
        error
      );
    }
  }

  try {
    localStorage.setItem(
      RESUME_MATCH_STORAGE_KEY,
      logicalMatchId
    );
  } catch (error) {
    console.error(
      "Failed to repair resume match key:",
      error
    );
  }

  console.log(
    "Restored logical match state:",
    {
      matchId:
        state.matchId,

      playerId:
        state.playerId,

      resumeMatchId:
        state.resumeMatchId
    }
  );

  return true;
}

export function clearActiveMatchState() {
  try {
    localStorage.removeItem(
      ACTIVE_MATCH_STATE_STORAGE_KEY
    );
  } catch (error) {
    console.error(
      "Failed to clear active match state:",
      error
    );
  }

  clearResumeMatch();
}

export function updatePersistedSelectedAnswers(
  selectedAnswers
) {
  if (
    !Array.isArray(selectedAnswers)
  ) {
    return;
  }

  state.selectedAnswers =
    [...selectedAnswers];

  saveActiveMatchState();
}

export function persistCurrentMatchState() {
  return saveActiveMatchState();
}


/* =========================================================
   COOLDOWN UI
   ========================================================= */

export function updateCooldownUI() {
  const remainingMs =
    getCooldownRemainingMs();

  if (remainingMs <= 0) {
    clearCooldown();

    if (
      !state.gameStarted &&
      !state.inQueue
    ) {
      if (isResumeAvailable()) {
        enableResumeGame();
      } else {
        enableQueueButton();
      }
    }

    return;
  }

  const remainingSeconds =
    Math.ceil(
      remainingMs / 1000
    );

  if (elements.startMatchButton) {
    elements.startMatchButton.disabled =
      true;

    elements.startMatchButton.textContent =
      `Cooldown: ${formatCountdown(
        remainingSeconds
      )}`;
  }

  if (
    elements.submitButton &&
    state.newGameMode
  ) {
    elements.submitButton.style.display =
      "block";

    elements.submitButton.disabled =
      true;

    elements.submitButton.textContent =
      `New Game (${formatCountdown(
        remainingSeconds
      )})`;
  }

  if (
    !state.gameStarted &&
    !state.inQueue
  ) {
    setStatus(
      `You can play again in ${formatCountdown(
        remainingSeconds
      )}.`
    );
  }
}

export function startCooldownTimer() {
  stopCooldownTimer();

  updateCooldownUI();

  state.cooldownInterval =
    setInterval(() => {
      updateCooldownUI();

      if (
        getCooldownRemainingMs() <=
        0
      ) {
        stopCooldownTimer();
      }
    }, 250);
}

export function stopCooldownTimer() {
  if (state.cooldownInterval) {
    clearInterval(
      state.cooldownInterval
    );

    state.cooldownInterval =
      null;
  }
}

export function beginCooldown() {
  state.gameStarted = false;

  state.inQueue = false;

  state.playerReady = false;

  state.matchConnectionConfirmed =
    false;

  state.resumeInProgress =
    false;

  state.reconnecting =
    false;

  clearMatchTimer();

  clearActiveMatchState();

  state.matchId = null;

  state.opponent = null;

  state.questions = [];

  state.selectedAnswers = [];

  const until =
    Date.now() +
    COOLDOWN_DURATION_MS;

  saveCooldownUntil(until);

  state.newGameMode = true;

  if (elements.submitButton) {
    elements.submitButton.style.display =
      "block";

    elements.submitButton.disabled =
      true;

    elements.submitButton.textContent =
      `New Game (${formatCountdown(
        Math.ceil(
          COOLDOWN_DURATION_MS /
            1000
        )
      )})`;
  }

  if (elements.startMatchButton) {
    elements.startMatchButton.disabled =
      true;

    elements.startMatchButton.textContent =
      `Cooldown: ${formatCountdown(
        Math.ceil(
          COOLDOWN_DURATION_MS /
            1000
        )
      )}`;
  }

  if (elements.timerDiv) {
    elements.timerDiv.textContent =
      "0:00";
  }

  setStatus(
    "Match complete. Practice your weakest topics while you wait."
  );

  renderCooldownPracticeMessage();

  startCooldownTimer();
}

export function enableQueueButton() {
  if (!elements.startMatchButton) {
    return;
  }

  if (
    state.gameStarted ||
    state.inQueue
  ) {
    return;
  }

  if (isResumeAvailable()) {
    enableResumeGame();
    return;
  }

  elements.startMatchButton.disabled =
    false;

  elements.startMatchButton.removeAttribute(
    "disabled"
  );

  elements.startMatchButton.style.display =
    "block";

  elements.startMatchButton.textContent =
    "Join Queue";

  if (
    elements.submitButton &&
    state.newGameMode
  ) {
    elements.submitButton.style.display =
      "none";

    elements.submitButton.disabled =
      true;
  }

  setStatus(
    "Cooldown complete. You can join the queue."
  );

  renderCooldownCompleteMessage();
}

export function initializeCooldown() {
  state.cooldownUntil =
    getStoredCooldownUntil();

  if (isResumeAvailable()) {
    state.newGameMode =
      false;

    stopCooldownTimer();

    if (elements.submitButton) {
      elements.submitButton.style.display =
        "none";

      elements.submitButton.disabled =
        true;
    }

    enableResumeGame(
      state.resumeMatchId ||
      state.matchId
    );

    return;
  }

  if (isCoolingDown()) {
    state.newGameMode =
      true;

    if (elements.submitButton) {
      elements.submitButton.style.display =
        "block";

      elements.submitButton.disabled =
        true;

      elements.submitButton.textContent =
        `New Game (${formatCountdown(
          Math.ceil(
            getCooldownRemainingMs() /
              1000
          )
        )})`;
    }

    if (elements.startMatchButton) {
      elements.startMatchButton.disabled =
        true;

      elements.startMatchButton.textContent =
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
    !state.gameStarted &&
    !state.inQueue
  ) {
    enableQueueButton();
  }
}


/* =========================================================
   TOP 3 WEAK TOPICS
   ========================================================= */

function getTopThreeWeakTopics() {
  const topicStats = {};

  const historicalTopics =
    Array.isArray(
      window.scoreladderHistoricalTopics
    )
      ? window.scoreladderHistoricalTopics
      : [];

  for (
    const entry of historicalTopics
  ) {
    if (
      !Array.isArray(entry) ||
      entry.length < 2
    ) {
      continue;
    }

    const topic =
      normalizeTopic(entry[0]);

    const stats =
      entry[1];

    if (
      !topic ||
      !stats ||
      typeof stats !== "object"
    ) {
      continue;
    }

    const total =
      Number(
        stats.total ??
        stats.questions_answered ??
        stats.questionsAnswered ??
        0
      );

    const correct =
      Number(
        stats.correct ??
        stats.questions_correct ??
        stats.questionsCorrect ??
        0
      );

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      continue;
    }

    topicStats[topic] = {
      correct: Math.max(
        0,
        correct
      ),

      total: Math.max(
        0,
        total
      )
    };
  }

  if (
    Object.keys(topicStats).length === 0
  ) {
    const matches =
      Array.isArray(
        window.scoreladderRecentMatches
      )
        ? window.scoreladderRecentMatches
        : [];

    for (
      const match of matches
    ) {
      const questionResults =
        extractQuestionResults(
          match
        );

      for (
        const result of
          questionResults
      ) {
        const topic =
          extractResultTopic(
            result
          );

        if (!topic) {
          continue;
        }

        if (
          !topicStats[topic]
        ) {
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
  }

  return Object.entries(
    topicStats
  )
    .filter(
      ([, stats]) =>
        stats.total > 0
    )
    .sort(
      ([topicA, a], [topicB, b]) => {
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

        if (
          a.total !==
          b.total
        ) {
          return (
            b.total -
            a.total
          );
        }

        return topicA.localeCompare(
          topicB
        );
      }
    )
    .slice(0, 3);
}


/* =========================================================
   COOLDOWN PRACTICE
   ========================================================= */

export function renderCooldownPracticeMessage() {
  if (!elements.resultDiv) {
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
        elements.resultDiv.querySelector(
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
    "Topics You Should Practice";

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
      "Your topic performance will appear here after you answer some questions.";

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

  elements.resultDiv.appendChild(
    container
  );
}

export function renderCooldownCompleteMessage() {
  if (!elements.resultDiv) {
    return;
  }

  const old =
    elements.resultDiv.querySelector(
      ".cooldown-practice"
    );

  if (old) {
    old.remove();
  }
}


/* =========================================================
   PLAYER INFORMATION
   ========================================================= */

export function updatePlayer(player) {
  if (!player) {
    return;
  }

  if (elements.playerNameDiv) {
    elements.playerNameDiv.textContent =
      player.display_name ||
      player.username ||
      "You";
  }

  const elo =
    player.stats?.rw_elo ??
    player.rw_elo ??
    player.stats?.elo ??
    player.elo ??
    1200;

  if (elements.playerEloDiv) {
    elements.playerEloDiv.textContent =
      elo;
  }
}

export function updateOpponent(player) {
  if (!player) {
    return;
  }

  state.opponent =
    player;

  if (elements.opponentNameDiv) {
    elements.opponentNameDiv.textContent =
      player.display_name ||
      player.username ||
      "Opponent";
  }

  const elo =
    player.stats?.rw_elo ??
    player.rw_elo ??
    player.stats?.elo ??
    player.elo ??
    1200;

  if (elements.opponentEloDiv) {
    elements.opponentEloDiv.textContent =
      elo;
  }

  if (state.matchId) {
    saveActiveMatchState();
  }
}


/* =========================================================
   PLAYER STATS
   ========================================================= */

export async function refreshPlayerStats() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    return null;
  }

  try {
    const response =
      await fetch(
        `${getAuthApiUrl(
          "me"
        )}?session=${encodeURIComponent(
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

    if (
      player.id !== undefined &&
      player.id !== null
    ) {
      state.playerId =
        String(player.id);
    }

    if (state.matchId) {
      saveActiveMatchState();
    }

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
   MATCH HISTORY HELPERS
   ========================================================= */

export function extractQuestionResults(match) {
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

export function extractResultTopic(result) {
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
   TOPIC PERFORMANCE
   ========================================================= */

export function appendTopicRow(
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
          (correct / total) * 100
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

export function renderTopicStatsIntoContainer(
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
  );

  const weakestTopics =
    topics.slice(0, 3);

  if (
    weakestTopics.length > 0
  ) {
    const weakHeading =
      document.createElement("h4");

    weakHeading.textContent =
      "Top 3 Topics to Practice";

    container.appendChild(
      weakHeading
    );

    weakestTopics.forEach(
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
}

export function renderHistoricalTopicPerformance(
  matches
) {
  if (!elements.resultDiv) {
    return;
  }

  const oldPerformance =
    elements.resultDiv.querySelector(
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
      const result of
        questionResults
    ) {
      const topic =
        extractResultTopic(
          result
        );

      if (!topic) {
        continue;
      }

      if (
        !topicStats[topic]
      ) {
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
    Object.entries(topicStats);

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

    elements.resultDiv.appendChild(
      container
    );

    return;
  }

  renderTopicStatsIntoContainer(
    container,
    topics
  );

  elements.resultDiv.appendChild(
    container
  );
}

export function renderHistoricalTopicStats(
  topics
) {
  if (!elements.resultDiv) {
    return;
  }

  const old =
    elements.resultDiv.querySelector(
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
    "Based on your accumulated question-level performance.";

  container.appendChild(
    description
  );

  window.scoreladderHistoricalTopics =
    [...topics];

  renderTopicStatsIntoContainer(
    container,
    topics
  );

  elements.resultDiv.appendChild(
    container
  );

  if (isCoolingDown()) {
    renderCooldownPracticeMessage();
  }
}

export function renderNoHistoricalTopicData(
  reason =
    "Topic performance will appear after enough question-level match data is available."
) {
  if (!elements.resultDiv) {
    return;
  }

  const old =
    elements.resultDiv.querySelector(
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

  elements.resultDiv.appendChild(
    container
  );
}


/* =========================================================
   RECENT MATCH DISPLAY
   ========================================================= */

export function renderRecentMatches(
  matches
) {
  if (!elements.resultDiv) {
    return;
  }

  const oldHistory =
    elements.resultDiv.querySelector(
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

    elements.resultDiv.appendChild(
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
        match.opponent_username ||
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
          : total > 0
            ? Math.round(
                (correct / total) *
                  100
              )
            : 0;

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

  elements.resultDiv.appendChild(
    container
  );
}


/* =========================================================
   LOAD HISTORICAL TOPIC PERFORMANCE
   ========================================================= */

export async function loadHistoricalTopicPerformance() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    renderNoHistoricalTopicData(
      "No active session was found."
    );

    return;
  }

  try {
    const url =
      `${getAuthApiUrl(
        "topic-performance"
      )}?session=${encodeURIComponent(
        sessionId
      )}`;

    console.log(
      "Loading historical topic performance:",
      url
    );

    const response =
      await fetch(url);

    let data = {};

    try {
      data =
        await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        `Topic performance request failed (${response.status})`
      );
    }

    let topics = null;

    if (
      Array.isArray(data.topics)
    ) {
      topics =
        data.topics;
    } else if (
      data.topicPerformance &&
      typeof data.topicPerformance ===
        "object"
    ) {
      topics =
        data.topicPerformance;
    } else if (
      data.topic_performance &&
      typeof data.topic_performance ===
        "object"
    ) {
      topics =
        data.topic_performance;
    } else if (
      data.performance &&
      typeof data.performance ===
        "object"
    ) {
      topics =
        data.performance;
    }

    if (
      topics &&
      !Array.isArray(topics)
    ) {
      topics =
        Object.entries(topics);
    }

    if (
      !Array.isArray(topics)
    ) {
      renderNoHistoricalTopicData(
        "No question-level topic data is available yet."
      );

      return;
    }

    const normalizedTopics = [];

    for (
      const entry of topics
    ) {
      if (
        Array.isArray(entry) &&
        entry.length >= 2
      ) {
        const topic =
          normalizeTopic(
            entry[0]
          );

        if (!topic) {
          continue;
        }

        const stats =
          entry[1];

        if (
          !stats ||
          typeof stats !== "object"
        ) {
          continue;
        }

        normalizedTopics.push([
          topic,
          {
            correct:
              Number(
                stats.correct ??
                stats.questions_correct ??
                stats.questionsCorrect ??
                0
              ),

            total:
              Number(
                stats.total ??
                stats.questions_answered ??
                stats.questionsAnswered ??
                0
              )
          }
        ]);

        continue;
      }

      if (
        entry &&
        typeof entry === "object"
      ) {
        const topic =
          normalizeTopic(
            entry.topic ??
            entry.question_type ??
            entry.questionType ??
            entry.type
          );

        if (!topic) {
          continue;
        }

        normalizedTopics.push([
          topic,
          {
            correct:
              Number(
                entry.correct ??
                entry.questions_correct ??
                entry.questionsCorrect ??
                0
              ),

            total:
              Number(
                entry.total ??
                entry.questions_answered ??
                entry.questionsAnswered ??
                0
              )
          }
        ]);
      }
    }

    if (
      normalizedTopics.length === 0
    ) {
      renderNoHistoricalTopicData(
        "No question-level topic data is available yet."
      );

      return;
    }

    console.log(
      "Loaded historical topic performance:",
      normalizedTopics
    );

    window.scoreladderHistoricalTopics =
      normalizedTopics;

    renderHistoricalTopicStats(
      normalizedTopics
    );
  } catch (error) {
    console.error(
      "Failed to load historical topic performance:",
      error
    );

    renderNoHistoricalTopicData(
      "Unable to load historical topic performance."
    );
  }
}


/* =========================================================
   LOAD RECENT MATCHES
   ========================================================= */

export async function loadRecentMatches() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    console.warn(
      "Cannot load recent matches: no session ID."
    );

    return;
  }

  try {
    const url =
      `${getAuthApiUrl(
        "match-history"
      )}?session=${encodeURIComponent(
        sessionId
      )}&limit=5`;

    console.log(
      "Loading recent matches:",
      url
    );

    const response =
      await fetch(url);

    let data = {};

    try {
      data =
        await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        `Match history request failed (${response.status})`
      );
    }

    const matches =
      Array.isArray(data.matches)
        ? data.matches.slice(0, 5)
        : [];

    console.log(
      "Loaded recent matches:",
      matches
    );

    window.scoreladderRecentMatches =
      matches;

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
    }

    await loadHistoricalTopicPerformance();

    if (isCoolingDown()) {
      renderCooldownPracticeMessage();
    }
  } catch (error) {
    console.error(
      "Failed to load recent matches:",
      error
    );

    window.scoreladderRecentMatches =
      [];

    renderRecentMatches([]);

    await loadHistoricalTopicPerformance();
  }
}


/* =========================================================
   MATCH TIMER HELPERS
   ========================================================= */

export function stopMatchTimer() {
  if (state.timerInterval) {
    clearInterval(
      state.timerInterval
    );

    state.timerInterval =
      null;
  }
}

export function clearMatchTimer() {
  stopMatchTimer();

  state.challengeDeadline =
    0;

  state.timeRemaining =
    0;
}


/* =========================================================
   RESUME UI / PERSISTENCE
   ========================================================= */

export function saveResumeMatch(matchId) {
  if (
    typeof matchId !== "string" ||
    matchId.length === 0
  ) {
    return;
  }

  state.resumeAvailable =
    true;

  state.resumeMatchId =
    matchId;

  try {
    localStorage.setItem(
      RESUME_MATCH_STORAGE_KEY,
      matchId
    );
  } catch (error) {
    console.error(
      "Failed to save resume match:",
      error
    );
  }
}

export function getStoredResumeMatchId() {
  try {
    const matchId =
      localStorage.getItem(
        RESUME_MATCH_STORAGE_KEY
      );

    if (
      typeof matchId !== "string" ||
      matchId.length === 0
    ) {
      return null;
    }

    return matchId;
  } catch (error) {
    console.error(
      "Failed to read resume match:",
      error
    );

    return null;
  }
}

export function clearResumeMatch() {
  state.resumeAvailable =
    false;

  state.resumeMatchId =
    null;

  state.resumeInProgress =
    false;

  state.reconnecting =
    false;

  try {
    localStorage.removeItem(
      RESUME_MATCH_STORAGE_KEY
    );
  } catch (error) {
    console.error(
      "Failed to clear resume match:",
      error
    );
  }
}

export function enableResumeGame(
  matchId = state.matchId
) {
  if (!matchId) {
    matchId =
      getStoredResumeMatchId();
  }

  if (!matchId) {
    return false;
  }

  state.resumeAvailable =
    true;

  state.resumeMatchId =
    String(matchId);

  state.matchId =
    String(matchId);

  if (!elements.startMatchButton) {
    return true;
  }

  elements.startMatchButton.disabled =
    false;

  elements.startMatchButton.removeAttribute(
    "disabled"
  );

  elements.startMatchButton.style.display =
    "block";

  elements.startMatchButton.textContent =
    "Resume Game";

  setStatus(
    "You were disconnected from your match. Resume the game to reconnect."
  );

  return true;
}

export function disableResumeGame() {
  clearActiveMatchState();

  if (!elements.startMatchButton) {
    return;
  }

  if (
    state.gameStarted ||
    state.inQueue ||
    isCoolingDown()
  ) {
    return;
  }

  elements.startMatchButton.disabled =
    false;

  elements.startMatchButton.textContent =
    "Join Queue";
}

export function isResumeAvailable() {
  const activeState =
    getStoredActiveMatchState();

  if (
    activeState &&
    isLogicalMatchId(
      activeState.matchId
    )
  ) {
    state.resumeAvailable =
      true;

    state.resumeMatchId =
      activeState.matchId;

    return true;
  }

  const storedMatchId =
    getStoredResumeMatchId();

  if (
    isLogicalMatchId(
      storedMatchId
    )
  ) {
    state.resumeAvailable =
      true;

    state.resumeMatchId =
      storedMatchId;

    return true;
  }

  return (
    state.resumeAvailable === true &&
    isLogicalMatchId(
      state.resumeMatchId
    )
  );
}

export function initializeResumeGame() {
  const restored =
    restoreActiveMatchState();

  if (restored) {
    console.log(
      "Restored active match state:",
      {
        matchId:
          state.matchId,

        playerId:
          state.playerId,

        selectedAnswers:
          state.selectedAnswers,

        questionCount:
          state.questions.length,

        challengeDeadline:
          state.challengeDeadline,

        gameStarted:
          state.gameStarted
      }
    );
  }

  const matchId =
    state.matchId ||
    getStoredResumeMatchId();

  if (
    !isLogicalMatchId(
      matchId
    )
  ) {
    state.resumeAvailable =
      false;

    state.resumeMatchId =
      null;

    return false;
  }

  state.resumeAvailable =
    true;

  state.resumeMatchId =
    String(matchId);

  state.matchId =
    String(matchId);

  state.matchConnectionConfirmed =
    false;

  state.inQueue =
    false;

  state.reconnecting =
    false;

  if (
    elements.startMatchButton &&
    !state.gameStarted &&
    !state.inQueue &&
    !isCoolingDown()
  ) {
    enableResumeGame(
      state.matchId
    );
  }

  return true;
}


/* =========================================================
   RENDER QUESTIONS
   ========================================================= */

function renderQuestions() {
  if (!elements.questionsDiv) {
    return;
  }

  elements.questionsDiv.innerHTML = "";

  state.questions.forEach(
    (q, questionIndex) => {
      const card =
        document.createElement("div");

      card.className =
        "card";

      const number =
        document.createElement("div");

      number.className =
        "question-number";

      number.textContent =
        `Question ${questionIndex + 1}`;

      card.appendChild(
        number
      );

      const meta =
        document.createElement("div");

      meta.className =
        "meta";

      meta.textContent =
        `${q.topic || q.originalTopic || ""}` +
        `${
          q.difficulty
            ? " • " + q.difficulty
            : ""
        }`;

      card.appendChild(
        meta
      );

      if (q.passage) {
        const passage =
          document.createElement("div");

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
        document.createElement("p");

      questionText.textContent =
        q.question || "";

      card.appendChild(
        questionText
      );

      const choices =
        Array.isArray(q.choices)
          ? q.choices
          : Object.values(
              q.choices || {}
            );

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
            [
              "A",
              "B",
              "C",
              "D"
            ][choiceIndex] || "?";

          const text =
            typeof choice ===
            "object"
              ? (
                  choice.text ??
                  choice.value ??
                  ""
                )
              : choice;

          button.innerHTML = `
            <span class="choice-letter">
              ${letter}.
            </span>
            ${escapeHtml(text)}
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

      elements.questionsDiv.appendChild(
        card
      );
    }
  );
}

function restoreSelectedAnswerUI() {
  if (!elements.questionsDiv) {
    return;
  }

  state.selectedAnswers.forEach(
    (choiceIndex, questionIndex) => {
      if (
        !Number.isInteger(choiceIndex) ||
        choiceIndex < 0
      ) {
        return;
      }

      const card =
        elements.questionsDiv.children[
          questionIndex
        ];

      const buttons =
        card?.querySelectorAll(
          ".choice"
        );

      if (
        buttons?.[choiceIndex]
      ) {
        buttons[
          choiceIndex
        ].classList.add(
          "selected"
        );
      }
    }
  );
}

function updateSubmitButton() {
  if (!elements.submitButton) {
    return;
  }

  if (
    !state.gameStarted ||
    state.newGameMode
  ) {
    elements.submitButton.disabled =
      true;

    return;
  }

  if (
    state.challengeSubmitted ||
    state.submissionInProgress
  ) {
    elements.submitButton.disabled =
      true;

    return;
  }

  const allAnswered =
    Array.isArray(
      state.selectedAnswers
    ) &&
    state.selectedAnswers.length ===
      state.questions.length &&
    state.selectedAnswers.every(
      answer =>
        Number.isInteger(answer) &&
        answer >= 0
    );

  elements.submitButton.disabled =
    !allAnswered;
}


/* =========================================================
   MATCH CONNECTION MODULES
   ========================================================= */

/*
 * These managers contain all WebSocket/disconnect logic.
 *
 * The gameplay functions are injected rather than imported
 * back into these modules, which prevents circular imports.
 *
 * NOTE:
 * If your main gameplay functions are declared later in
 * this file, move this initialization block to immediately
 * AFTER those function declarations.
 */

const disconnectManager =
  createDisconnectManager({
    state,

    saveActiveMatchState,

    enableResumeGame,

    setStatus
  });

const reconnectManager =
  createReconnectManager({
    API,

    TOTAL_QUESTIONS,

    MATCH_DURATION_MS,

    state,

    elements,

    setStatus,

    saveActiveMatchState,

    getStoredActiveMatchState,

    getStoredResumeMatchId,

    clearActiveMatchState,

    enableResumeGame,

    enableQueueButton,

    updateOpponent,

    refreshPlayerStats,

    renderQuestions,

    restoreSelectedAnswerUI,

    updateSubmitButton,

    /*
     * These gameplay functions must exist in the
     * remainder of your normal gameplay code.
     */
    startGame:
      typeof startGame ===
      "function"
        ? startGame
        : null,

    startMatchTimer:
      typeof startMatchTimer ===
      "function"
        ? startMatchTimer
        : null,

    handleGameResult:
      typeof handleGameResult ===
      "function"
        ? handleGameResult
        : null,

    disconnectManager
  });

const {
  sendRoomMessage,
  connectToRoom,
  resumeExistingMatch,
  onMatchFound
} = reconnectManager;

disconnectManager.installPageLifecycleHandlers();


/* =========================================================
   START / RESUME BUTTON HANDLER
   ========================================================= */

function handleStartMatchButtonClick(
  event
) {
  if (!elements.startMatchButton) {
    return;
  }

  if (
    isResumeAvailable() &&
    elements.startMatchButton.textContent.trim() ===
      "Resume Game"
  ) {
    event.preventDefault();

    event.stopImmediatePropagation();

    resumeExistingMatch();

    return;
  }
}

if (elements.startMatchButton) {
  elements.startMatchButton.addEventListener(
    "click",
    handleStartMatchButtonClick,
    true
  );
}


/* =========================================================
   INITIAL SHARED UI
   ========================================================= */

if (elements.startMatchButton) {
  elements.startMatchButton.disabled =
    false;

  if (isResumeAvailable()) {
    elements.startMatchButton.textContent =
      "Resume Game";

    setStatus(
      "You were disconnected from your match. Resume the game to reconnect."
    );
  } else {
    elements.startMatchButton.textContent =
      "Join Queue";
  }
}

if (elements.submitButton) {
  elements.submitButton.style.display =
    "none";

  elements.submitButton.disabled =
    true;
}

if (elements.timerDiv) {
  elements.timerDiv.textContent =
    "13:00";
}

setStatus(
  isResumeAvailable()
    ? "You were disconnected from your match. Resume the game to reconnect."
    : "Ready to join queue."
);


/* =========================================================
   INITIAL LOAD
   ========================================================= */

window.scoreladderRecentMatches =
  Array.isArray(
    window.scoreladderRecentMatches
  )
    ? window.scoreladderRecentMatches
    : [];

window.scoreladderHistoricalTopics =
  Array.isArray(
    window.scoreladderHistoricalTopics
  )
    ? window.scoreladderHistoricalTopics
    : [];

initializeResumeGame();

initializeCooldown();

if (
  isResumeAvailable() &&
  !state.gameStarted &&
  !state.inQueue
) {
  enableResumeGame(
    state.resumeMatchId ||
    state.matchId
  );
}

loadRecentMatches();

refreshPlayerStats();