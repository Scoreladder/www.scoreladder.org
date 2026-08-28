/*
 * =========================================================
 * MATCH STATE
 * =========================================================
 *
 * Owns:
 * - Match constants
 * - Mutable match state
 * - Local/session persistence
 * - Resume state
 * - Cooldown state
 * - Topic normalization
 * - Match timer state
 *
 * This module intentionally does NOT manipulate DOM elements.
 * UI behavior belongs in match-ui.js.
 * =========================================================
 */


/* =========================================================
   CONSTANTS
   ========================================================= */

export const API =
  "http://127.0.0.1:8787";

export const AUTH_API =
  "https://auth.scoreladder.org";

export const RESUME_MATCH_STORAGE_KEY =
  "scoreladder_multiplayer_resume_match";

export const ACTIVE_MATCH_STATE_STORAGE_KEY =
  "scoreladder_multiplayer_active_match_state";

export const COOLDOWN_STORAGE_KEY =
  "scoreladder_multiplayer_cooldown_until";

export const TOTAL_QUESTIONS =
  11;

export const MATCH_DURATION_MS =
  13 * 60 * 1000;

export const COOLDOWN_DURATION_MS =
  15 * 60 * 1000;

export const KHAN_ACADEMY_SAT_URL =
  "https://www.khanacademy.org/test-prep/sat";


/* =========================================================
   MATCH STATE
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

  resumeAvailable: false,

  resumeMatchId: null,

  resumeInProgress: false,

  matchFinished: false,

  answerSelectionLocked: false,

  /*
   * Timestamp supplied/recorded when the current match began.
   *
   * This is persisted so an old local resume record cannot
   * survive indefinitely if challengeDeadline is unavailable.
   */
  matchStartedAt: 0
};


/* =========================================================
   TOPIC NORMALIZATION
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

  if (
    typeof topic !== "string"
  ) {
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


export function getAuthApiUrl(path) {

  const base =
    AUTH_API.replace(/\/+$/, "");

  const cleanPath =
    String(path).replace(/^\/+/, "");

  return `${base}/${cleanPath}`;
}


/* =========================================================
   COOLDOWN STATE
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

  state.cooldownUntil =
    0;

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


export function startCooldownTimer() {

  stopCooldownTimer();

  state.cooldownInterval =
    setInterval(
      () => {

        /*
         * UI owns actual rendering.
         *
         * Custom events avoid a circular dependency
         * between state and UI modules.
         */
        window.dispatchEvent(
          new CustomEvent(
            "scoreladder:cooldown-tick"
          )
        );

        if (
          getCooldownRemainingMs() <= 0
        ) {

          stopCooldownTimer();

          window.dispatchEvent(
            new CustomEvent(
              "scoreladder:cooldown-complete"
            )
          );
        }
      },
      250
    );
}


export function stopCooldownTimer() {

  if (
    state.cooldownInterval
  ) {

    clearInterval(
      state.cooldownInterval
    );

    state.cooldownInterval =
      null;
  }
}


export function beginCooldown(
  cooldownUntil = null
) {

  const serverUntil =
    Number(cooldownUntil);

  const until =
    Number.isFinite(serverUntil) &&
    serverUntil > Date.now()
      ? serverUntil
      : Date.now() +
        COOLDOWN_DURATION_MS;

  saveCooldownUntil(until);

  state.newGameMode =
    true;

  window.dispatchEvent(
    new CustomEvent(
      "scoreladder:cooldown-started"
    )
  );

  startCooldownTimer();
}


/* =========================================================
   ACTIVE MATCH STATE
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
      !isLogicalMatchId(
        parsed.matchId
      )
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


export function isLogicalMatchId(value) {

  if (
    typeof value !== "string"
  ) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}


/*
 * Determine whether a persisted match is locally expired.
 *
 * Priority:
 *
 * 1. Explicit challengeDeadline.
 * 2. matchStartedAt + MATCH_DURATION_MS.
 * 3. savedAt + MATCH_DURATION_MS.
 */
