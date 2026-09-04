/*
 * =========================================================
 * MATCH UI
 * =========================================================
 *
 * Owns:
 *
 * - DOM elements
 * - Status/result text
 * - Player/opponent rendering
 * - Cooldown UI
 * - Match history rendering
 * - Topic-performance rendering
 * - Resume/queue button presentation
 *
 * =========================================================
 */

import {
  state,
  TOTAL_QUESTIONS,
  KHAN_ACADEMY_SAT_URL,
  getSessionId,
  getAuthApiUrl,
  getStoredCooldownUntil,
  clearCooldown,
  getCooldownRemainingMs,
  isCoolingDown,
  formatCountdown,
  beginCooldown as beginCooldownState,
  startCooldownTimer,
  stopCooldownTimer,
  isLogicalMatchId,
  getStoredActiveMatchState,
  isPersistedMatchExpired,
  clearActiveMatchState,
  getStoredResumeMatchId,
  isResumeAvailable,
  restoreActiveMatchState,
  normalizeTopic,
  getTopicDisplayName,
  saveActiveMatchState
} from "./match-state.js";

import {
  getMineralRank
} from "../../../ranks.js";


/*
 * =========================================================
 * DOM ELEMENTS
 * =========================================================
 */

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

  playerUsernameDiv:
    document.getElementById("playerUsername"),

  playerEloDiv:
    document.getElementById("playerElo"),

  opponentNameDiv:
    document.getElementById("opponentName"),

  opponentUsernameDiv:
    document.getElementById("opponentUsername"),

  opponentEloDiv:
    document.getElementById("opponentElo"),

  playerRankDiv:
    document.getElementById("playerRank"),

  opponentRankDiv:
    document.getElementById("opponentRank")
};


/*
 * =========================================================
 * ELO HELPERS
 * =========================================================
 *
 * Elo can arrive in several shapes depending on whether
 * the object is:
 *
 * - the original matchmaking player object
 * - a refreshed player object
 * - a match-result player object
 * - a historical match object
 *
 * Keep all extraction here so UI code does not accidentally
 * display the old Elo when a newer value exists.
 * =========================================================
 */

function getPlayerElo(player) {
    const candidates = [
        player.newRwElo,
        player.new_rw_elo,
        player.rwEloAfter,
        player.rw_elo_after,
        player.eloAfter,
        player.elo_after,
        player.updatedRwElo,
        player.updated_rw_elo,
        player.currentRwElo,
        player.current_rw_elo,
        player.stats?.rw_elo,
        player.stats?.rwElo,
        player.rw_elo,
        player.rwElo,
        player.stats?.elo,
        player.elo
    ];

    for (const value of candidates) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            continue;
        }

        const number = Number(value);

        if (
            Number.isFinite(number) &&
            number >= 0
        ) {
            return number;
        }
    }

    return null;
}


/*
 * =========================================================
 * ANSWER SELECTION LOCK
 * =========================================================
 */

export function setAnswerSelectionLocked(locked) {
  if (!elements.questionsDiv) {
    return;
  }

  const isLocked = locked === true;

  const answerInputs =
    elements.questionsDiv.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], button.answer-choice, .answer-choice'
    );

  answerInputs.forEach(input => {
    if ("disabled" in input) {
      input.disabled = isLocked;
    }

    if (isLocked) {
      input.setAttribute(
        "aria-disabled",
        "true"
      );

      input.classList.add(
        "answer-selection-locked"
      );
    } else {
      input.removeAttribute(
        "aria-disabled"
      );

      input.classList.remove(
        "answer-selection-locked"
      );
    }
  });

  elements.questionsDiv.dataset.answersLocked =
    isLocked ? "true" : "false";
}


/*
 * =========================================================
 * BASIC UI
 * =========================================================
 */

export function setStatus(message) {
  if (elements.statusDiv) {
    elements.statusDiv.textContent = message;
  }
}


export function showResult(message) {
  if (elements.resultDiv) {
    elements.resultDiv.textContent = message;
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
      /\[UNDERLINED\](.*?)\[\/UNDERLINED\]/gs,
      "<u>$1</u>"
    )
    .replace(/\n/g, "<br>");
}


/*
 * =========================================================
 * PLAYER UI
 * =========================================================
 */

