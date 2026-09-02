/* =========================================================
   MATCH DISCONNECT
   ========================================================= */

/*
 * This module owns:
 *
 * - WebSocket close handling
 * - WebSocket error handling
 * - pagehide persistence
 * - visibilitychange persistence
 *
 * It does NOT create WebSockets.
 * That belongs to match-reconnect.js.
 */

export function createDisconnectManager({
  state,
  saveActiveMatchState,
  enableResumeGame,
  setStatus
}) {

  /* =======================================================
     CONNECTION STATE
     ======================================================= */

  function clearConnectionState() {
    state.matchConnectionConfirmed =
      false;

    state.resumeInProgress =
      false;

    state.reconnecting =
      false;
  }


  /* =======================================================
     WEBSOCKET ERROR
     ======================================================= */

  function handleSocketError(
    error,
    isResume
  ) {
    console.error(
      "WebSocket error:",
      error
    );

    clearConnectionState();

    if (isResume) {
      setStatus(
        "Unable to reconnect to your match."
      );

      enableResumeGame(
        state.matchId
      );

      return;
    }

    setStatus(
      "Connection to match failed."
    );
  }


  /* =======================================================
     WEBSOCKET CLOSE
     ======================================================= */

  function handleSocketClose(
    event,
    isResume
  ) {
    console.log(
      "WebSocket closed:",
      {
        code:
          event.code,

        reason:
          event.reason
      }
    );

    state.matchConnectionConfirmed =
      false;

    state.resumeInProgress =
      false;

    /*
     * Preserve an unfinished active match.
     */
    if (
      state.gameStarted &&
      !state.challengeSubmitted &&
      !state.newGameMode
    ) {
      saveActiveMatchState();

      state.resumeAvailable =
        true;

      state.resumeMatchId =
        state.matchId;

      state.reconnecting =
        false;

      enableResumeGame(
        state.matchId
      );

      return;
    }

    /*
     * Also preserve a matched room that has not
     * started yet.
     */
    if (
      state.matchId &&
      !state.matchFinished &&
      !state.newGameMode
    ) {
      saveActiveMatchState();

      state.reconnecting =
        false;

      enableResumeGame(
        state.matchId
      );

      return;
    }

    state.reconnecting =
      false;
  }


  /* =======================================================
     PAGE LIFECYCLE PERSISTENCE
     ======================================================= */

  function persistBeforePageHide() {
    if (
      state.matchId &&
      !state.challengeSubmitted
    ) {
      saveActiveMatchState();
    }
  }


  function installPageLifecycleHandlers() {
    window.addEventListener(
      "pagehide",
      persistBeforePageHide
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (
          document.visibilityState ===
          "hidden"
        ) {
          persistBeforePageHide();
        }
      }
    );
  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  return {
    handleSocketError,
    handleSocketClose,
    persistBeforePageHide,
    installPageLifecycleHandlers
  };
}