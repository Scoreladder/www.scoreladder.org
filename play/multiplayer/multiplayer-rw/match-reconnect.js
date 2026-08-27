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
 * - submission UI
 * - result rendering
 *
 * Gameplay functions are supplied as callbacks.
 */


/* =========================================================
   RECONNECT MANAGER
   ========================================================= */

export function createReconnectManager({
  API,
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

  /*
   * Gameplay callbacks.
   *
   * These are supplied by game.js through script.js.
   */
  startGame,
  startMatchTimer,
  handleGameResult,

  disconnectManager
}) {
  /* =======================================================
     SEND ROOM MESSAGE
     ======================================================= */

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


  /* =======================================================
     ROOM STATE
     ======================================================= */

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


    /* =====================================================
       FINISHED
       ===================================================== */

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


    /* =====================================================
       ACTIVE GAME
       ===================================================== */

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

      /*
       * Do NOT blindly force challengeSubmitted=false
       * if the server already says this player submitted.
       *
       * The actual submission state remains controlled by
       * the submission_received message.
       */
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
       * Tell the gameplay module that the room is active.
       *
       * game.js owns rendering/restoring questions.
       */
      if (
        typeof startGame ===
        "function"
      ) {
        startGame(
          Array.isArray(
            data.questions
          )
            ? data.questions
            : state.questions,

          data.startTime,

          true
        );
      } else {
        /*
         * Fallback in case the room_state does not contain
         * questions and game.js must use locally saved state.
         */
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
          data.startTime &&
          typeof startMatchTimer ===
            "function"
        ) {
          startMatchTimer(
            data.startTime
          );
        }

        setStatus(
          "Match resumed. Continue where you left off."
        );

        saveActiveMatchState();
      }

      return;
    }


    /* =====================================================
       BOTH PLAYERS CONNECTED, GAME NOT STARTED
       ===================================================== */

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


    /* =====================================================
       ONLY ONE PLAYER CONNECTED
       ===================================================== */

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


  /* =======================================================
     CONNECT TO ROOM
     ======================================================= */

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

      return null;
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
     * state.matchId is the logical matchmaking UUID.
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


    /* -----------------------------------------------------
       Close old socket
       ----------------------------------------------------- */

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


    /* =====================================================
       OPEN
       ===================================================== */

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

          /*
           * Ask the room for authoritative state.
           */
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


    /* =====================================================
       MESSAGE
       ===================================================== */

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

          /* ===============================================
             CONNECTED
             =============================================== */

          case "connected": {
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

            /*
             * NEVER copy data.matchId into state.matchId.
             */
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


          /* ===============================================
             ROOM STATE
             =============================================== */

          case "room_state": {
            handleRoomState(
              data
            );

            return;
          }


          /* ===============================================
             WAITING
             =============================================== */

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


          /* ===============================================
             OPPONENT CONNECTED
             =============================================== */

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
              state.reconnecting =
                false;

              setStatus(
                "Both players connected. Ready to start."
              );
            }

            return;
          }


          /* ===============================================
             MATCH READY
             =============================================== */

          case "match_ready": {
            if (
              !state.gameStarted
            ) {
              state.playerReady =
                false;

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


          /* ===============================================
             OPPONENT READY
             =============================================== */

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


          /* ===============================================
             GAME SCHEDULE
             =============================================== */

          case "game_schedule": {
            console.log(
              "Next game scheduled:",
              data.nextGameAt
            );

            return;
          }


          /* ===============================================
             GAME START
             =============================================== */

          case "game_start": {
            console.log(
              "Game state received from server:",
              data
            );

            if (
              typeof startGame ===
              "function"
            ) {
              startGame(
                data.questions,
                data.startTime,
                isResume
              );
            }

            return;
          }


          /* ===============================================
             ANSWER UPDATE
             =============================================== */

          case "answer_update": {
            /*
             * Never expose opponent answers.
             */
            return;
          }


          /* ===============================================
             OPPONENT SUBMITTED
             =============================================== */

          case "opponent_submitted": {
            setStatus(
              "Opponent has submitted. Finish your answers."
            );

            return;
          }


          /* ===============================================
             SUBMISSION RECEIVED
             =============================================== */

          case "submission_received": {
            /*
             * The server has accepted this player's
             * submission.
             */
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


          /* ===============================================
             GAME RESULT
             =============================================== */

          case "game_result": {
            if (
              typeof handleGameResult ===
              "function"
            ) {
              handleGameResult(
                data
              );
            }

            return;
          }


          /* ===============================================
             GAME ERROR
             =============================================== */

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


          /* ===============================================
             OPPONENT LEFT
             =============================================== */

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


          /* ===============================================
             UNKNOWN
             =============================================== */

          default: {
            console.warn(
              "Unknown WebSocket message:",
              data
            );
          }
        }
      }
    );


    /* =====================================================
       ERROR
       ===================================================== */

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

        if (
          disconnectManager &&
          typeof disconnectManager.handleSocketError ===
            "function"
        ) {
          disconnectManager.handleSocketError(
            error,
            isResume
          );
        } else {
          state.resumeInProgress =
            false;

          state.reconnecting =
            false;

          if (
            isResume
          ) {
            setStatus(
              "Unable to reconnect to your match."
            );

            enableResumeGame(
              state.matchId
            );
          } else {
            setStatus(
              "Connection to match failed."
            );
          }
        }
      }
    );


    /* =====================================================
       CLOSE
       ===================================================== */

    socket.addEventListener(
      "close",
      event => {
        if (
          state.matchSocket !==
          socket
        ) {
          return;
        }

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


        if (
          disconnectManager &&
          typeof disconnectManager.handleSocketClose ===
            "function"
        ) {
          disconnectManager.handleSocketClose(
            event,
            isResume
          );

          return;
        }


        /*
         * Preserve unfinished match.
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

          enableResumeGame(
            state.matchId
          );

          return;
        }


        /*
         * Preserve matched-but-not-started room.
         */
        if (
          state.matchId &&
          !state.challengeSubmitted &&
          !state.newGameMode
        ) {
          saveActiveMatchState();

          enableResumeGame(
            state.matchId
          );
        }
      }
    );

    return socket;
  }


  /* =======================================================
     RESUME EXISTING MATCH
     ======================================================= */

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


    /*
     * Restore persisted state manually here.
     *
     * Persistence itself remains owned by script.js.
     */
    if (
      saved
    ) {
      state.matchId =
        String(
          savedMatchId
        );

      state.resumeMatchId =
        String(
          savedMatchId
        );

      state.resumeAvailable =
        true;

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
        saved.gameStarted ===
        true;

      state.challengeSubmitted =
        false;

      state.submissionInProgress =
        false;
    } else {
      state.matchId =
        String(
          savedMatchId
        );

      state.resumeMatchId =
        state.matchId;

      state.resumeAvailable =
        true;
    }


    state.inQueue =
      false;

    state.playerReady =
      false;

    state.matchConnectionConfirmed =
      false;

    state.reconnecting =
      true;


    /*
     * Make sure we have the authenticated player ID.
     */
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


    /*
     * Rebuild the local UI immediately if questions were
     * saved before the refresh.
     *
     * Actual rendering belongs to game.js.
     *
     * We intentionally do NOT call renderQuestions()
     * from this module.
     */
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


  /* =======================================================
     MATCH FOUND
     ======================================================= */

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

    return connectToRoom(
      isResume
    );
  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  return {
    sendRoomMessage,
    connectToRoom,
    resumeExistingMatch,
    onMatchFound,
    handleRoomState
  };
}