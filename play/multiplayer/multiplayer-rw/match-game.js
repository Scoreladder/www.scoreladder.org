import {
  state,
  TOTAL_QUESTIONS,
  MATCH_DURATION_MS,
  normalizeTopic,
  getTopicDisplayName,
  saveActiveMatchState,
  clearActiveMatchState,
  stopMatchTimer,
  clearMatchTimer,
  getCooldownRemainingMs,
  formatCountdown,
  isCoolingDown,
  startCooldownTimer,
  beginCooldown,
  clearCooldown,
  COOLDOWN_DURATION_MS
} from "./match-state.js";

import {
  elements,
  setStatus,
  showResult,
  escapeHtml,
  formatPassage,
  appendTopicRow,
  updateOpponent,
  refreshPlayerStats,
  loadRecentMatches,
  updateCooldownUI
} from "./match-ui.js";

import {
  initializeMatchConnectionModules,
  sendRoomMessage
} from "./match-connection.js";


/* =========================================================
   GAME START
   ========================================================= */

export function handleGameStart(
  data,
  isResume = false
) {
  console.log(
    "GAME START RECEIVED:",
    data,
    "isResume:",
    isResume
  );

  /*
   * A match that has already received its final result
   * must never be started again.
   *
   * This protects against a stale game_start message
   * arriving after handleGameResult() has already
   * finished the match and stopped its timer.
   */
  if (
    state.matchFinished
  ) {
    console.warn(
      "Ignoring game_start for a match that is already finished.",
      {
        matchId: state.matchId,
        isResume,
        data
      }
    );

    return;
  }

  const questions =
      Array.isArray(data)
      ? data
      : data &&
        Array.isArray(data.questions)
        ? data.questions
        : null;

  if (!questions) {
    console.error(
      "Invalid game_start payload:",
      data
    );

    setStatus(
      "The server sent an invalid question set."
    );

    return;
  }

  /*
   * The server's startTime is authoritative.
   *
   * For a direct question-array payload, use the
   * already-restored matchStartedAt.
   */
  const rawStartTime =
    Array.isArray(data)
      ? state.matchStartedAt
      : data?.startTime;

  const startTime =
    Number(rawStartTime);

  if (
    !Number.isFinite(startTime) ||
    startTime <= 0
  ) {
    console.error(
      "Invalid match start time:",
      rawStartTime
    );

    setStatus(
      "Unable to start match timer."
    );

    return;
  }

  if (
    questions.length !==
    TOTAL_QUESTIONS
  ) {
    console.error(
      "Unexpected question count:",
      questions.length,
      "Expected:",
      TOTAL_QUESTIONS
    );

    setStatus(
      `The server sent ${questions.length} questions instead of ${TOTAL_QUESTIONS}.`
    );

    return;
  }

  /*
   * ---------------------------------------------------------
   * PRESERVE LOCAL ANSWERS DURING RESUME
   * ---------------------------------------------------------
   */

  const savedAnswers =
    Array.isArray(state.selectedAnswers)
      ? [...state.selectedAnswers]
      : [];

  state.questions =
    questions
      .slice(0, TOTAL_QUESTIONS)
      .map(question => {
        const choices =
          Array.isArray(question?.choices)
            ? question.choices
            : Object.values(
                question?.choices || {}
              );

        return {
          ...question,
          choices,
          originalTopic: question.topic,
          topic: normalizeTopic(
            question.topic
          )
        };
      });

  if (
    isResume &&
    savedAnswers.length ===
      state.questions.length
  ) {
    state.selectedAnswers =
      savedAnswers;
  } else {
    state.selectedAnswers =
      new Array(
        state.questions.length
      ).fill(-1);
  }

  /*
   * ---------------------------------------------------------
   * MATCH STATE
   * ---------------------------------------------------------
   */

  state.inQueue = false;
  state.playerReady = false;
  state.gameStarted = true;
  state.matchFinished = false;
  state.newGameMode = false;
  state.reconnecting = false;
  state.matchConnectionConfirmed = true;

  if (!isResume) {
    state.challengeSubmitted = false;
    state.submissionInProgress = false;
  }

  /*
   * ---------------------------------------------------------
   * AUTHORITATIVE MATCH START
   * ---------------------------------------------------------
   */

  state.matchStartedAt =
    startTime;

  state.challengeDeadline =
    startTime +
    MATCH_DURATION_MS;

  /*
   * Calculate immediately from the deadline.
   *
   * This prevents the displayed timer from starting at
   * a locally assumed 13:00.
   */
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

  /*
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */

  if (elements.submitButton) {
    elements.submitButton.style.display =
      "block";

    elements.submitButton.textContent =
      state.challengeSubmitted
        ? "Answers Submitted"
        : "Submit Answers";

    elements.submitButton.disabled =
      state.challengeSubmitted ||
      state.submissionInProgress;
  }

  if (elements.startMatchButton) {
    elements.startMatchButton.disabled =
      true;

    elements.startMatchButton.style.display =
      "none";
  }

  if (elements.resultDiv) {
    elements.resultDiv.innerHTML = "";
  }

  renderQuestions();
  restoreSelectedAnswerUI();

  /*
   * ---------------------------------------------------------
   * TIMER
   * ---------------------------------------------------------
   */

  startMatchTimer(
    startTime
  );

  setStatus(
    state.challengeSubmitted
      ? "Answers submitted. Waiting for opponent..."
      : isResume
        ? "Match resumed. Continue where you left off."
        : "Match started. Answer all questions before time expires."
  );

  updateSubmitButton();
  saveActiveMatchState();

  console.log(
    isResume
      ? "RESUME GAME RESTORED:"
      : "NEW GAME STARTED:",
    {
      matchId: state.matchId,
      matchStartedAt: state.matchStartedAt,
      challengeDeadline: state.challengeDeadline,
      timeRemaining: state.timeRemaining,
      questionCount: state.questions.length,
      selectedAnswers: state.selectedAnswers,
      challengeSubmitted:
        state.challengeSubmitted,
      matchFinished:
        state.matchFinished
    }
  );
}


