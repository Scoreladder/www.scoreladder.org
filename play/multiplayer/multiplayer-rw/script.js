/*
 * =========================================================
 * SCORELADDER MULTIPLAYER ENTRY POINT
 * =========================================================
 *
 * This file owns:
 * - Application startup
 * - Button interception
 * - Global navigation protection
 * - Initialization
 * - Coordination between modules
 *
 * Gameplay functions can remain here temporarily.
 * If game.js already exists, those functions should stay there.
 * =========================================================
 */

import {
  state,

  isResumeAvailable,

  isLogicalMatchId,

  clearActiveMatchState
} from "./match-state.js";

import {
  elements,

  setStatus,

  enableResumeGame,

  enableQueueButton,

  initializeResumeGame,

  initializeCooldown,

  loadRecentMatches,

  refreshPlayerStats,

  updateOpponent
} from "./match-ui.js";

import {
  resumeExistingMatch
} from "./match-connection.js";


/* =========================================================
   INITIAL GLOBAL DATA
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


/* =========================================================
   RESUME BUTTON INTERCEPTION
   ========================================================= */

function handleStartMatchButtonClick(
  event
) {
  if (
    !elements.startMatchButton
  ) {
    return;
  }

  /*
   * Revalidate instead of trusting the button text.
   */
  const resumable =
    isResumeAvailable();

  if (
    resumable &&
    elements.startMatchButton.textContent.trim() ===
      "Resume Game"
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();

    resumeExistingMatch();

    return;
  }

  /*
   * If the button says Resume Game but the local match
   * is no longer valid, force it back to Join Queue and
   * allow the normal queue handler to receive the click.
   */
  if (
    !resumable &&
    elements.startMatchButton.textContent.trim() ===
      "Resume Game"
  ) {
    elements.startMatchButton.disabled =
      false;

    elements.startMatchButton.removeAttribute(
      "disabled"
    );

    elements.startMatchButton.textContent =
      "Join Queue";

    setStatus(
      "Your previous match has finished. You can join the queue."
    );
  }
}


if (
  elements.startMatchButton
) {
  elements.startMatchButton.addEventListener(
    "click",
    handleStartMatchButtonClick,
    true
  );
}


/* =========================================================
   INITIAL BUTTON STATE
   ========================================================= */

if (
  elements.startMatchButton
) {
  elements.startMatchButton.disabled =
    false;

  if (
    isResumeAvailable()
  ) {
    elements.startMatchButton.textContent =
      "Resume Game";

    setStatus(
      "You were disconnected from your match. Resume the game to reconnect."
    );
  } else {
    elements.startMatchButton.textContent =
      "Join Queue";

    setStatus(
      "Ready to join queue."
    );
  }
}


if (
  elements.submitButton
) {
  elements.submitButton.style.display =
    "none";

  elements.submitButton.disabled =
    true;
}


if (
  elements.timerDiv
) {
  elements.timerDiv.textContent =
    "13:00";
}


/* =========================================================
   RESTORE PERSISTED STATE
   ========================================================= */

initializeResumeGame();

initializeCooldown();


/*
 * Make Resume Game win over normal button setup ONLY
 * if it is still genuinely resumable.
 */
if (
  isResumeAvailable() &&
  !state.gameStarted &&
  !state.inQueue
) {
  enableResumeGame(
    state.resumeMatchId ||
    state.matchId
  );
} else if (
  !state.gameStarted &&
  !state.inQueue
) {
  /*
   * Explicitly restore Join Queue when no valid resume
   * state exists.
   *
   * Cooldown UI handles its own disabled state.
   */
  enableQueueButton();
}


/* =========================================================
   LOAD USER DATA
   ========================================================= */

loadRecentMatches();

refreshPlayerStats();


/* =========================================================
   ACTIVE MATCH LEAVE WARNING
   ========================================================= */

function isMatchInProgress() {
  return Boolean(
    state.matchId &&
    !state.matchFinished &&
    !state.gameFinished
  );
}


/*
 * Browser refresh / tab close.
 */
function handleBeforeUnload(event) {
  if (!isMatchInProgress()) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
}


window.addEventListener(
  "beforeunload",
  handleBeforeUnload
);


/*
 * Normal page navigation.
 */
document.addEventListener(
  "click",
  event => {
    if (!isMatchInProgress()) {
      return;
    }

    const link =
      event.target.closest(
        "a[href]"
      );

    if (!link) {
      return;
    }

    const href =
      link.href;

    if (!href) {
      return;
    }

    /*
     * Ignore:
     * - Same-page anchors
     * - javascript links
     * - new-tab links
     * - modifier-clicks
     * - downloads
     */
    if (
      href.startsWith("#") ||
      link.target === "_blank" ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.metaKey ||
      link.hasAttribute(
        "download"
      )
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "WARNING: Do not leave or refresh while a match is in progress.\n\n" +
        "Disconnecting may prevent you from rejoining the match " +
        "or entering a new match. Reconnection is currently unreliable.\n\n" +
        "Are you sure you want to leave?"
      );

    if (!confirmed) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true
);


/*
 * Browser back / forward.
 */
window.addEventListener(
  "popstate",
  () => {
    if (!isMatchInProgress()) {
      return;
    }

    const confirmed =
      window.confirm(
        "WARNING: Your match is still in progress.\n\n" +
        "Leaving may prevent you from rejoining the match " +
        "or entering a new match. Reconnection is currently unreliable.\n\n" +
        "Are you sure you want to leave?"
      );

    if (!confirmed) {
      history.pushState(
        null,
        "",
        window.location.href
      );
    }
  }
);