export function isPersistedMatchExpired(saved) {

  if (
    !saved ||
    typeof saved !== "object"
  ) {
    return true;
  }

  const now =
    Date.now();

  const challengeDeadline =
    Number(
      saved.challengeDeadline
    ) || 0;

  if (
    challengeDeadline > 0
  ) {
    return (
      challengeDeadline <= now
    );
  }

  const matchStartedAt =
    Number(
      saved.matchStartedAt
    ) || 0;

  if (
    matchStartedAt > 0
  ) {
    return (
      matchStartedAt +
        MATCH_DURATION_MS <=
      now
    );
  }

  const savedAt =
    Number(
      saved.savedAt
    ) || 0;

  if (
    savedAt > 0
  ) {
    return (
      savedAt +
        MATCH_DURATION_MS <=
      now
    );
  }

  return true;
}


export function saveActiveMatchState() {

  if (
    !isLogicalMatchId(
      state.matchId
    )
  ) {

    console.warn(
      "Refusing to persist invalid logical matchId:",
      state.matchId
    );

    return false;
  }

  if (
    !Number.isFinite(
      Number(state.matchStartedAt)
    ) ||
    Number(state.matchStartedAt) <= 0
  ) {

    state.matchStartedAt =
      Date.now();
  }

  const activeMatchState = {

    matchId:
      state.matchId,

    playerId:
      state.playerId,

    opponent:
      state.opponent || null,

    questions:
      Array.isArray(
        state.questions
      )
        ? state.questions
        : [],

    selectedAnswers:
      Array.isArray(
        state.selectedAnswers
      )
        ? [...state.selectedAnswers]
        : [],

    challengeDeadline:
      Number(
        state.challengeDeadline
      ) || 0,

    timeRemaining:
      Number(
        state.timeRemaining
      ) || 0,

    gameStarted:
      state.gameStarted === true,

    playerReady:
      state.playerReady === true,

    matchConnectionConfirmed:
      state.matchConnectionConfirmed === true,

    challengeSubmitted:
      state.challengeSubmitted === true,

    answerSelectionLocked:
      state.answerSelectionLocked === true,

    matchFinished:
      state.matchFinished === true,

    matchStartedAt:
      Number(
        state.matchStartedAt
      ) || 0,

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
    !Array.isArray(
      selectedAnswers
    )
  ) {
    return;
  }

  state.selectedAnswers = [
    ...selectedAnswers
  ];

  saveActiveMatchState();
}


export function persistCurrentMatchState() {

  return saveActiveMatchState();
}


/* =========================================================
   RESUME STATE
   ========================================================= */