/* =========================================================
   START GAME ADAPTER
   ========================================================= */

export function startGame(
  questions,
  startTime,
  isResume = false
) {
  handleGameStart(
    {
      questions,
      startTime
    },
    isResume
  );
}


/* =========================================================
   RESUME GAME STATE
   ========================================================= */

export function startResumedGame(
  questions,
  startTime
) {
  startGame(
    questions,
    startTime,
    true
  );
}


/* =========================================================
   TIMER
   ========================================================= */

export function startMatchTimer(
  serverStartTime
) {
  /*
   * Never start a timer for a match that has already
   * been definitively finished.
   *
   * This is intentionally checked here as well as in
   * handleGameStart(), because other connection/reconnect
   * code can call startMatchTimer() directly.
   */
  if (
    state.matchFinished ||
    !state.gameStarted
  ) {
    console.warn(
      "Ignoring timer start because match is not active.",
      {
        matchId: state.matchId,
        gameStarted: state.gameStarted,
        matchFinished: state.matchFinished,
        serverStartTime
      }
    );

    stopMatchTimer();

    return;
  }

  stopMatchTimer();

  const startTime =
    Number(serverStartTime);

  if (
    !Number.isFinite(startTime) ||
    startTime <= 0
  ) {
    console.error(
      "Invalid server start time:",
      serverStartTime
    );

    setStatus(
      "Unable to start timer."
    );

    return;
  }

  state.matchStartedAt =
    startTime;

  state.challengeDeadline =
    startTime +
    MATCH_DURATION_MS;
  
  state.matchStartedAt =
    startTime;

  const update = () => {
    /*
     * The match may have finished while this interval
     * was running.
     *
     * Immediately kill the timer instead of allowing
     * another tick or automatic submission.
     */
    if (
      state.matchFinished ||
      !state.gameStarted
    ) {
      stopMatchTimer();
      return;
    }

    const remainingMs =
      state.challengeDeadline -
      Date.now();

    const remainingSeconds =
      Math.max(
        0,
        Math.ceil(
          remainingMs / 1000
        )
      );

    state.timeRemaining =
      remainingSeconds;

    updateMatchTimer();

    if (
      remainingMs <= 0
    ) {
      stopMatchTimer();

      if (
        state.gameStarted &&
        !state.challengeSubmitted &&
        !state.submissionInProgress &&
        !state.matchFinished
      ) {
        submitMatch(true);
      }
    }
  };

  /*
   * Update immediately rather than waiting for the first
   * interval tick.
   */
  update();

  /*
   * update() can stop the timer immediately if the match
   * became inactive between the checks above.
   */
  if (
    state.matchFinished ||
    !state.gameStarted
  ) {
    return;
  }

  state.timerInterval =
    setInterval(
      update,
      250
    );
}

