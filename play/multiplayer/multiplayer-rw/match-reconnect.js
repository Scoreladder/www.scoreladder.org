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
   * Gameplay/UI callbacks supplied by game.js.
   */
  startGame,
  startMatchTimer,
  handleGameResult,
  handleSubmissionReceived,
  setAnswerSelectionLocked,

  disconnectManager
}) {


  /* =======================================================
     SEND ROOM MESSAGE
     ======================================================= */

  function sendRoomMessage(message) {
    if (
      !state.matchSocket ||
      state.matchSocket.readyState !== WebSocket.OPEN
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

  function handleRoomState(data) {
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
      Array.isArray(data.registeredPlayers) &&
      state.playerId &&
      !data.registeredPlayers
        .map(String)
        .includes(
          String(state.playerId)
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

      state.resumeInProgress =
        false;

      enableQueueButton();

      return;
    }


    /* =====================================================
       FINISHED
       ===================================================== */

    if (
      data.gameFinished ||
      data.roomStatus === "finished"
    ) {
      clearActiveMatchState();

      state.gameStarted =
        false;

      state.gameFinished =
        true;

      state.matchFinished =
        true;

      state.reconnecting =
        false;

      state.resumeInProgress =
        false;

      state.resumeAvailable =
        false;

      state.resumeMatchId =
        null;

      return;
    }


    /* =====================================================
       ACTIVE GAME
       ===================================================== */

    if (data.gameStarted) {
      state.gameStarted =
        true;

      state.gameFinished =
        false;

      state.matchFinished =
        false;

      state.inQueue =
        false;

      state.playerReady =
        false;

      state.newGameMode =
        false;

      /*
       * The connection itself is confirmed.
       */
      state.matchConnectionConfirmed =
        true;

      state.reconnecting =
        false;

      /*
       * Restore the authoritative server start time.
       */
      if (
        Number.isFinite(
          Number(data.startTime)
        )
      ) {
        state.matchStartedAt =
          Number(data.startTime);

        state.challengeDeadline =
          Number(data.startTime) +
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
       * game.js owns rebuilding the actual game UI.
       *
       * IMPORTANT:
       * Do not reset challengeSubmitted here.
       *
       * game.js will preserve the locally-known submission
       * state during a resume, while answer_state/
       * submission_received provides authoritative state.
       */
      if (
        typeof startGame ===
        "function"
      ) {
        startGame(
          Array.isArray(data.questions)
            ? data.questions
            : state.questions,

          data.startTime,

          true
        );
      } else {
        /*
         * Fallback only.
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
            state.challengeSubmitted
              ? "Answers Submitted"
              : "Submit Answers";

          elements.submitButton.disabled =
            state.challengeSubmitted;
        }

        if (
          Number.isFinite(
            Number(data.startTime)
          ) &&
          typeof startMatchTimer ===
            "function"
        ) {
          startMatchTimer(
            Number(data.startTime)
          );
        }

        setStatus(
          state.challengeSubmitted
            ? "Answers submitted. Waiting for opponent..."
            : "Match resumed. Continue where you left off."
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
      data.roomStatus === "both_connected"
    ) {
      if (!state.gameStarted) {
        state.reconnecting =
          false;

        state.resumeInProgress =
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

      state.resumeInProgress =
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
       CLOSE OLD SOCKET
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
          state.matchSocket !== socket
        ) {
          return;
        }

        console.log(
          "WebSocket connected."
        );

        state.matchConnectionConfirmed =
          true;

        if (isResume) {
          state.reconnecting =
            true;

          setStatus(
            "Reconnected. Restoring your match..."
          );

          /*
           * Ask the Durable Object for authoritative state.
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
          state.matchSocket !== socket
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


        switch (data.type) {


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
              data.playerId !== undefined &&
              data.playerId !== null
            ) {
              state.playerId =
                String(
                  data.playerId
                );
            }

            if (data.opponent) {
              updateOpponent(
                data.opponent
              );
            }

            state.matchConnectionConfirmed =
              true;

            if (isResume) {
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
            if (data.opponent) {
              updateOpponent(
                data.opponent
              );
            }

            if (
              !state.gameStarted
            ) {
              state.reconnecting =
                false;

              state.resumeInProgress =
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

              state.resumeInProgress =
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
             ANSWER STATE
             =============================================== */

          case "answer_state": {
            /*
             * Ignore answer state belonging to another player.
             */
            if (
              data.playerId !== undefined &&
              data.playerId !== null &&
              String(data.playerId) !==
                String(state.playerId)
            ) {
              return;
            }

            /*
             * Restore the server's current answer state.
             */
            if (
              Array.isArray(data.answers)
            ) {
              state.selectedAnswers =
                [
                  ...data.answers
                ];
            }

            /*
             * The server is authoritative about submission.
             */
            if (
              data.submitted === true
            ) {
              state.challengeSubmitted =
                true;

              state.submissionInProgress =
                false;

              if (
                typeof setAnswerSelectionLocked ===
                "function"
              ) {
                setAnswerSelectionLocked(
                  true
                );
              }

              setStatus(
                "Answers submitted. Waiting for the match to finish..."
              );
            } else {
              /*
               * Only clear submission state if the server
               * explicitly says the player has NOT submitted.
               *
               * This prevents unrelated reconnect messages
               * from accidentally unlocking an already-submitted
               * match.
               */
              state.challengeSubmitted =
                false;

              state.submissionInProgress =
                false;

              if (
                typeof setAnswerSelectionLocked ===
                "function"
              ) {
                setAnswerSelectionLocked(
                  false
                );
              }
            }

            saveActiveMatchState();

            return;
          }


          /* ===============================================
             ANSWER UPDATE
             =============================================== */

          case "answer_update": {
            /*
             * Never expose opponent answers.
             *
             * The server may use this message only to tell
             * the opponent that an answer changed.
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
            console.log(
              "Submission accepted by server:",
              data
            );

            /*
             * THIS is the authoritative acknowledgement
             * that our own submission was accepted.
             *
             * Do not mark challengeSubmitted when the
             * submit button is clicked.
             */
            state.submissionInProgress =
              false;

            state.challengeSubmitted =
              true;

            /*
             * Permanently lock answer selection for this
             * match.
             */
            if (
              typeof setAnswerSelectionLocked ===
              "function"
            ) {
              setAnswerSelectionLocked(
                true
              );
            }

            saveActiveMatchState();

            /*
             * game.js owns submission-specific UI.
             */
            if (
              typeof handleSubmissionReceived ===
              "function"
            ) {
              handleSubmissionReceived(
                data
              );
            }

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
          state.matchSocket !== socket
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

          return;
        }

        state.resumeInProgress =
          false;

        state.reconnecting =
          false;

        if (isResume) {
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
    );


    /* =====================================================
       CLOSE
       ===================================================== */

    socket.addEventListener(
      "close",
      event => {
        if (
          state.matchSocket !== socket
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
         *
         * IMPORTANT:
         *
         * If the player has already submitted, the match
         * must STILL be resumable. Otherwise a refresh after
         * submission could destroy the ability to reconnect
         * to the unfinished match.
         */
        if (
          state.gameStarted &&
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

    /*
     * No saved match means there is nothing to resume.
     */
    if (!savedMatchId) {
      console.error(
        "Resume requested but no saved match exists."
      );

      clearActiveMatchState();

      enableQueueButton();

      return;
    }

    /*
     * Restore the persisted logical match state.
     *
     * Do NOT render the game here.
     *
     * game.js receives the authoritative game_start /
     * room_state payload and rebuilds the UI.
     */
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

    if (saved) {
      if (
        saved.playerId !== undefined &&
        saved.playerId !== null
      ) {
        state.playerId =
          String(
            saved.playerId
          );
      }

      if (saved.opponent) {
        state.opponent =
          saved.opponent;
      }

      if (
        Array.isArray(
          saved.questions
        )
      ) {
        state.questions =
          saved.questions;
      }

      if (
        Array.isArray(
          saved.selectedAnswers
        )
      ) {
        state.selectedAnswers =
          [
            ...saved.selectedAnswers
          ];
      }

      if (
        Number.isFinite(
          Number(
            saved.challengeDeadline
          )
        )
      ) {
        state.challengeDeadline =
          Number(
            saved.challengeDeadline
          );
      }

      if (
        Number.isFinite(
          Number(
            saved.matchStartedAt
          )
        )
      ) {
        state.matchStartedAt =
          Number(
            saved.matchStartedAt
          );
      }

      if (
        Number.isFinite(
          Number(
            saved.timeRemaining
          )
        )
      ) {
        state.timeRemaining =
          Number(
            saved.timeRemaining
          );
      }

      state.gameStarted =
        saved.gameStarted === true;

      /*
       * A refresh must NEVER leave the UI stuck in
       * "Submitting...".
       *
       * The server will tell us whether the submission
       * was actually accepted.
       */
      state.submissionInProgress =
        false;

      /*
       * Preserve the locally persisted submission state.
       *
       * Do NOT reset this during resume.
       */
      state.challengeSubmitted =
        saved.challengeSubmitted === true;

      state.gameFinished =
        saved.gameFinished === true;

      state.matchFinished =
        saved.matchFinished === true;
    }

    /*
     * This is a reconnect, NOT a new queue operation.
     */
    state.inQueue =
      false;

    state.playerReady =
      false;

    state.matchConnectionConfirmed =
      false;

    state.reconnecting =
      true;

    state.resumeInProgress =
      true;

    /*
     * Make sure we have the authenticated player's ID.
     */
    if (!state.playerId) {
      const player =
        await refreshPlayerStats();

      if (
        player?.id !== undefined &&
        player?.id !== null
      ) {
        state.playerId =
          String(
            player.id
          );
      }
    }

    /*
     * Without a player ID we cannot establish the
     * player-specific room connection.
     */
    if (!state.playerId) {
      state.reconnecting =
        false;

      state.resumeInProgress =
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
     * Show reconnecting state.
     */
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
        "none";

      elements.submitButton.disabled =
        true;
    }

    setStatus(
      "Reconnecting to your existing match..."
    );

    /*
     * Persist restored logical state before connecting.
     */
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
          Array.isArray(
            state.questions
          )
            ? state.questions.length
            : 0,

        selectedAnswers:
          state.selectedAnswers,

        challengeSubmitted:
          state.challengeSubmitted,

        submissionInProgress:
          state.submissionInProgress
      }
    );

    /*
     * The connection layer is responsible for:
     *
     * - reconnecting to the Durable Object
     * - requesting room state
     * - receiving game_start
     * - passing game_start to game.js
     *
     * game.js then renders the questions and restores
     * selected answers.
     */
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