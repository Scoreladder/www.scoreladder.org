import {
  API,
  state,
  getSessionId,
  isCoolingDown,
  saveCooldownUntil,
  startCooldownTimer,
  beginCooldown
} from "./match-state.js";

import {
  elements,
  setStatus,
  updatePlayer,
  updateOpponent,
  updateCooldownUI,
  renderCooldownPracticeMessage
} from "./match-ui.js";

import {
  sendRoomMessage,
  connectToRoom
} from "./match-connection.js";

import {
  handleGameStart,
  handleGameResult
} from "./match-game.js";


/* =========================================================
   PROFILE NORMALIZATION
   ========================================================= */

/*
 * Normalize player objects at the matchmaking boundary.
 *
 * Rules:
 * - display_name is preferred for visible names.
 * - username remains the actual account username.
 * - id/playerId are preserved as strings.
 * - bot IDs are never modified.
 */
function normalizePlayer(player) {
  if (!player) {
    return null;
  }

  const normalized = {
    ...player
  };

  const displayName =
    player.display_name ||
    player.displayName ||
    player.name ||
    player.username ||
    "Unknown Player";

  normalized.display_name =
    displayName;

  normalized.displayName =
    displayName;

  if (!normalized.username) {
    normalized.username =
      displayName;
  }

  if (normalized.id != null) {
    normalized.id =
      String(normalized.id);
  }

  if (normalized.playerId != null) {
    normalized.playerId =
      String(normalized.playerId);
  }

  normalized.isBot =
    String(
      normalized.id ||
      normalized.playerId ||
      ""
    ).startsWith("bot_");

  return normalized;
}


/* =========================================================
   MATCHMAKING
   ========================================================= */

async function startMatchmaking() {
  if (isCoolingDown()) {
    updateCooldownUI();
    return;
  }

  if (state.inQueue) {
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

  /*
   * Reset only match-specific state.
   */
  state.matchId = null;
  state.opponent = null;
  state.playerReady = false;
  state.gameStarted = false;
  state.challengeSubmitted = false;
  state.submissionInProgress = false;
  state.matchConnectionConfirmed = false;
  state.inQueue = true;

  if (elements.startMatchButton) {
    elements.startMatchButton.disabled = true;
    elements.startMatchButton.textContent =
      "Joining Queue...";
  }

  if (elements.submitButton) {
    elements.submitButton.style.display =
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

    /*
     * Handle HTTP-level errors first.
     */
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

          state.newGameMode = true;

          startCooldownTimer();
          renderCooldownPracticeMessage();
        }
      }

      throw new Error(
        data.error ||
        "Unable to enter matchmaking."
      );
    }

    /*
     * The matchmaking worker can also return a
     * successful response indicating that cooldown
     * is active.
     */
    if (data.status === "cooldown") {
      state.inQueue = false;

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

          state.newGameMode = true;

          beginCooldown();

          return;
        }
      }

      throw new Error(
        "Game cooldown is active."
      );
    }

    /*
     * Matchmaking succeeded. Store our player ID
     * before handling either matched or queued state.
     */
    if (data.playerId != null) {
      state.playerId =
        String(data.playerId);
    }

    /*
     * Normalize the player before sending it to
     * the player UI.
     */
    if (data.player) {
      updatePlayer(
        normalizePlayer(data.player)
      );
    }

    /*
     * Match was immediately found.
     */
    if (data.status === "matched") {
      state.matchId =
        data.matchId;

      state.inQueue = false;

      updateOpponent(
        normalizePlayer(data.opponent)
      );

      setStatus(
        "Opponent found!"
      );

      if (elements.startMatchButton) {
        elements.startMatchButton.textContent =
          "Connecting...";
      }

      onMatchFound();

      return;
    }

    /*
     * Still waiting in the queue.
     */
    if (elements.startMatchButton) {
      elements.startMatchButton.textContent =
        "In Queue";
    }

    setStatus(
      "Waiting for opponent..."
    );

    checkForMatch();

  } catch (error) {
    console.error(
      "Matchmaking error:",
      error
    );

    state.inQueue = false;

    setStatus(
      error.message ||
      "Unable to connect to matchmaking."
    );

    if (isCoolingDown()) {
      updateCooldownUI();
      return;
    }

    if (elements.startMatchButton) {
      elements.startMatchButton.disabled =
        false;

      elements.startMatchButton.textContent =
        "Join Queue";
    }

    if (elements.submitButton) {
      elements.submitButton.style.display =
        "none";
    }
  }
}