function updateMatchTimer() {
  if (
    !elements.timerDiv ||
    !state.gameStarted
  ) {
    return;
  }

  const remainingSeconds =
    Math.max(
      0,
      Math.ceil(
        (
          state.challengeDeadline -
          Date.now()
        ) / 1000
      )
    );

  state.timeRemaining =
    remainingSeconds;

  elements.timerDiv.textContent =
    formatCountdown(
      remainingSeconds
    );
}


/* =========================================================
   QUESTIONS
   ========================================================= */

export function renderQuestions() {
  console.log("RENDER QUESTIONS CALLED");
  if (
    !elements.questionsDiv
  ) {
    return;
  }

  elements.questionsDiv.innerHTML = "";

  state.questions.forEach(
    (
      q,
      questionIndex
    ) => {
      const card =
        document.createElement("div");

      card.className = "card";

      const questionNumber =
        document.createElement("div");

      questionNumber.className =
        "question-number";

      questionNumber.textContent =
        `Question ${questionIndex + 1}`;

      card.appendChild(
        questionNumber
      );

      const meta =
        document.createElement("div");

      meta.className = "meta";

      meta.textContent =
        `${getTopicDisplayName(q.topic)}` +
        `${
          q.difficulty
            ? " • " + q.difficulty
            : ""
        }`;

      card.appendChild(meta);

      if (q.passage) {
        const passage =
          document.createElement("div");

        passage.className = "passage";

        passage.innerHTML =
          formatPassage(
            q.passage
          );

        card.appendChild(passage);
      }

      const questionText =
        document.createElement("p");

      questionText.textContent =
        q.question || "";

      card.appendChild(
        questionText
      );

      const choices =
        Array.isArray(q.choices)
          ? q.choices
          : Object.values(
              q.choices || {}
            );

      choices.forEach(
        (
          choice,
          choiceIndex
        ) => {
          const button =
            document.createElement("button");

          button.className = "choice";
          button.type = "button";

          const letter =
            ["A", "B", "C", "D"][
              choiceIndex
            ] || "?";

          const text =
            typeof choice === "object"
              ? (
                  choice.text ??
                  choice.value ??
                  ""
                )
              : choice;

          button.innerHTML = `
            <span class="choice-letter">
              ${letter}.
            </span>
            ${escapeHtml(text)}
          `;

          button.addEventListener(
            "click",
            () => {
              selectAnswer(
                questionIndex,
                choiceIndex
              );
            }
          );

          card.appendChild(button);
        }
      );

      elements.questionsDiv.appendChild(
        card
      );
    }
  );
}


/* =========================================================
   RESTORE SELECTED ANSWERS
   ========================================================= */

export function restoreSelectedAnswerUI() {
  if (
    !elements.questionsDiv
  ) {
    return;
  }

  state.selectedAnswers.forEach(
    (
      choiceIndex,
      questionIndex
    ) => {
      if (
        !Number.isInteger(
          choiceIndex
        ) ||
        choiceIndex < 0
      ) {
        return;
      }

      const card =
        elements.questionsDiv
          .children[
            questionIndex
          ];

      const buttons =
        card?.querySelectorAll(
          ".choice"
        );

      if (
        buttons?.[choiceIndex]
      ) {
        buttons[
          choiceIndex
        ].classList.add(
          "selected"
        );
      }
    }
  );

  /*
   * Submitted or finished matches remain locked after
   * the page is refreshed and the UI is rebuilt.
   */
  if (
    state.challengeSubmitted ||
    state.submissionInProgress ||
    state.matchFinished
  ) {
    lockAnswerButtons();
  }
}


/* =========================================================
   ANSWER BUTTON LOCK
   ========================================================= */

function lockAnswerButtons() {
  if (
    !elements.questionsDiv
  ) {
    return;
  }

  const choiceButtons =
    elements.questionsDiv.querySelectorAll(
      ".choice"
    );

  choiceButtons.forEach(
    button => {
      button.disabled = true;
    }
  );
}


/* =========================================================
   ANSWER BUTTON UNLOCK
   ========================================================= */

function unlockAnswerButtons() {
  if (
    !elements.questionsDiv
  ) {
    return;
  }

  const choiceButtons =
    elements.questionsDiv.querySelectorAll(
      ".choice"
    );

  choiceButtons.forEach(
    button => {
      button.disabled = false;
    }
  );
}


