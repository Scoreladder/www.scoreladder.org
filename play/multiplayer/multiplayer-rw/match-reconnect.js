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
   * Gameplay callbacks supplied by game.js.
   */
  startGame,
  startMatchTimer,
  handleGameResult,
  handleSubmissionReceived,
  setAnswerSelectionLocked,

  disconnectManager
}) {


  /* =======================================================
     HELPERS
     ======================================================= */

  function clearReconnectState() {
    state.resumeInProgress =
      false;

    state.reconnecting =
      false;
  }


  function isSocketOpen() {
    return (
      state.matchSocket &&
      state.matchSocket.readyState ===
        WebSocket.OPEN
    );
  }


  /* =======================================================
     SEND ROOM MESSAGE
     ======================================================= */

  function sendRoomMessage(message) {
    if (!isSocketOpen()) {
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

    clearReconnectState();

    enableQueueButton();

    return;
  }


  /* =======================================================
     FINISHED
     ======================================================= */

  if (
    data.matchFinished ||
    data.roomStatus === "finished"
  ) {
    clearActiveMatchState();

    /*
     * The match is permanently finished.
     * Remove the logical match ID from live state so
     * it cannot be accidentally resumed or reused.
     */
    state.matchId =
      null;

    state.gameStarted =
      false;

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

    enableQueueButton();

    return;
  }


  /* =======================================================
     ACTIVE GAME
     ======================================================= */

  if (data.gameStarted) {
    state.gameStarted =
      true;

    state.matchFinished =
      false;

    state.inQueue =
      false;

    state.playerReady =
      false;

    state.newGameMode =
      false;

    state.matchConnectionConfirmed =
      true;

    /*
     * Do NOT clear resumeInProgress/reconnecting here
     * until the game has actually been restored.
     *
     * The game_start and answer_state messages complete
     * the restoration process.
     */

    /*
     * Only restore the authoritative server start time.
     */
    if (
      Number.isFinite(
        Number(data.startTime)
      ) &&
      Number(data.startTime) > 0
    ) {
      state.matchStartedAt =
        Number(data.startTime);
    }

    /*
     * IMPORTANT:
     *
     * Do NOT reset challengeSubmitted.
     *
     * The locally persisted value must survive the initial
     * room_state message. The server's answer_state and
     * submission_received messages will correct it when
     * authoritative information arrives.
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


  /* =======================================================
     BOTH PLAYERS CONNECTED, GAME NOT STARTED
     ======================================================= */

  if (
    data.opponentConnected ||
    data.connectedCount === 2 ||
    data.roomStatus === "both_connected"
  ) {
    if (!state.gameStarted) {
      clearReconnectState();

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


  /* =======================================================
     ONLY ONE PLAYER CONNECTED
     ======================================================= */

  if (
    data.roomStatus ===
    "waiting_for_opponent"
  ) {
    /*
     * The room itself is still valid.
     *
     * Do not clear the persisted match merely because
     * the opponent has not connected yet.
     */
    clearReconnectState();

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

      clearReconnectState();

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
  setStatus(
    "Reconnected. Restoring your match..."
  );

  /*
   * The WebSocket is now successfully connected.
   * Keep resumeInProgress/reconnecting active until
   * room_state or game_start confirms the match state.
   *
   * Do not start another reconnect from here.
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
              clearReconnectState();

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

              clearReconnectState();

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


  /* -------------------------------------------------
     RESTORE ANSWERS
     -------------------------------------------------

     The server may send either:

     1. A complete answers array:
        answers: ["A", "C", null, ...]

     2. A single question update:
        questionIndex: 1
        answer: "C"

     Never replace the entire local answer array with
     a partial update.
  */

  if (
    Array.isArray(data.answers)
  ) {
    /*
     * If the server supplied a complete answer array,
     * use it as the authoritative state.
     *
     * Preserve the existing array length so question
     * selections do not disappear because of a shorter
     * server payload.
     */
    const currentAnswers =
      Array.isArray(state.selectedAnswers)
        ? [...state.selectedAnswers]
        : [];

    const incomingAnswers =
      data.answers;

    const answerCount =
      Math.max(
        currentAnswers.length,
        incomingAnswers.length,
        Array.isArray(state.questions)
          ? state.questions.length
          : 0
      );

    const mergedAnswers =
      new Array(answerCount).fill(null);

    for (
      let i = 0;
      i < answerCount;
      i++
    ) {
      /*
       * An explicitly supplied server value is
       * authoritative, including null when the server
       * explicitly cleared that question.
       */
      if (
        i < incomingAnswers.length
      ) {
        mergedAnswers[i] =
          incomingAnswers[i];
      } else {
        /*
         * Do not erase an existing local selection merely
         * because this payload did not contain that index.
         */
        mergedAnswers[i] =
          currentAnswers[i] ?? null;
      }
    }

    state.selectedAnswers =
      mergedAnswers;
  }


  /* -------------------------------------------------
     SINGLE ANSWER UPDATE
     ------------------------------------------------- */

  if (
    Number.isInteger(
      data.questionIndex
    )
  ) {
    const index =
      data.questionIndex;

    if (
      !Array.isArray(
        state.selectedAnswers
      )
    ) {
      state.selectedAnswers = [];
    }

    /*
     * Ensure the array is large enough.
     */
    while (
      state.selectedAnswers.length <=
      index
    ) {
      state.selectedAnswers.push(
        null
      );
    }

    /*
     * Support both:
     *
     * answer
     * selectedAnswer
     */
    if (
      Object.prototype.hasOwnProperty.call(
        data,
        "answer"
      )
    ) {
      state.selectedAnswers[index] =
        data.answer;
    } else if (
      Object.prototype.hasOwnProperty.call(
        data,
        "selectedAnswer"
      )
    ) {
      state.selectedAnswers[index] =
        data.selectedAnswer;
    }
  }


  /* -------------------------------------------------
     SUBMISSION STATE
     ------------------------------------------------- */

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
     * Only unlock when the server explicitly tells us
     * that the player has not submitted.
     */
    if (
      data.submitted === false
    ) {
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
  }


  /*
   * Persist the complete accumulated answer state.
   */
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
  /*
   * A game_result is authoritative evidence that
   * this match has completed.
   *
   * Clear the persisted resume state immediately so
   * refreshing the page cannot resurrect this match.
   */
  clearActiveMatchState();

  state.matchFinished =
    true;

  state.gameStarted =
    false;

  state.resumeAvailable =
    false;

  state.resumeMatchId =
    null;

  state.resumeInProgress =
    false;

  state.reconnecting =
    false;

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

            clearReconnectState();

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
              !state.matchFinished
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

        /*
         * Fallback if the disconnect manager is unavailable.
         */
        clearReconnectState();

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
         * Fallback if the disconnect manager is unavailable.
         *
         * Preserve any unfinished match, including matches
         * where the player has already submitted but the
         * opponent has not finished yet.
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
         * Preserve a matched-but-not-started room.
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

      /*
       * matchFinished is the single authoritative
       * client-side finished flag.
       */
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
      clearReconnectState();

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