export function updatePlayer(player) {
    if (!player) {
        return;
    }

    const elo = getPlayerElo(player);

    const rank =
        elo !== null
            ? getMineralRank(elo)
            : null;

    if (elements.playerNameDiv) {
        const name =
            player.display_name ||
            player.displayName ||
            player.username ||
            "You";

        elements.playerNameDiv.textContent =
            rank?.name
                ? `${name} (${rank.name})`
                : name;

        elements.playerNameDiv.classList.remove(
            ...Array.from(
                elements.playerNameDiv.classList
            ).filter(
                className =>
                    className.startsWith("rank-")
            )
        );

        if (rank?.className) {
            elements.playerNameDiv.classList.add(
                rank.className
            );
        }
    }

    if (elements.playerEloDiv) {
        elements.playerEloDiv.textContent =
            elo !== null
                ? elo
                : "???";
    }

    if (elements.playerRankDiv) {
        elements.playerRankDiv.textContent =
            rank?.name || "???";

        elements.playerRankDiv.className =
            rank?.className || "";
    }
}


/*
 * =========================================================
 * OPPONENT UI
 * =========================================================
 */

export function updateOpponent(player) {
    if (!player) {
        return;
    }

    state.opponent = {
        ...(state.opponent || {}),
        ...player
    };

    const opponent = state.opponent;

    const elo = getPlayerElo(opponent);

    const rank =
        elo !== null
            ? getMineralRank(elo)
            : null;

    if (elements.opponentNameDiv) {
        const name =
            opponent.display_name ||
            opponent.displayName ||
            opponent.username ||
            "Opponent";

        elements.opponentNameDiv.textContent =
            rank?.name
                ? `${name} (${rank.name})`
                : name;

        elements.opponentNameDiv.classList.remove(
            ...Array.from(
                elements.opponentNameDiv.classList
            ).filter(
                className =>
                    className.startsWith("rank-")
            )
        );

        if (rank?.className) {
            elements.opponentNameDiv.classList.add(
                rank.className
            );
        }
    }

    if (elements.opponentEloDiv) {
        elements.opponentEloDiv.textContent =
            elo !== null
                ? elo
                : "???";
    }

    if (elements.opponentRankDiv) {
        elements.opponentRankDiv.textContent =
            rank?.name || "???";

        elements.opponentRankDiv.className =
            rank?.className || "";
    }

    if (
        state.matchId &&
        isLogicalMatchId(state.matchId)
    ) {
        saveActiveMatchState();
    }
}


/*
 * Update ONLY the opponent's Elo.
 *
 * This is useful after calculateMatchResult() when the
 * backend sends the bot's new Elo but does not send a
 * completely new opponent object.
 */
export function updateOpponentElo(elo) {
  const numericElo =
    Number(elo);

  if (
    !Number.isFinite(numericElo) ||
    numericElo < 0
  ) {
    return false;
  }

  if (!state.opponent) {
    state.opponent = {};
  }

  /*
   * Store the new value in all commonly used forms so
   * subsequent UI/state persistence cannot accidentally
   * fall back to the old matchmaking Elo.
   */
  state.opponent.rw_elo =
    numericElo;

  if (!state.opponent.stats) {
    state.opponent.stats = {};
  }

  state.opponent.stats.rw_elo =
    numericElo;

  const rank =
    getMineralRank(
      numericElo
    );

  if (elements.opponentEloDiv) {
    elements.opponentEloDiv.textContent =
      numericElo;
  }

  if (elements.opponentRankDiv) {
    elements.opponentRankDiv.textContent =
      rank?.name || "???";

    elements.opponentRankDiv.className =
      rank?.className || "";
  }

  if (elements.opponentNameDiv) {
    const name =
      state.opponent.display_name ||
      state.opponent.displayName ||
      state.opponent.username ||
      "Opponent";

    elements.opponentNameDiv.textContent =
      rank?.name
        ? `${name} (${rank.name})`
        : name;

    elements.opponentNameDiv.classList.remove(
      ...Array.from(
        elements.opponentNameDiv.classList
      ).filter(
        className =>
          className.startsWith("rank-")
      )
    );

    if (rank?.className) {
      elements.opponentNameDiv.classList.add(
        rank.className
      );
    }
  }

  if (
    state.matchId &&
    isLogicalMatchId(state.matchId)
  ) {
    saveActiveMatchState();
  }

  return true;
}


/*
 * =========================================================
 * QUEUE / RESUME UI
 * =========================================================
 */

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