/* =========================================================
   ANSWERS
   ========================================================= */

export function selectAnswer(
  questionIndex,
  choiceIndex
) {
  console.log("SELECT ANSWER CLICKED", {
    questionIndex,
    choiceIndex,
    gameStarted: state.gameStarted,
    challengeSubmitted: state.challengeSubmitted,
    submissionInProgress: state.submissionInProgress,
    matchFinished: state.matchFinished,
    answerSelectionLocked: state.answerSelectionLocked,
    selectedAnswers: state.selectedAnswers
  });

  if (
    !state.gameStarted ||
    state.challengeSubmitted ||
    state.submissionInProgress ||
    state.matchFinished
  ) {
    console.warn("ANSWER BLOCKED");
    return;
  }
  /*
   * HARD CLIENT-SIDE LOCK.
   *
   * Answers cannot be changed after submission,
   * during submission, or after the match finishes.
   */
  if (
    !state.gameStarted ||
    state.challengeSubmitted ||
    state.submissionInProgress ||
    state.matchFinished
  ) {
    return;
  }

  if (
    questionIndex < 0 ||
    questionIndex >=
      state.selectedAnswers.length
  ) {
    return;
  }

  state.selectedAnswers[
    questionIndex
  ] = choiceIndex;
  console.log("ANSWER STATE:", [...state.selectedAnswers]);

  const card =
    elements.questionsDiv?.children[
      questionIndex
    ];

  if (!card) {
    return;
  }

  const buttons =
    card.querySelectorAll(
      ".choice"
    );

  buttons.forEach(
    button => {
      button.classList.remove(
        "selected"
      );
    }
  );

  if (
    buttons[choiceIndex]
  ) {
    buttons[
      choiceIndex
    ].classList.add(
      "selected"
    );
    console.log(
  "SELECTED CLASS:",
  buttons[choiceIndex].className
);
  }

  saveActiveMatchState();
  updateSubmitButton();

  /*
   * Only notify the server that this question was answered.
   * Never send the actual answer through answer_update.
   */
  sendRoomMessage({
    type: "answer_update",
    questionIndex
  });
}


/* =========================================================
   SUBMIT BUTTON
   ========================================================= */

export function updateSubmitButton() {
  if (
    !elements.submitButton
  ) {
    return;
  }

  /*
   * Server has accepted the submission.
   */
  if (
    state.challengeSubmitted
  ) {
    elements.submitButton.disabled = true;
    elements.submitButton.textContent =
      "Answers Submitted";

    return;
  }

  /*
   * Submission has been sent but has not yet been
   * acknowledged by the server.
   */
  if (
    state.submissionInProgress
  ) {
    elements.submitButton.disabled = true;
    elements.submitButton.textContent =
      "Submitting...";

    return;
  }

  /*
   * Cannot submit unless an actual game is active.
   */
  if (
    state.newGameMode ||
    !state.gameStarted ||
    state.matchFinished
  ) {
    elements.submitButton.disabled = true;
    elements.submitButton.textContent =
      "Submit Answers";

    return;
  }

  const allAnswered =
    state.selectedAnswers.length ===
      TOTAL_QUESTIONS &&
    state.selectedAnswers.every(
      answer =>
        Number.isInteger(answer) &&
        answer >= 0
    );

  elements.submitButton.disabled =
    !allAnswered;

  elements.submitButton.textContent =
    "Submit Answers";
}


/* =========================================================
   SUBMISSION
   ========================================================= */

