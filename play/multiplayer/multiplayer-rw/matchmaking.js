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
} from "./game.js";

/* =========================================================
   PROFILE NORMALIZATION
   ========================================================= */

/*
 * Always prefer display_name for anything shown to the user.
 *
 * Internal identifiers such as:
 *   bot_001
 *   discord_123456
 *
 * remain untouched in id/playerId.
 */
function normalizePlayer(player) {
  if (!player) {
    return null;
  }

  const normalized = {
    ...player
  };

  /*
   * Backend may use either display_name or displayName.
   */
  const displayName =
    player.display_name ||
    player.displayName ||
    player.name ||
    player.username ||
    "Unknown Player";

  normalized.display_name =
    displayName;

  /*
   * Keep displayName too in case another frontend
   * component expects camelCase.
   */
  normalized.displayName =
    displayName;

  /*
   * Username remains the actual account username.
   * Do NOT replace it with the display name.
   */
  if (!normalized.username) {
    normalized.username =
      displayName;
  }

  /*
   * Preserve bot IDs exactly.
   */
  if (normalized.id != null) {
    normalized.id =
      String(normalized.id);
  }

  if (normalized.playerId != null) {
    normalized.playerId =
      String(normalized.playerId);
  }

  /*
   * Useful flag for frontend logic.
   * bot_ prefix is your bot identifier convention.
   */
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

    setStatus(
      "You are still on cooldown."
    );

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
          renderCooldownPracticeMessage();

          return;
        }
      }

      throw new Error(
        "Game cooldown is active."
      );
    }

    state.playerId =
      String(data.playerId);

    /*
     * IMPORTANT:
     * Normalize the player before sending it to
     * the UI so display_name is used instead of username.
     */
    if (data.player) {
      const player =
        normalizePlayer(
          data.player
        );

      updatePlayer(
        player
      );
    }

    if (data.status === "matched") {
      state.matchId =
        data.matchId;

      state.inQueue = false;

      const opponent =
        normalizePlayer(
          data.opponent
        );

      updateOpponent(
        opponent
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

    setStatus(
      error.message ||
      "Unable to connect to matchmaking."
    );

    state.inQueue = false;

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
    }

    if (
      response.ok &&
      data.status === "matched"
    ) {
      state.matchId =
        data.matchId;

      state.inQueue = false;

      /*
       * Normalize opponent here too.
       *
       * This is especially important for bots because
       * the queue may return a bot object from the
       * matchmaking Durable Object.
       */
      const opponent =
        normalizePlayer(
          data.opponent
        );

      updateOpponent(
        opponent
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
   * All room connections are owned by
   * match-connection.js.
   *
   * Do not create another WebSocket here.
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

      if (isCoolingDown()) {
        updateCooldownUI();

        return;
      }

      /*
       * No match yet = join queue.
       */
      if (!state.matchId) {
        if (!state.inQueue) {
          startMatchmaking();
        }

        return;
      }

      /*
       * Game is already running.
       */
      if (state.gameStarted) {
        return;
      }

      /*
       * Already sent ready.
       */
      if (state.playerReady) {
        return;
      }

      /*
       * Both players must be connected.
       */
      if (!state.matchConnectionConfirmed) {
        setStatus(
          "Waiting for opponent to connect..."
        );

        return;
      }

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

      state.playerReady =
        true;

      elements.startMatchButton.disabled =
        true;

      elements.startMatchButton.textContent =
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
        state.playerReady =
          false;

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