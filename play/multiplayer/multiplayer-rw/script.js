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
 * Gameplay functions belong in their respective modules.
 * =========================================================
 */

import {
  state,
  isResumeAvailable,
  isCoolingDown,
  restoreCooldownState
} from "./match-state.js";

import {
  elements,
  setStatus,
  initializeResumeGame,
  initializeCooldown,
  loadRecentMatches,
  refreshPlayerStats
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

/*
 * The matchmaking module also listens for this button.
 *
 * This capture-phase listener runs first and intercepts
 * the click only when the button genuinely represents a
 * resumable match.
 */
function handleStartMatchButtonClick(event) {
  if (!elements.startMatchButton) {
    return;
  }

  const button =
    elements.startMatchButton;

  const isResumeButton =
    button.textContent.trim() ===
    "Resume Game";

  const resumable =
    isResumeAvailable();


  /* -------------------------------------------------------
     VALID RESUME BUTTON
     ------------------------------------------------------- */

  if (
    resumable &&
    isResumeButton
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();

    resumeExistingMatch();

    return;
  }


  /* -------------------------------------------------------
     STALE RESUME BUTTON
     ------------------------------------------------------- */

  /*
   * The UI says "Resume Game", but the stored match is
   * no longer locally resumable.
   *
   * Restore normal queue presentation and allow the
   * matchmaking click handler to process this click.
   */
if (
  !resumable &&
  isResumeButton
) {
  if (isCoolingDown()) {
    button.disabled = true;

    button.textContent =
      "Cooldown Active";

    setStatus(
      "Your previous match has finished. Go practice your weakest topics on Khan Academy in the meantime."
    );
  } else {
    button.disabled = false;

    button.removeAttribute(
      "disabled"
    );

    button.textContent =
      "Join Queue";

    setStatus(
      "Your previous match has finished. You can join the queue."
    );
  }
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
   INITIAL BUTTON STATE
   ========================================================= */

/*
 * Do NOT decide between "Resume Game" and "Join Queue"
 * here.
 *
 * initializeResumeGame() owns restoration and initial
 * resume-state presentation.
 */

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


/* =========================================================
   RESTORE PERSISTED STATE
   ========================================================= */

/*
 * Restore the actual cooldown timestamp before the UI
 * decides whether normal queue interaction is available.
 */
restoreCooldownState();


/*
 * initializeCooldown() handles the UI side of cooldown
 * initialization.
 *
 * It must not replace the persisted cooldown timestamp.
 */
initializeCooldown();

/*
 * Restore the persisted match/resume state.
 *
 * initializeResumeGame() is responsible for synchronizing
 * the persisted resume state with the UI.
 */
initializeResumeGame();




/* =========================================================
   LOAD USER DATA
   ========================================================= */

loadRecentMatches();

refreshPlayerStats();


/* =========================================================
   ACTIVE MATCH LEAVE WARNING
   ========================================================= */

/*
 * A match is considered active only when:
 *
 * - There is a match ID.
 * - The match has NOT finished.
 *
 * matchFinished is the single authoritative completion
 * flag. Do not use gameFinished here.
 */
function isMatchInProgress() {
  return Boolean(
    state.matchId &&
    !state.matchFinished
  );
}


/* =========================================================
   BROWSER REFRESH / TAB CLOSE
   ========================================================= */

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


/* =========================================================
   NORMAL PAGE NAVIGATION
   ========================================================= */

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
     * Do not interfere with:
     *
     * - Same-page anchors
     * - javascript links
     * - New-tab links
     * - Modifier clicks
     * - Downloads
     */
    if (
      href.startsWith("#") ||
      link.target === "_blank" ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.metaKey ||
      link.hasAttribute("download")
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


/* =========================================================
   BROWSER BACK / FORWARD
   ========================================================= */

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