export async function submitMatch(
  autoSubmitted = false
) {
  /*
   * Prevent duplicate submissions.
   */
  if (
    state.challengeSubmitted ||
    state.submissionInProgress ||
    !state.gameStarted ||
    state.matchFinished
  ) {
    return;
  }

  if (!autoSubmitted) {
    const unanswered =
      state.selectedAnswers.filter(
        answer => answer === -1
      ).length;

    if (unanswered > 0) {
      alert(
        `You still have ${unanswered} unanswered question${
          unanswered === 1
            ? ""
            : "s"
        }.`
      );

      return;
    }
  }

  /*
   * Mark submission as in progress immediately.
   *
   * This prevents:
   * - changing answers
   * - pressing submit again
   *
   * challengeSubmitted remains false until
   * submission_received arrives from the server.
   */
  state.submissionInProgress = true;

  updateSubmitButton();
  lockAnswerButtons();

  console.log(
    "Submitting multiplayer answers:",
    state.selectedAnswers
  );

  const sent =
    sendRoomMessage({
      type: "submit_answers",
      answers:
        state.selectedAnswers.map(
          (
            selected,
            questionIndex
          ) => ({
            questionIndex,
            selected
          })
        )
    });

  /*
   * WebSocket was unavailable or send() failed.
   *
   * The server did not receive the submission, so the
   * player may attempt to submit again.
   */
  if (!sent) {
    state.submissionInProgress = false;

    unlockAnswerButtons();
    updateSubmitButton();

    setStatus(
      "Connection to match was lost."
    );

    return;
  }

  /*
   * DO NOT set challengeSubmitted here.
   *
   * match-connection.js sets it when the server sends:
   *
   *   submission_received
   */
  saveActiveMatchState();

  setStatus(
    autoSubmitted
      ? "Time expired. Waiting for opponent..."
      : "Answers submitted. Waiting for opponent..."
  );
}


/* =========================================================
   GAME RESULT
   ========================================================= */