/* =========================================================
   CHECK FOR MATCH
   ========================================================= */

async function checkForMatch() {
  if (
    state.checkingMatch ||
    !state.playerId ||
    state.matchId
  ) {
    return;
  }

  state.checkingMatch = true;

  try {
    const response =
      await fetch(
        `${API}/check-match?playerId=${encodeURIComponent(
          state.playerId
        )}`
      );

    const data =
      await response.json();

    console.log(
      "Match check:",
      data
    );

    /*
     * Server-side cooldown.
     */
    if (
      response.ok &&
      data.status === "cooldown"
    ) {
      state.inQueue = false;

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

          state.newGameMode = true;

          startCooldownTimer();
          renderCooldownPracticeMessage();

          return;
        }
      }

      return;
    }

    /*
     * Match found while polling.
     */
    if (
      response.ok &&
      data.status === "matched"
    ) {
      state.matchId =
        data.matchId;

      state.inQueue = false;

      updateOpponent(
        normalizePlayer(data.opponent)
      );

      setStatus(
        "Opponent found!"
      );

      if (elements.startMatchButton) {
        elements.startMatchButton.textContent =
          "Connecting...";
      }

      onMatchFound();

      return;
    }

  } catch (error) {
    console.error(
      "Match check error:",
      error
    );

  } finally {
    state.checkingMatch = false;
  }

  /*
   * Continue polling only while the player is
   * genuinely still waiting for a match.
   */
  if (
    !state.matchId &&
    state.inQueue &&
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
    state.matchId
  );

  console.log(
    "Opponent:",
    state.opponent
  );

  state.matchConnectionConfirmed =
    false;

  /*
   * match-connection.js owns the WebSocket.
   * This function only begins the connection process.
   */
  connectToRoom(false);
}


/* =========================================================
   START / QUEUE BUTTON
   ========================================================= */

if (elements.startMatchButton) {
  elements.startMatchButton.addEventListener(
    "click",
    () => {
      /*
       * Cooldown always takes priority.
       */
      if (isCoolingDown()) {
        updateCooldownUI();
        return;
      }

      /*
       * No match ID means the player is joining
       * matchmaking.
       */
      if (!state.matchId) {
        if (!state.inQueue) {
          startMatchmaking();
        }

        return;
      }

      /*
       * Do not allow starting a match that has
       * already started.
       */
      if (state.gameStarted) {
        return;
      }

      /*
       * Do not send start_ready more than once.
       */
      if (state.playerReady) {
        return;
      }

      /*
       * The room must confirm the connection before
       * the player can send start_ready.
       */
      if (!state.matchConnectionConfirmed) {
        setStatus(
          "Waiting for opponent to connect..."
        );

        return;
      }

      /*
       * Make sure the actual WebSocket is open.
       */
      if (
        !state.matchSocket ||
        state.matchSocket.readyState !==
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

      /*
       * Mark ready before sending so a rapid second
       * click cannot send another start_ready message.
       */
      state.playerReady = true;

      elements.startMatchButton.disabled =
        true;

      elements.startMatchButton.textContent =
        "Waiting for Opponent...";

      setStatus(
        "Waiting for opponent to start..."
      );

      const sent =
        sendRoomMessage({
          type: "start_ready"
        });

      /*
       * If the message could not be sent, roll back
       * playerReady so the user can try again.
       */
      if (!sent) {
        state.playerReady = false;

        elements.startMatchButton.disabled =
          false;

        elements.startMatchButton.textContent =
          "Start Match";

        setStatus(
          "Unable to start match."
        );
      }
    }
  );
}


/* =========================================================
   EXPORTS
   ========================================================= */

export {
  startMatchmaking,
  checkForMatch,
  onMatchFound
};