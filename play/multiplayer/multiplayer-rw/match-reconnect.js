/* =========================================================
   MATCH RECONNECT
   ========================================================= */

/*
 * This module owns:
 *
 * - WebSocket creation
 * - WebSocket message handling
 * - room_state handling
 * - reconnecting
 * - resumeExistingMatch()
 * - onMatchFound()
 * - sendRoomMessage()
 *
 * It does NOT own:
 *
 * - question rendering
 * - answer selection
 * - submission implementation
 * - match result rendering
 *
 * Those remain in script.js and are supplied as callbacks.
 */

export function createReconnectManager({
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

  startGame,
  startMatchTimer,
  handleGameResult,

  disconnectManager
}) {
  function sendRoomMessage(
    message
  ) {
    if (
      !state.matchSocket ||
      state.matchSocket.readyState !==
        WebSocket.OPEN
    ) {
      console.error(
        "WebSocket is not connected."
      );

      return false;
    }

    try {
      state.matchSocket.send(
        JSON.stringify(message)
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

  function handleRoomState(
    data
  ) {
    console.log(
      "Room state:",
      {
        logicalMatchId:
          state.matchId,

        durableObjectId:
          data.matchId,

        gameStarted:
          data.gameStarted,

        connectedCount:
          data.connectedCount,

        roomStatus:
          data.roomStatus
      }
    );

    /*
     * NEVER replace state.matchId with data.matchId.
     *
     * data.matchId is the Durable Object's internal ID.
     */
    if (
      Array.isArray(
        data.registeredPlayers
      ) &&
      state.playerId &&
      !data.registeredPlayers
        .map(String)
        .includes(
          String(
            state.playerId
          )
        )
    ) {
      console.error(
        "Current player is not registered in room."
      );

      clearActiveMatchState();

      state.matchId =
        null;

      state.gameStarted =
        false;

      state.reconnecting =
        false;

      enableQueueButton();

      return;
    }

    if (
      data.gameFinished ||
      data.roomStatus ===
        "finished"
    ) {
      clearActiveMatchState();

      state.gameStarted =
        false;

      state.reconnecting =
        false;

      return;
    }

    /*
     * The server says the match is active.
     *
     * We can rebuild from our locally persisted
     * questions/answers immediately. The server's
     * game_start message will also arrive when the
     * backend provides it.
     */
    if (
      data.gameStarted
    ) {
      state.gameStarted =
        true;

      state.inQueue =
        false;

      state.playerReady =
        false;

      state.newGameMode =
        false;

      state.challengeSubmitted =
        false;

      state.submissionInProgress =
        false;

      state.matchConnectionConfirmed =
        true;

      state.reconnecting =
        false;

      if (
        data.startTime
      ) {
        state.challengeDeadline =
          Number(
            data.startTime
          ) +
          MATCH_DURATION_MS;

        state.timeRemaining =
          Math.max(
            0,
            Math.ceil(
              (
                state.challengeDeadline -
                Date.now()
              ) / 1000
            )
          );
      }

      /*
       * Rebuild from locally saved questions.
       */
      if (
        Array.isArray(
          state.questions
        ) &&
        state.questions.length > 0
      ) {
        renderQuestions();

        restoreSelectedAnswerUI();
      }

      if (
        elements.startMatchButton
      ) {
        elements.startMatchButton.disabled =
          true;

        elements.startMatchButton.style.display =
          "none";
      }

      if (
        elements.submitButton
      ) {
        elements.submitButton.style.display =
          "block";

        elements.submitButton.textContent =
          "Submit Answers";
      }

      if (
        data.startTime
      ) {
        startMatchTimer(
          data.startTime
        );
      }

      updateSubmitButton();

      setStatus(
        "Match resumed. Continue where you left off."
      );

      saveActiveMatchState();

      console.log(
        "RESUME ROOM STATE APPLIED:",
        {
          matchId:
            state.matchId,

          gameStarted:
            state.gameStarted,

          questionCount:
            state.questions.length,

          selectedAnswers:
            state.selectedAnswers,

          timeRemaining:
            state.timeRemaining,

          submitDisabled:
            elements.submitButton
              ?.disabled
        }
      );

      return;
    }

    /*
     * Both players connected, but game hasn't started.
     */
    if (
      data.opponentConnected ||
      data.connectedCount === 2 ||
      data.roomStatus ===
        "both_connected"
    ) {
      if (
        !state.gameStarted
      ) {
        state.reconnecting =
          false;

        if (
          elements.startMatchButton
        ) {
          elements.startMatchButton.disabled =
            false;

          elements.startMatchButton.style.display =
            "block";

          elements.startMatchButton.textContent =
            "Start Match";
        }

        setStatus(
          "Both players connected. Ready to start."
        );
      }

      return;
    }

    /*
     * Only one player currently connected.
     */
    if (
      data.roomStatus ===
      "waiting_for_opponent"
    ) {
      state.reconnecting =
        false;

      setStatus(
        "Waiting for opponent to connect..."
      );
    }
  }

  function connectToRoom(
    isResume = false
  ) {
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

      state.resumeInProgress =
        false;

      state.reconnecting =
        false;

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

    /*
     * IMPORTANT:
     *
     * state.matchId is the logical matchmaking UUID.
     * That is what the Worker uses to find the room.
     */
    const socketURL =
      `${wsAPI}/match?matchId=${encodeURIComponent(
        state.matchId
      )}` +
      `&playerId=${encodeURIComponent(
        state.playerId
      )}`;

    console.log(
      "Connecting to room:",
      {
        socketURL,
        isResume
      }
    );

    if (
      state.matchSocket &&
      state.matchSocket.readyState !==
        WebSocket.CLOSED
    ) {
      try {
        state.matchSocket.close();
      } catch {}
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
        if (
          state.matchSocket !==
          socket
        ) {
          return;
        }

        console.log(
          "WebSocket connected."
        );

        state.matchConnectionConfirmed =
          true;

        if (
          isResume
        ) {
          state.reconnecting =
            true;

          setStatus(
            "Reconnected. Restoring your match..."
          );

          sendRoomMessage({
            type:
              "request_room_state"
          });
        } else {
          state.reconnecting =
            false;

          setStatus(
            "Connected. Waiting for opponent..."
          );
        }
      }
    );

    socket.addEventListener(
      "message",
      event => {
        if (
          state.matchSocket !==
          socket
        ) {
          return;
        }

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

        console.log(
          "WebSocket message:",
          data
        );

        switch (
          data.type
        ) {
          case "connected": {
            /*
             * data.matchId is the Durable Object
             * internal ID.
             *
             * NEVER copy it into state.matchId.
             */
            console.log(
              "Connected to match room:",
              {
                logicalMatchId:
                  state.matchId,

                durableObjectId:
                  data.matchId,

                playerId:
                  data.playerId
              }
            );

            if (
              data.playerId !==
                undefined &&
              data.playerId !==
                null
            ) {
              state.playerId =
                String(
                  data.playerId
                );
            }

            if (
              data.opponent
            ) {
              updateOpponent(
                data.opponent
              );
            }

            state.matchConnectionConfirmed =
              true;

            if (
              isResume
            ) {
              state.reconnecting =
                true;

              setStatus(
                "Reconnected. Restoring your match..."
              );

              sendRoomMessage({
                type:
                  "request_room_state"
              });
            } else {
              state.reconnecting =
                false;

              setStatus(
                "Connected. Waiting for opponent..."
              );
            }

            saveActiveMatchState();

            return;
          }

          case "room_state": {
            handleRoomState(
              data
            );

            return;
          }

          case "waiting_for_opponent": {
            if (
              !state.gameStarted
            ) {
              setStatus(
                "Waiting for opponent to connect..."
              );
            }

            return;
          }

          case "opponent_connected": {
            if (
              data.opponent
            ) {
              updateOpponent(
                data.opponent
              );
            }

            if (
              !state.gameStarted
            ) {
              setStatus(
                "Both players connected. Ready to start."
              );
            }

            return;
          }

          case "match_ready": {
            if (
              !state.gameStarted
            ) {
              state.playerReady =
                false;

              if (
                elements.startMatchButton
              ) {
                elements.startMatchButton.disabled =
                  false;

                elements.startMatchButton.style.display =
                  "block";

                elements.startMatchButton.textContent =
                  "Start Match";
              }

              setStatus(
                "Both players connected. Ready to start."
              );
            }

            return;
          }

          case "opponent_ready": {
            if (
              !state.gameStarted
            ) {
              setStatus(
                "Opponent is ready. Click Start Match when ready."
              );
            }

            return;
          }

          case "game_schedule": {
            console.log(
              "Next game scheduled:",
              data.nextGameAt
            );

            return;
          }

          case "game_start": {
            console.log(
              "Game state received from server:",
              data
            );

            /*
             * The normal startGame() function already
             * supports preserving answers when isResume
             * is true.
             */
            startGame(
              data.questions,
              data.startTime,
              isResume
            );

            return;
          }

          case "answer_update": {
            /*
             * Never expose opponent answers.
             */
            return;
          }

          case "opponent_submitted": {
            setStatus(
              "Opponent has submitted. Finish your answers."
            );

            return;
          }

          case "submission_received": {
            state.challengeSubmitted =
              true;

            state.submissionInProgress =
              false;

            if (
              elements.submitButton
            ) {
              elements.submitButton.disabled =
                true;
            }

            saveActiveMatchState();

            setStatus(
              data.automatic
                ? "Time expired. Waiting for opponent..."
                : "Answers submitted. Waiting for opponent..."
            );

            return;
          }

          case "game_result": {
            handleGameResult(
              data
            );

            return;
          }

          case "game_error": {
            console.error(
              "Game error:",
              data.message
            );

            state.resumeInProgress =
              false;

            state.reconnecting =
              false;

            setStatus(
              data.message ||
                "Unable to continue the match."
            );

            return;
          }

          case "opponent_left": {
            console.warn(
              "Opponent disconnected."
            );

            if (
              !state.gameFinished
            ) {
              setStatus(
                "Opponent disconnected. Your match can still be resumed if you reconnect."
              );
            }

            return;
          }

          default: {
            console.warn(
              "Unknown WebSocket message:",
              data
            );
          }
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

        disconnectManager.handleSocketError(
          error,
          isResume
        );
      }
    );

    socket.addEventListener(
      "close",
      event => {
        if (
          state.matchSocket !==
          socket
        ) {
          return;
        }

        disconnectManager.handleSocketClose(
          event,
          isResume
        );
      }
    );

    return socket;
  }

  async function resumeExistingMatch() {
    if (
      state.reconnecting
    ) {
      return;
    }

    const saved =
      getStoredActiveMatchState();

    const storedResumeMatchId =
      getStoredResumeMatchId();

    /*
     * Prefer the lightweight logical UUID.
     */
    const savedMatchId =
      storedResumeMatchId ||
      state.resumeMatchId ||
      saved?.matchId;

    if (
      !savedMatchId
    ) {
      console.error(
        "Resume requested but no saved match exists."
      );

      clearActiveMatchState();

      enableQueueButton();

      return;
    }

    if (
      saved
    ) {
      /*
       * restoreActiveMatchState() itself is
       * intentionally left in script.js because
       * it owns persistence.
       */
      if (
        typeof state.matchId !==
          "string" ||
        state.matchId !==
          savedMatchId
      ) {
        state.matchId =
          String(
            savedMatchId
          );

        state.resumeMatchId =
          String(
            savedMatchId
          );
      }

      state.playerId =
        saved.playerId ??
        state.playerId ??
        null;

      state.opponent =
        saved.opponent ??
        state.opponent ??
        null;

      state.questions =
        Array.isArray(
          saved.questions
        )
          ? saved.questions
          : state.questions;

      state.selectedAnswers =
        Array.isArray(
          saved.selectedAnswers
        )
          ? [
              ...saved.selectedAnswers
            ]
          : state.selectedAnswers;

      state.challengeDeadline =
        Number(
          saved.challengeDeadline
        ) || 0;

      state.timeRemaining =
        Number(
          saved.timeRemaining
        ) || 0;

      state.gameStarted =
        saved.gameStarted === true;

      state.playerReady =
        false;

      state.inQueue =
        false;

      state.challengeSubmitted =
        false;

      state.submissionInProgress =
        false;

      state.matchConnectionConfirmed =
        false;
    }

    state.matchId =
      String(
        savedMatchId
      );

    state.resumeMatchId =
      state.matchId;

    state.resumeAvailable =
      true;

    state.inQueue =
      false;

    state.playerReady =
      false;

    state.matchConnectionConfirmed =
      false;

    state.reconnecting =
      true;

    if (
      Array.isArray(
        state.questions
      ) &&
      state.questions.length > 0
    ) {
      state.gameStarted =
        true;

      state.newGameMode =
        false;

      state.challengeSubmitted =
        false;

      state.submissionInProgress =
        false;

      if (
        state.challengeDeadline >
        0
      ) {
        state.timeRemaining =
          Math.max(
            0,
            Math.ceil(
              (
                state.challengeDeadline -
                Date.now()
              ) / 1000
            )
          );
      }

      renderQuestions();

      restoreSelectedAnswerUI();

      updateSubmitButton();
    }

    if (
      !state.playerId
    ) {
      const player =
        await refreshPlayerStats();

      if (
        player?.id !==
          undefined &&
        player?.id !==
          null
      ) {
        state.playerId =
          String(
            player.id
          );
      }
    }

    if (
      !state.playerId
    ) {
      state.reconnecting =
        false;

      setStatus(
        "Unable to resume the match because your player ID could not be restored."
      );

      enableResumeGame(
        state.matchId
      );

      return;
    }

    if (
      elements.startMatchButton
    ) {
      elements.startMatchButton.disabled =
        true;

      elements.startMatchButton.style.display =
        "block";

      elements.startMatchButton.textContent =
        "Reconnecting...";
    }

    if (
      elements.submitButton
    ) {
      elements.submitButton.style.display =
        state.gameStarted
          ? "block"
          : "none";

      elements.submitButton.textContent =
        "Submit Answers";
    }

    setStatus(
      "Reconnecting to your existing match..."
    );

    saveActiveMatchState();

    console.log(
      "RESUME START:",
      {
        matchId:
          state.matchId,

        playerId:
          state.playerId,

        gameStarted:
          state.gameStarted,

        questionCount:
          state.questions.length,

        selectedAnswers:
          state.selectedAnswers
      }
    );

    connectToRoom(
      true
    );
  }

  function onMatchFound(
    isResume = false
  ) {
    console.log(
      "Match found/resuming:",
      {
        matchId:
          state.matchId,

        playerId:
          state.playerId,

        opponent:
          state.opponent,

        isResume
      }
    );

    connectToRoom(
      isResume
    );
  }

  return {
    sendRoomMessage,
    connectToRoom,
    resumeExistingMatch,
    onMatchFound,
    handleRoomState
  };
}