export async function handleGameResult(
  data
) {
  console.log(
    "MATCH RESULT RECEIVED:",
    data
  );

  /* =========================================================
     MATCH IS DEFINITIVELY FINISHED
     ========================================================= */

  state.gameStarted = false;
  state.matchFinished = true;

  state.challengeSubmitted = true;
  state.submissionInProgress = false;

  state.inQueue = false;
  state.playerReady = false;

  state.matchConnectionConfirmed = false;
  state.reconnecting = false;
  state.resumeInProgress = false;

  /* =========================================================
     STOP MATCH TIMER
     ========================================================= */

  clearMatchTimer();

  /* =========================================================
     DELETE RESUME STATE
     ========================================================= */

  clearActiveMatchState();

  state.resumeAvailable = false;
  state.resumeMatchId = null;


  /* =========================================================
     CALCULATE RESULT
     ========================================================= */

  const yourCorrect =
    Number(
      data.yourCorrect ?? 0
    );

  const yourTotal =
    Number(
      data.yourTotal ??
      state.questions.length
    );

  const yourAccuracy =
    yourTotal > 0
      ? Math.round(
          (
            yourCorrect /
            yourTotal
          ) * 100
        )
      : 0;

  let message;

  if (data.result === "win") {
    message =
      `You won! ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else if (data.result === "loss") {
    message =
      `You lost. ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else if (data.result === "tie") {
    message =
      `Tie! ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else {
    message =
      `Match complete: ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  }

  /* =========================================================
     HIDE SUBMIT BUTTON
     ========================================================= */

  if (elements.submitButton) {
    elements.submitButton.disabled = true;

    elements.submitButton.style.display =
      "none";
  }

  /* =========================================================
     COOLDOWN BUTTON STATE
     ========================================================= */

  if (elements.startMatchButton) {
    elements.startMatchButton.style.display =
      "";

    elements.startMatchButton.disabled =
      true;
  }

    /* =========================================================
     START COOLDOWN
     ========================================================= */

  beginCooldown(
    data.cooldownUntil ||
    data.nextGameAt ||
    null
  );

  /* =========================================================
     RENDER RESULTS
     ========================================================= */

  showResult(message);

  renderTopicPerformance(data);

  renderResults(data);

  /* =========================================================
     STATUS
     ========================================================= */

  if (
    data.statsRecorded &&
    data.statsRecorded.success === false
  ) {
    console.error(
      "SERVER FAILED TO RECORD STATS:",
      data.statsRecorded
    );

    setStatus(
      "Match complete, but the server could not update your stats."
    );
  } else {
    setStatus(
    `Match complete. Cooldown: ${countdown} remaining. Go practice your weakest topics on Khan Academy in the meantime.`

    );
  }

  /* =========================================================
     RENDER COOLDOWN
     ========================================================= */

  updateCooldownDisplay();

  /* =========================================================
     REFRESH USER DATA
     ========================================================= */

  await refreshPlayerStats();

  await loadRecentMatches();

  /*
   * Refresh the cooldown display after async work so
   * the button remains controlled by the cooldown state.
   */
  updateCooldownDisplay();
}


/* =========================================================
   SUBMISSION RECEIVED
   ========================================================= */

export function handleSubmissionReceived(
  data = {}
) {
  console.log(
    "SUBMISSION RECEIVED:",
    data
  );

  /*
   * The server has confirmed that the submission
   * was accepted.
   *
   * This is the ONLY point where the client changes
   * challengeSubmitted to true.
   */
  state.submissionInProgress = false;
  state.challengeSubmitted = true;

  /*
   * Permanently lock every answer button for this match.
   */
  lockAnswerButtons();

  updateSubmitButton();
  saveActiveMatchState();

  setStatus(
    data.automatic
      ? "Time expired. Waiting for opponent..."
      : "Answers submitted. Waiting for opponent..."
  );
}


/* =========================================================
   CURRENT MATCH TOPIC PERFORMANCE
   ========================================================= */

function renderTopicPerformance(
  data
) {
  if (
    !elements.resultDiv
  ) {
    return;
  }

  const old =
    elements.resultDiv.querySelector(
      ".current-topic-performance"
    );

  if (old) {
    old.remove();
  }

  const questionResults =
    Array.isArray(
      data.questionResults
    )
      ? data.questionResults
      : [];

  const topicStats = {};

  state.questions.forEach(
    (
      question,
      questionIndex
    ) => {
      const result =
        questionResults.find(
          item =>
            Number(
              item.questionIndex
            ) === questionIndex
        );

      if (!result) {
        return;
      }

      const topic =
        normalizeTopic(
          question.topic ||
          question.originalTopic ||
          result.topic
        );

      if (!topic) {
        return;
      }

      if (!topicStats[topic]) {
        topicStats[topic] = {
          correct: 0,
          total: 0
        };
      }

      topicStats[topic].total++;

      if (
        result.correct === true ||
        result.correct === 1 ||
        result.correct === "1"
      ) {
        topicStats[topic].correct++;
      }
    }
  );

  const topics =
    Object.entries(
      topicStats
    );

  if (
    topics.length === 0
  ) {
    return;
  }

  topics.sort(
    ([, a], [, b]) =>
      a.correct / a.total -
      b.correct / b.total
  );

  const performance =
    document.createElement("div");

  performance.className =
    "current-topic-performance";

  const heading =
    document.createElement("h3");

  heading.textContent =
    "This Match: Topic Performance";

  performance.appendChild(
    heading
  );

  topics.forEach(
    ([topic, stats]) => {
      appendTopicRow(
        performance,
        topic,
        stats,
        stats.total >= 2 &&
        stats.correct / stats.total < 0.70
      );
    }
  );

  elements.resultDiv.appendChild(
    performance
  );
}


/* =========================================================
   ANSWER RESULTS
   ========================================================= */

function renderResults(
  data
) {
  const questionResults =
    Array.isArray(
      data.questionResults
    )
      ? data.questionResults
      : [];

  state.questions.forEach(
    (
      question,
      questionIndex
    ) => {
      const card =
        elements.questionsDiv?.children[
          questionIndex
        ];

      if (!card) {
        return;
      }

      const result =
        questionResults.find(
          item =>
            Number(
              item.questionIndex
            ) === questionIndex
        );

      if (!result) {
        return;
      }

      const selected =
        Number.isInteger(
          result.selected
        )
          ? result.selected
          : -1;

      const correctChoice =
        Number.isInteger(
          result.correctChoice
        )
          ? result.correctChoice
          : -1;

      const isCorrect =
        result.correct === true ||
        result.correct === 1 ||
        result.correct === "1";

      const oldBanner =
        card.querySelector(
          ".question-result"
        );

      if (oldBanner) {
        oldBanner.remove();
      }

      const resultBanner =
        document.createElement("div");

      resultBanner.className =
        `question-result ${
          isCorrect
            ? "question-result-correct"
            : "question-result-incorrect"
        }`;

      if (isCorrect) {
        resultBanner.innerHTML = `
          <strong>✓ Correct</strong>

          <span>
            You selected
            ${
              selected >= 0 &&
              selected < 4
                ? ["A", "B", "C", "D"][selected] + "."
                : "No answer"
            }
          </span>
        `;
      } else {
        resultBanner.innerHTML = `
          <strong>✗ Incorrect</strong>

          <span>
            You selected:
            ${
              selected === -1
                ? "No answer"
                : ["A", "B", "C", "D"][selected]
            }
          </span>

          <span>
            Correct answer:
            ${
              correctChoice >= 0 &&
              correctChoice < 4
                ? ["A", "B", "C", "D"][correctChoice]
                : "Unknown"
            }
          </span>
        `;
      }

      card.insertBefore(
        resultBanner,
        card.firstChild
      );

      const buttons =
        card.querySelectorAll(
          ".choice"
        );

      buttons.forEach(
        (
          button,
          choiceIndex
        ) => {
          button.disabled = true;

          if (
            choiceIndex ===
            correctChoice
          ) {
            button.classList.add(
              "choice-correct"
            );
          }

          if (
            choiceIndex === selected &&
            selected !== correctChoice
          ) {
            button.classList.add(
              "choice-incorrect"
            );
          }
        }
      );
    }
  );
}

/* =========================================================
   COOLDOWN DISPLAY
   ========================================================= */

function getCooldownDisplay() {
  let element =
    document.getElementById("cooldown-display");

  if (!element) {
    element =
      document.createElement("div");

    element.id =
      "cooldown-display";

    element.style.marginTop =
      "10px";

    element.style.fontWeight =
      "600";

    elements.startMatchButton
      ?.parentElement
      ?.appendChild(element);
  }

  return element;
}


export function updateCooldownDisplay() {
  const element =
    getCooldownDisplay();

  if (!element) {
    return;
  }

  const remainingMs =
    getCooldownRemainingMs();

  if (remainingMs > 0) {
    element.textContent =
      `Next match available in ${formatCountdown(
        remainingMs / 1000
      )}`;

    element.style.display =
      "block";

if (elements.startMatchButton) {
  elements.startMatchButton.disabled =
    true;

  elements.startMatchButton.textContent =
    `Cooldown: ${formatCountdown(
      remainingMs / 1000
    )}`;
}

    return;
  }

  element.textContent =
    "You can join another match.";

  element.style.display =
    "block";

  if (elements.startMatchButton) {
    elements.startMatchButton.disabled =
      false;

    elements.startMatchButton.textContent =
      "Join Queue";
  }
}

/* =========================================================
   NEW GAME BUTTON
   ========================================================= */

if (
  elements.submitButton
) {
  elements.submitButton.addEventListener(
    "click",
    () => {
      if (!state.newGameMode) {
        submitMatch(false);
        return;
      }

if (
  state.cooldownUntil &&
  state.cooldownUntil > Date.now()
) {
  const countdown =
    formatCountdown(
      Math.ceil(
        getCooldownRemainingMs() / 1000
      )
    );

  setStatus(
    `You can play again in ${countdown}. Go practice your weakest topics on Khan Academy in the meantime.`
  );

  updateCooldownUI();

  return;
}

      state.newGameMode = false;

      elements.submitButton.style.display =
        "none";

      elements.submitButton.disabled =
        true;

      state.matchId = null;
      state.opponent = null;
      state.playerReady = false;

      state.matchConnectionConfirmed =
        false;

      state.reconnecting = false;

      if (
        elements.startMatchButton
      ) {
        elements.startMatchButton.disabled =
          false;

        elements.startMatchButton.style.display =
          "block";

        elements.startMatchButton.textContent =
          "Join Queue";
      }

      setStatus(
        "You can join the queue."
      );
    }
  );
}

window.addEventListener(
  "scoreladder:cooldown-started",
  () => {
    updateCooldownDisplay();
  }
);


window.addEventListener(
  "scoreladder:cooldown-tick",
  () => {
    updateCooldownUI();

    if (
      !state.gameStarted &&
      state.cooldownUntil > Date.now()
    ) {
      const countdown =
        formatCountdown(
          Math.ceil(
            getCooldownRemainingMs() / 1000
          )
        );

      setStatus(
        `Match complete. Cooldown: ${countdown} remaining. Go practice your weakest topics on Khan Academy in the meantime.`
      );
    }
  }
);

window.addEventListener(
  "scoreladder:cooldown-complete",
  () => {
    updateCooldownUI();
  }
);

/* =========================================================
   EXPORTS
   ========================================================= */

export {
  renderTopicPerformance,
  renderResults
};


/* =========================================================
   INITIALIZE MATCH CONNECTION MODULES
   ========================================================= */

initializeMatchConnectionModules({
  renderQuestions,
  restoreSelectedAnswerUI,
  updateSubmitButton,
  startGame: handleGameStart,
  startMatchTimer,
  handleGameResult,
  handleSubmissionReceived
});