if (isCoolingDown()) {
    const remainingSeconds =
        Math.ceil(
            getCooldownRemainingMs() / 1000
        );

    setStatus(
        `Match complete. Cooldown: ${formatCountdown(
            remainingSeconds
        )} remaining. Analyze this game or practice your weakest topics on Khan Academy in the meantime.`
    );
} else {
    setStatus(
        "Cooldown complete. You can join the queue."
    );
}

  renderCooldownCompleteMessage();
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

  if (!isLogicalMatchId(matchId)) {
    console.error(
      "Refusing to enable Resume Game for invalid logical matchId:",
      matchId
    );

    return false;
  }

  const activeState =
    getStoredActiveMatchState();

  if (
    activeState &&
    activeState.matchId === matchId &&
    isPersistedMatchExpired(activeState)
  ) {
    console.log(
      "Refusing to enable Resume Game because saved match is expired:",
      matchId
    );

    clearActiveMatchState();

    state.matchId = null;
    state.resumeAvailable = false;
    state.resumeMatchId = null;
    state.gameStarted = false;
    state.matchFinished = true;

    if (elements.startMatchButton) {
      elements.startMatchButton.disabled =
        false;

      elements.startMatchButton.removeAttribute(
        "disabled"
      );

      elements.startMatchButton.style.display =
        "block";

      elements.startMatchButton.textContent =
        "Join Queue";
    }

    setStatus(
      "Your previous match has finished. You can join the queue."
    );

    return false;
  }

  state.resumeAvailable =
    true;

  state.resumeMatchId =
    String(matchId);

  state.matchId =
    String(matchId);

  state.reconnecting =
    false;

  state.matchFinished =
    false;

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

        matchStartedAt:
          state.matchStartedAt,

        gameStarted:
          state.gameStarted,

        challengeSubmitted:
          state.challengeSubmitted
      }
    );

    if (state.opponent) {
      updateOpponent(
        state.opponent
      );
    }

    if (state.challengeSubmitted) {
      setAnswerSelectionLocked(
        true
      );
    }
  }

  const resumable =
    isResumeAvailable();

  if (!resumable) {
    state.resumeAvailable =
      false;

    state.resumeMatchId =
      null;

    state.inQueue =
      false;

    state.reconnecting =
      false;

    if (!state.gameStarted) {
      state.matchId =
        null;
    }

    return false;
  }

  const matchId =
    state.resumeMatchId ||
    state.matchId;

  if (!isLogicalMatchId(matchId)) {
    state.resumeAvailable =
      false;

    state.resumeMatchId =
      null;

    state.matchId =
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

  state.matchFinished =
    false;

  if (state.challengeSubmitted) {
    setAnswerSelectionLocked(
      true
    );
  }

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
 * COOLDOWN UI
 * =========================================================
 */

function ensureCooldownElement() {
    if (elements.cooldownDiv) {
        return elements.cooldownDiv;
    }

    const cooldown = document.createElement("div");

    cooldown.id = "cooldown";
    cooldown.className = "match-cooldown";
    cooldown.style.display = "none";

    if (elements.startMatchButton?.parentElement) {
        elements.startMatchButton.parentElement.appendChild(
            cooldown
        );
    } else {
        document.body.appendChild(cooldown);
    }

    elements.cooldownDiv = cooldown;

    return cooldown;
}

export function updateCooldownUI() {
    const cooldown =
        ensureCooldownElement();

    const remainingMs =
        getCooldownRemainingMs();

    /*
     * COOLDOWN ACTIVE
     */
    if (remainingMs > 0) {
        const remainingSeconds =
            Math.ceil(
                remainingMs / 1000
            );

        const countdown =
            formatCountdown(
                remainingSeconds
            );

        cooldown.style.display =
            "block";

        cooldown.textContent =
            `Next match available in ${countdown}. Analyze this game or practice your weakest topics on Khan Academy in the meantime.`;

        if (elements.startMatchButton) {
            elements.startMatchButton.disabled =
                true;

            elements.startMatchButton.removeAttribute(
                "aria-disabled"
            );

            elements.startMatchButton.style.display =
                "block";

            elements.startMatchButton.textContent =
                `Cooldown: ${countdown}`;
        }

        if (
            elements.submitButton &&
            !state.gameStarted
        ) {
            elements.submitButton.disabled =
                true;
        }

        if (
            !state.gameStarted &&
            !state.inQueue
        ) {
            setStatus(
                `Match complete. Cooldown: ${countdown} remaining. Analyze this game or practice your weakest topics on Khan Academy in the meantime.`
            );
        }

        return;
    }

    /*
     * COOLDOWN IS ACTUALLY COMPLETE
     */
    cooldown.style.display =
        "none";

    cooldown.textContent =
        "";

    clearCooldown();

    if (
        !state.gameStarted &&
        !state.inQueue
    ) {
        if (isResumeAvailable()) {
            enableResumeGame(
                state.resumeMatchId ||
                state.matchId
            );
        } else {
            enableQueueButton();

            setStatus(
                "Cooldown complete. You can join the queue."
            );
        }
    }
}


export function beginCooldown(
    cooldownUntil = null
) {
    beginCooldownState(
        cooldownUntil
    );

    /*
     * Make sure the cooldown UI exists before
     * starting the timer.
     */
    ensureCooldownElement();

    startCooldownTimer();

    /*
     * Render immediately.
     */
    updateCooldownUI();

    if (
        !state.gameStarted &&
        !state.inQueue
    ) {
        renderCooldownPracticeMessage();
    }
}


export function initializeCooldown() {
    state.cooldownUntil =
        getStoredCooldownUntil();

    ensureCooldownElement();

    /*
     * An active cooldown takes priority over any stale
     * resume state left from the completed match.
     */
    if (isCoolingDown()) {
        state.newGameMode = true;

        state.resumeAvailable = false;
        state.resumeMatchId = null;

        startCooldownTimer();

        updateCooldownUI();

        renderCooldownPracticeMessage();

        return;
    }

    /*
     * Only allow a resumable match when there is no
     * active cooldown.
     */
    if (isResumeAvailable()) {
        state.newGameMode = false;

        stopCooldownTimer();

        if (elements.cooldownDiv) {
            elements.cooldownDiv.style.display =
                'none';
        }

        if (elements.submitButton) {
            elements.submitButton.style.display =
                'none';

            elements.submitButton.disabled =
                true;
        }

        enableResumeGame(
            state.resumeMatchId ||
            state.matchId
        );

        return;
    }

    /*
     * No cooldown and no resumable match.
     */
    clearCooldown();

    if (elements.cooldownDiv) {
        elements.cooldownDiv.style.display =
            'none';

        elements.cooldownDiv.textContent =
            '';
    }

    if (
        !state.gameStarted &&
        !state.inQueue
    ) {
        enableQueueButton();
    }
}


/*
 * =========================================================
 * QUESTION / TOPIC DATA
 * =========================================================
 */

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

  for (const value of possibleFields) {
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


function getTopThreeWeakTopics() {
  const topicStats = {};

  const historicalTopics =
    Array.isArray(
      window.scoreladderHistoricalTopics
    )
      ? window.scoreladderHistoricalTopics
      : [];

  for (const entry of historicalTopics) {
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
      correct: Math.max(0, correct),
      total: Math.max(0, total)
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

    for (const match of matches) {
      const questionResults =
        extractQuestionResults(match);

      for (const result of questionResults) {
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
  }

  return Object.entries(topicStats)
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

        if (accuracyA !== accuracyB) {
          return accuracyA - accuracyB;
        }

        if (a.total !== b.total) {
          return b.total - a.total;
        }

        return topicA.localeCompare(
          topicB
        );
      }
    )
    .slice(0, 3);
}


export function appendTopicRow(
  container,
  topic,
  stats,
  struggling
) {
  const row =
    document.createElement("div");

  row.className =
    "topic-performance-row";

  const name =
    document.createElement("span");

  name.className =
    "topic-performance-name";

  name.textContent =
    getTopicDisplayName(topic);

  row.appendChild(name);

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

      if (accuracyA !== accuracyB) {
        return accuracyA - accuracyB;
      }

      return b.total - a.total;
    }
  );

  const weakestTopics =
    topics.slice(0, 3);

  if (weakestTopics.length > 0) {
    const weakHeading =
      document.createElement("h4");

    weakHeading.textContent =
      "Top 3 topics to practice based on your recent matches";

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


/*
 * =========================================================
 * COOLDOWN PRACTICE MESSAGE
 * =========================================================
 */

export function renderCooldownPracticeMessage() {
  if (!elements.resultDiv) {
    return;
  }

const selectors = [
  ".cooldown-practice",
  ".historical-topic-performance",
  ".current-topic-performance"
];

  selectors.forEach(selector => {
    const old =
      elements.resultDiv.querySelector(
        selector
      );

    if (old) {
      old.remove();
    }
  });

  const container =
    document.createElement("div");

  container.className =
    "cooldown-practice";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "While You Wait";

  container.appendChild(heading);

  const description =
    document.createElement("p");

  description.textContent =
    "A new question set is loading. Use the cooldown to practice your weakest SAT topics.";

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

  if (weakTopics.length === 0) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "Your topic performance will appear here after you answer some questions.";

    container.appendChild(empty);
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

  container.appendChild(link);

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


/*
 * =========================================================
 * HISTORICAL TOPICS
 * =========================================================
 */

export function renderHistoricalTopicPerformance(matches) {
  const existing =
    document.querySelector(
      ".historical-topic-performance"
    );

  if (existing) {
    existing.remove();
  }

  const section =
    document.createElement("section");

  section.className =
    "historical-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "Topics You Struggled With";

  section.appendChild(heading);

  const topics =
    calculateTopicStatsFromMatches(
      matches
    );

  renderTopicStatsIntoContainer(
    section,
    topics
  );

  document
    .querySelector("#result")
    ?.appendChild(section);
}


export function renderHistoricalTopicStats(topics) {
  const existing =
    document.querySelector(
      ".historical-topic-performance"
    );

  if (existing) {
    existing.remove();
  }

  const section =
    document.createElement("section");

  section.className =
    "historical-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "Based on your accumulated question-level performance.";

  section.appendChild(heading);

  window.scoreladderHistoricalTopics =
    topics;

  renderTopicStatsIntoContainer(
    section,
    topics
  );

  document
    .querySelector("#result")
    ?.appendChild(section);

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

  container.appendChild(heading);

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

  container.appendChild(empty);

  elements.resultDiv.appendChild(
    container
  );
}

/*
 * =========================================================
 * NETWORKED UI DATA
 * =========================================================
 */

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

    if (
      state.matchId &&
      isLogicalMatchId(state.matchId)
    ) {
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
  "Loading historical topic performance"
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

    if (Array.isArray(data.topics)) {
      topics = data.topics;
    } else if (
      data.topicPerformance &&
      typeof data.topicPerformance === "object"
    ) {
      topics =
        data.topicPerformance;
    } else if (
      data.topic_performance &&
      typeof data.topic_performance === "object"
    ) {
      topics =
        data.topic_performance;
    } else if (
      data.performance &&
      typeof data.performance === "object"
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

    if (!Array.isArray(topics)) {
      renderNoHistoricalTopicData(
        "No question-level topic data is available yet."
      );

      return;
    }

    const normalizedTopics = [];

    for (const entry of topics) {
      if (
        Array.isArray(entry) &&
        entry.length >= 2
      ) {
        const topic =
          normalizeTopic(entry[0]);

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


export async function loadRecentMatches() {
    const sessionId = getSessionId();

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

        const response = await fetch(url);

        let data = {};

        try {
            data = await response.json();
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
        /*
         * IMPORTANT:
         *
         * Match history is historical data only.
         *
         * DO NOT call:
         *
         *   updateOpponent()
         *   updateOpponentElo()
         *
         * from here.
         *
         * Doing so can overwrite the current opponent after
         * the player finishes a match and clicks Join Queue.
         *
         * The current opponent must come exclusively from the
         * active matchmaking/game state.
         */

        const hasQuestionData =
            matches.some(
                match =>
                    extractQuestionResults(match).length > 0
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

        window.scoreladderRecentMatches = [];

        await loadHistoricalTopicPerformance();
    }
}


/*
 * =========================================================
 * COOLDOWN EVENT BRIDGE
 * =========================================================
 */

window.addEventListener(
  "scoreladder:cooldown-tick",
  updateCooldownUI
);

window.addEventListener(
  "scoreladder:cooldown-complete",
  updateCooldownUI
);

window.addEventListener(
  "scoreladder:cooldown-started",
  updateCooldownUI
);


/*
 * =========================================================
 * RE-EXPORTS
 * =========================================================
 */

export {
  normalizeTopic,
  getTopicDisplayName
};