export function saveResumeMatch(
  matchId
) {

  if (
    typeof matchId !== "string" ||
    !matchId.trim()
  ) {
    return;
  }

  const normalizedMatchId =
    matchId.trim();

  if (
    !isLogicalMatchId(
      normalizedMatchId
    )
  ) {

    console.warn(
      "Refusing to save invalid resume match ID:",
      matchId
    );

    return;
  }

  state.resumeAvailable =
    true;

  state.resumeMatchId =
    normalizedMatchId;

  try {

    localStorage.setItem(
      RESUME_MATCH_STORAGE_KEY,
      normalizedMatchId
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
      !matchId.trim()
    ) {
      return null;
    }

    const normalizedMatchId =
      matchId.trim();

    if (
      !isLogicalMatchId(
        normalizedMatchId
      )
    ) {

      console.warn(
        "Stored resume ID is not a logical match UUID. Removing it:",
        matchId
      );

      localStorage.removeItem(
        RESUME_MATCH_STORAGE_KEY
      );

      return null;
    }

    return normalizedMatchId;

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


export function isResumeAvailable() {

  const activeState =
    getStoredActiveMatchState();

  /*
   * The full active-state record is authoritative.
   */
  if (
    activeState &&
    isLogicalMatchId(
      activeState.matchId
    )
  ) {

    if (
      isPersistedMatchExpired(
        activeState
      )
    ) {

      console.log(
        "Saved match has expired. Clearing resume state:",
        {
          matchId:
            activeState.matchId,

          challengeDeadline:
            activeState.challengeDeadline,

          matchStartedAt:
            activeState.matchStartedAt,

          savedAt:
            activeState.savedAt,

          now:
            Date.now()
        }
      );

      clearActiveMatchState();

      state.matchId =
        null;

      state.gameStarted =
        false;

      state.matchFinished =
        true;

      return false;
    }

    state.resumeAvailable =
      true;

    state.resumeMatchId =
      activeState.matchId;

    return true;
  }

  /*
   * A lightweight resume key alone is not sufficient.
   */
  const storedMatchId =
    getStoredResumeMatchId();

  if (
    storedMatchId &&
    !activeState
  ) {

    console.log(
      "Found orphaned resume key without active match state. Clearing it:",
      storedMatchId
    );

    clearResumeMatch();

    return false;
  }

  return (
    state.resumeAvailable === true &&
    isLogicalMatchId(
      state.resumeMatchId
    )
  );
}


/* =========================================================
   RESTORE ACTIVE MATCH STATE
   ========================================================= */

export function restoreActiveMatchState() {

  const saved =
    getStoredActiveMatchState();

  const storedResumeMatchId =
    getStoredResumeMatchId();

  const logicalMatchId =
    isLogicalMatchId(
      storedResumeMatchId
    )
      ? storedResumeMatchId
      : isLogicalMatchId(
          saved?.matchId
        )
        ? saved.matchId.trim()
        : null;

  if (!logicalMatchId) {
    return false;
  }

  /*
   * Reject an already-expired persisted match before
   * restoring it into live state.
   */
  if (
    saved &&
    isPersistedMatchExpired(saved)
  ) {

    console.log(
      "Persisted match is expired. Clearing resume state:",
      {
        matchId:
          logicalMatchId,

        challengeDeadline:
          saved.challengeDeadline,

        matchStartedAt:
          saved.matchStartedAt,

        savedAt:
          saved.savedAt,

        now:
          Date.now()
      }
    );

    clearActiveMatchState();

    state.matchId =
      null;

    state.resumeAvailable =
      false;

    state.resumeMatchId =
      null;

    state.gameStarted =
      false;

    state.matchFinished =
      true;

    state.matchStartedAt =
      0;

    return false;
  }


  /* -------------------------------------------------------
     RESTORE MATCH DATA
     ------------------------------------------------------- */

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
      ? [
          ...saved.selectedAnswers
        ]
      : [];

  state.challengeDeadline =
    Number(
      saved?.challengeDeadline
    ) || 0;

  state.timeRemaining =
    Number(
      saved?.timeRemaining
    ) || 0;

  state.matchStartedAt =
    Number(
      saved?.matchStartedAt
    ) || 0;


  /*
   * The expiry check above already guarantees the saved
   * match is locally valid.
   */
  state.gameStarted =
    saved?.gameStarted === true;

  state.playerReady =
    saved?.playerReady === true;

  /*
   * Refreshing destroys the WebSocket.
   */
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

  state.matchFinished =
    saved?.matchFinished === true;

  state.answerSelectionLocked =
    saved?.answerSelectionLocked === true;


  /* -------------------------------------------------------
     REPAIR LOGICAL MATCH ID
     ------------------------------------------------------- */

  if (
    saved &&
    saved.matchId !== logicalMatchId
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

        answerSelectionLocked:
          state.answerSelectionLocked,

        matchFinished:
          state.matchFinished,

        matchStartedAt:
          state.matchStartedAt,

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


  /* -------------------------------------------------------
     REPAIR RESUME KEY
     ------------------------------------------------------- */

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
        state.resumeMatchId,

      challengeDeadline:
        state.challengeDeadline,

      matchStartedAt:
        state.matchStartedAt,

      challengeSubmitted:
        state.challengeSubmitted,

      matchFinished:
        state.matchFinished,

      answerSelectionLocked:
        state.answerSelectionLocked
    }
  );

  return true;
}


/* =========================================================
   MATCH TIMER STATE
   ========================================================= */

export function stopMatchTimer() {

  if (
    state.timerInterval
  ) {

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