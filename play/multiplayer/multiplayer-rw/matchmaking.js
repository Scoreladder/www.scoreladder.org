import {
  API,
  elements,
  state,
  setStatus,
  getSessionId,
  updatePlayer,
  updateOpponent,
  isCoolingDown,
  updateCooldownUI,
  saveCooldownUntil,
  startCooldownTimer,
  renderCooldownPracticeMessage,
  sendRoomMessage,
  beginCooldown
} from "./script.js";

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

  connectToRoom();
}

/* =========================================================
   WEBSOCKET
   ========================================================= */

function connectToRoom() {
  if (
    !state.matchId ||
    !state.playerId
  ) {
    console.error(
      "Cannot connect to room:",
      {
        matchId:
          state.matchId,

        playerId:
          state.playerId
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
      state.matchId
    )}` +
    `&playerId=${encodeURIComponent(
      state.playerId
    )}`;

  console.log(
    "Connecting to room:",
    socketURL
  );

  if (
    state.matchSocket &&
    state.matchSocket.readyState !==
      WebSocket.CLOSED &&
    state.matchSocket.readyState !==
      WebSocket.CLOSING
  ) {
    state.matchSocket.close();
  }

  const socket =
    new WebSocket(
      socketURL
    );

  state.matchSocket =
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
        state.matchSocket !==
        socket
      ) {
        console.warn(
          "Ignoring message from stale socket."
        );

        return;
      }

      switch (data.type) {

        /* --------------------------------------------- */
        /* CONNECTED                                     */
        /* --------------------------------------------- */

        case "connected":

          console.log(
            "Room connection confirmed:",
            data
          );

          return;

        /* --------------------------------------------- */
        /* ROOM STATE                                    */
        /* --------------------------------------------- */

        case "room_state": {

          console.log(
            "Room state:",
            data
          );

          state.matchConnectionConfirmed =
            !!data.bothConnected;

          if (data.gameStarted) {
            state.gameStarted = true;
            state.inQueue = false;

            if (elements.startMatchButton) {
              elements.startMatchButton.disabled =
                true;

              elements.startMatchButton.textContent =
                "Match In Progress";
            }

            setStatus(
              "Match already in progress."
            );

            break;
          }

          if (
            data.bothConnected &&
            !data.gameStarted &&
            !data.gameFinished
          ) {
            state.gameStarted =
              false;

            state.inQueue =
              true;

            state.playerReady =
              false;

            state.matchConnectionConfirmed =
              true;

            setStatus(
              "Both players connected. Ready to start."
            );

            if (elements.startMatchButton) {
              elements.startMatchButton.disabled =
                false;

              elements.startMatchButton.textContent =
                "Start Match";
            }

            break;
          }

          if (
            data.connectedCount === 1 &&
            !data.gameStarted &&
            !data.gameFinished
          ) {
            state.gameStarted =
              false;

            state.inQueue =
              true;

            state.playerReady =
              false;

            state.matchConnectionConfirmed =
              false;

            setStatus(
              "Waiting for opponent to connect..."
            );

            if (elements.startMatchButton) {
              elements.startMatchButton.disabled =
                true;

              elements.startMatchButton.textContent =
                "Waiting for Opponent...";
            }

            break;
          }

          if (
            data.connectedCount === 0 &&
            !data.gameStarted &&
            !data.gameFinished
          ) {
            state.matchConnectionConfirmed =
              false;

            setStatus(
              "Waiting for opponent to connect..."
            );

            if (elements.startMatchButton) {
              elements.startMatchButton.disabled =
                true;

              elements.startMatchButton.textContent =
                "Waiting for Opponent...";
            }
          }

          break;
        }

        /* --------------------------------------------- */
        /* WAITING                                      */
        /* --------------------------------------------- */

        case "waiting_for_opponent":

          if (
            !state.gameStarted
          ) {
            state.matchConnectionConfirmed =
              false;

            state.inQueue =
              true;

            setStatus(
              "Waiting for opponent to connect..."
            );

            if (elements.startMatchButton) {
              elements.startMatchButton.disabled =
                true;

              elements.startMatchButton.textContent =
                "Waiting for Opponent...";
            }
          }

          return;

        /* --------------------------------------------- */
        /* OPPONENT CONNECTED                            */
        /* --------------------------------------------- */

        case "opponent_connected":

          state.matchConnectionConfirmed =
            true;

          state.inQueue =
            true;

          state.gameStarted =
            false;

          state.playerReady =
            false;

          setStatus(
            "Both players connected. Ready to start."
          );

          if (elements.startMatchButton) {
            elements.startMatchButton.disabled =
              false;

            elements.startMatchButton.textContent =
              "Start Match";
          }

          return;

        /* --------------------------------------------- */
        /* MATCH READY                                  */
        /* --------------------------------------------- */

        case "match_ready":

          state.matchConnectionConfirmed =
            true;

          state.inQueue =
            true;

          state.gameStarted =
            false;

          state.playerReady =
            false;

          setStatus(
            "Both players connected. Ready to start."
          );

          if (elements.startMatchButton) {
            elements.startMatchButton.disabled =
              false;

            elements.startMatchButton.textContent =
              "Start Match";
          }

          return;

        /* --------------------------------------------- */
        /* OPPONENT READY                               */
        /* --------------------------------------------- */

        case "opponent_ready":

          state.matchConnectionConfirmed =
            true;

          if (!state.gameStarted) {
            setStatus(
              "Opponent is ready. Click Start Match when ready."
            );
          }

          return;

        /* --------------------------------------------- */
        /* GAME SCHEDULE                                */
        /* --------------------------------------------- */

        case "game_schedule":

          console.log(
            "Next game scheduled:",
            data.nextGameAt
          );

          if (
            data.nextGameAt &&
            !state.gameStarted
          ) {
            setStatus(
              data.message ||
              "Game scheduled."
            );
          }

          return;

        /* --------------------------------------------- */
        /* GAME START                                  */
        /* --------------------------------------------- */

        case "game_start":

          state.matchConnectionConfirmed =
            true;

          state.inQueue =
            false;

          handleGameStart(
            data
          );

          return;

        /* --------------------------------------------- */
        /* ANSWER UPDATE                               */
        /* --------------------------------------------- */

        case "answer_update":

          return;

        /* --------------------------------------------- */
        /* OPPONENT SUBMITTED                           */
        /* --------------------------------------------- */

        case "opponent_submitted":

          setStatus(
            "Opponent has submitted. Finish your answers."
          );

          return;

        /* --------------------------------------------- */
        /* SUBMISSION RECEIVED                          */
        /* --------------------------------------------- */

        case "submission_received":

          if (data.automatic) {
            setStatus(
              "Time expired. Waiting for opponent..."
            );
          }

          return;

        /* --------------------------------------------- */
        /* RESULT                                       */
        /* --------------------------------------------- */

        case "game_result":

          handleGameResult(
            data
          );

          return;

        /* --------------------------------------------- */
        /* GAME ERROR                                   */
        /* --------------------------------------------- */

        case "game_error":

          console.error(
            "Game error:",
            data.message
          );

          state.gameStarted =
            false;

          state.playerReady =
            false;

          state.inQueue =
            false;

          state.matchConnectionConfirmed =
            false;

          setStatus(
            data.message ||
            "Unable to start match."
          );

          if (elements.startMatchButton) {
            elements.startMatchButton.disabled =
              false;

            elements.startMatchButton.textContent =
              "Join Queue";
          }

          return;

        /* --------------------------------------------- */
        /* GAME NOT READY                               */
        /* --------------------------------------------- */

        case "game_not_ready":

          setStatus(
            data.message ||
            "The game is not ready yet."
          );

          state.gameStarted =
            false;

          state.playerReady =
            false;

          if (
            state.matchConnectionConfirmed &&
            elements.startMatchButton
          ) {
            elements.startMatchButton.disabled =
              false;

            elements.startMatchButton.textContent =
              "Start Match";
          }

          return;

        /* --------------------------------------------- */
        /* OPPONENT LEFT                                */
        /* --------------------------------------------- */

        case "opponent_left":

          if (
            !state.matchConnectionConfirmed &&
            !state.gameStarted
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

          if (elements.submitButton) {
            elements.submitButton.disabled =
              true;
          }

          if (elements.startMatchButton) {
            elements.startMatchButton.disabled =
              true;
          }

          state.gameStarted =
            false;

          return;

        /* --------------------------------------------- */
        /* UNKNOWN                                      */
        /* --------------------------------------------- */

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
        state.matchSocket !==
        socket
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
        state.matchSocket === socket &&
        !state.gameStarted
      ) {
        console.log(
          "Socket closed before game start."
        );
      }
    }
  );
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
  connectToRoom,
  onMatchFound
};