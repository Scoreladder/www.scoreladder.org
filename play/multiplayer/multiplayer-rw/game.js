import {
  elements,
  state,
  TOTAL_QUESTIONS,
  MATCH_DURATION_MS,
  setStatus,
  showResult,
  escapeHtml,
  formatPassage,
  getTopicDisplayName,
  normalizeTopic,
  stopMatchTimer,
  clearMatchTimer,
  refreshPlayerStats,
  loadRecentMatches,
  saveActiveMatchState,
  appendTopicRow,
  initializeMatchConnectionModules,
  sendRoomMessage
} from "./script.js";


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
   * The multiplayer server may send the question set
   * directly as an array:
   *
   * [
   *   { question: "...", choices: [...] },
   *   ...
   * ]
   *
   * Older/local resume paths may send:
   *
   * {
   *   questions: [...],
   *   startTime: ...
   * }
   *
   * Normalize both forms here.
   */
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
   * Preserve startTime when the server sends it inside
   * the game_start object.
   *
   * If the payload is only the question array, use the
   * existing match start time if one has already been
   * established by the reconnect/match system.
   */
  const startTime =
    Array.isArray(data)
      ? (
          Number.isFinite(
            Number(state.matchStartTime)
          )
            ? Number(state.matchStartTime)
            : Date.now()
        )
      : data.startTime;

  console.log(
    "Normalized game_start:",
    {
      questionCount:
        questions.length,
      startTime
    }
  );

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
   * On a normal new game, create a completely new
   * answer array.
   *
   * On resume, preserve the answers saved locally
   * before the page was refreshed.
   */
  const savedAnswers =
    Array.isArray(
      state.selectedAnswers
    )
      ? [...state.selectedAnswers]
      : [];

  state.questions =
    questions
      .slice(
        0,
        TOTAL_QUESTIONS
      )
      .map(
        question => {
          const choices =
            Array.isArray(
              question?.choices
            )
              ? question.choices
              : Object.values(
                  question?.choices ||
                  {}
                );

          return {
            ...question,

            choices,

            originalTopic:
              question.topic,

            topic:
              normalizeTopic(
                question.topic
              )
          };
        }
      );

  if (
    isResume &&
    savedAnswers.length ===
      state.questions.length &&
    savedAnswers.every(
      answer =>
        Number.isInteger(answer) &&
        answer >= 0
    )
  ) {
    state.selectedAnswers =
      savedAnswers;
  } else {
    state.selectedAnswers =
      new Array(
        state.questions.length
      ).fill(-1);
  }

  state.challengeSubmitted =
    false;

  state.submissionInProgress =
    false;

  state.playerReady =
    false;

  state.inQueue =
    false;

  state.gameStarted =
    true;

  state.newGameMode =
    false;

  state.reconnecting =
    false;

  state.matchConnectionConfirmed =
    true;

  /*
   * If the normalized payload contained a start time,
   * preserve it for future reconnect/resume handling.
   */
  if (
    Number.isFinite(
      Number(startTime)
    )
  ) {
    state.matchStartTime =
      Number(startTime);
  }

  if (
    elements.submitButton
  ) {
    elements.submitButton.style.display =
      "block";

    elements.submitButton.textContent =
      "Submit Answers";

    elements.submitButton.disabled =
      true;
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
    elements.resultDiv
  ) {
    elements.resultDiv.innerHTML =
      "";
  }

  renderQuestions();

  restoreSelectedAnswerUI();

  /*
   * Use the actual server start time when available.
   */
  if (
    Number.isFinite(
      Number(startTime)
    )
  ) {
    startMatchTimer(
      Number(startTime)
    );
  } else {
    console.error(
      "Missing valid match start time:",
      startTime
    );

    setStatus(
      "Unable to start match timer."
    );

    return;
  }

  setStatus(
    isResume
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
      matchId:
        state.matchId,

      questionCount:
        state.questions.length,

      selectedAnswers:
        state.selectedAnswers,

      challengeDeadline:
        state.challengeDeadline,

      timeRemaining:
        state.timeRemaining
    }
  );
}

/* =========================================================
   START GAME ADAPTER
   ========================================================= */

/*
 * match-reconnect.js expects a function named startGame().
 *
 * Keep that adapter here so the reconnect module does not
 * need to know anything about the internal game-start logic.
 */

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
  stopMatchTimer();

  const startTime =
    Number(
      serverStartTime
    );

  if (
    !Number.isFinite(
      startTime
    )
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

  state.challengeDeadline =
    startTime +
    MATCH_DURATION_MS;

  state.gameStarted =
    true;

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

  updateMatchTimer();

  state.timerInterval =
    setInterval(
      () => {
        if (
          state.challengeSubmitted &&
          state.timeRemaining <= 0
        ) {
          stopMatchTimer();

          return;
        }
        const remaining =
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
          remaining;

        updateMatchTimer();

        if (
          remaining <=
          0
        ) {
          stopMatchTimer();

          if (
            state.gameStarted &&
            !state.challengeSubmitted &&
            !state.submissionInProgress
          ) {
            submitMatch(
              true
            );
          }
        }
      },
      250
    );
}

function updateMatchTimer() {
  if (
    !elements.timerDiv
  ) {
    return;
  }

  if (
    !state.gameStarted
  ) {
    return;
  }

  const safeSeconds =
    Math.max(
      0,
      Math.ceil(
        state.timeRemaining
      )
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    safeSeconds % 60;

  elements.timerDiv.textContent =
    `${minutes}:${String(
      seconds
    ).padStart(2, "0")}`;
}


/* =========================================================
   QUESTIONS
   ========================================================= */

export function renderQuestions() {
  if (
    !elements.questionsDiv
  ) {
    return;
  }

  elements.questionsDiv.innerHTML =
    "";

  state.questions.forEach(
    (
      q,
      questionIndex
    ) => {
      const card =
        document.createElement(
          "div"
        );

      card.className =
        "card";

      const questionNumber =
        document.createElement(
          "div"
        );

      questionNumber.className =
        "question-number";

      questionNumber.textContent =
        `Question ${
          questionIndex + 1
        }`;

      card.appendChild(
        questionNumber
      );

      const meta =
        document.createElement(
          "div"
        );

      meta.className =
        "meta";

      meta.textContent =
        `${getTopicDisplayName(
          q.topic
        )}` +
        `${
          q.difficulty
            ? " • " +
              q.difficulty
            : ""
        }`;

      card.appendChild(
        meta
      );

      if (
        q.passage
      ) {
        const passage =
          document.createElement(
            "div"
          );

        passage.className =
          "passage";

        passage.innerHTML =
          formatPassage(
            q.passage
          );

        card.appendChild(
          passage
        );
      }

      const questionText =
        document.createElement(
          "p"
        );

      questionText.textContent =
        q.question || "";

      card.appendChild(
        questionText
      );

      const choices =
        Array.isArray(
          q.choices
        )
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
            document.createElement(
              "button"
            );

          button.className =
            "choice";

          button.type =
            "button";

          const letter =
            [
              "A",
              "B",
              "C",
              "D"
            ][
              choiceIndex
            ] ||
            "?";

          const text =
            typeof choice ===
            "object"
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

          card.appendChild(
            button
          );
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
}


/* =========================================================
   ANSWERS
   ========================================================= */

export function selectAnswer(
  questionIndex,
  choiceIndex
) {
  if (
    !state.gameStarted ||
    state.challengeSubmitted ||
    state.submissionInProgress
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
  ] =
    choiceIndex;

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
  }

  saveActiveMatchState();

  updateSubmitButton();

  /*
   * Only notify that the question was answered.
   * Never send the actual answer.
   */
  sendRoomMessage({
    type:
      "answer_update",

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

  if (
    state.newGameMode ||
    !state.gameStarted ||
    state.challengeSubmitted ||
    state.submissionInProgress
  ) {
    elements.submitButton.disabled =
      true;

    return;
  }

  const allAnswered =
    state.selectedAnswers.length ===
      TOTAL_QUESTIONS &&
    state.selectedAnswers.every(
      answer =>
        Number.isInteger(
          answer
        ) &&
        answer >= 0
    );

  elements.submitButton.disabled =
    !allAnswered;
}


/* =========================================================
   SUBMISSION
   ========================================================= */

export async function submitMatch(
  autoSubmitted = false
) {
  if (
    state.challengeSubmitted ||
    state.submissionInProgress ||
    !state.gameStarted
  ) {
    return;
  }

  if (
    !autoSubmitted
  ) {
    const unanswered =
      state.selectedAnswers.filter(
        answer =>
          answer === -1
      ).length;

    if (
      unanswered > 0
    ) {
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

  state.submissionInProgress =
    true;

  updateSubmitButton();

  console.log(
    "Submitting multiplayer answers:",
    state.selectedAnswers
  );

  const sent =
    sendRoomMessage({
      type:
        "submit_answers",

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

  if (!sent) {
    state.submissionInProgress =
      false;

    updateSubmitButton();

    alert(
      "Connection to match was lost."
    );

    return;
  }

  /*
   * Do NOT mark the submission as complete yet.
   *
   * The server must acknowledge it with
   * submission_received.
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

  state.gameStarted =
    false;

  state.challengeSubmitted =
    true;

  state.submissionInProgress =
    false;

  state.inQueue =
    false;

  state.playerReady =
    false;

  state.matchConnectionConfirmed =
    false;

  state.reconnecting =
    false;

  clearMatchTimer();

  const yourCorrect =
    Number(
      data.yourCorrect ??
      0
    );

  const yourTotal =
    Number(
      data.yourTotal ??
      state.questions.length
    );

  const yourAccuracy =
    yourTotal > 0
      ? Math.round(
          (yourCorrect /
            yourTotal) *
            100
        )
      : 0;

  let message;

  if (
    data.result ===
    "win"
  ) {
    message =
      `You won! ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else if (
    data.result ===
    "loss"
  ) {
    message =
      `You lost. ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else if (
    data.result ===
    "tie"
  ) {
    message =
      `Tie! ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  } else {
    message =
      `Match complete: ${yourCorrect}/${yourTotal} (${yourAccuracy}%)`;
  }

  if (
    elements.submitButton
  ) {
    elements.submitButton.disabled =
      true;
  }

  showResult(
    message
  );

  renderTopicPerformance(
    data
  );

  renderResults(
    data
  );

  if (
    data.statsRecorded &&
    data.statsRecorded.success ===
      false
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
      "Match complete. Refreshing stats..."
    );
  }

  await refreshPlayerStats();

  await loadRecentMatches();
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
            ) ===
            questionIndex
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

      if (
        !topicStats[topic]
      ) {
        topicStats[topic] = {
          correct: 0,
          total: 0
        };
      }

      topicStats[topic].total++;

      if (
        result.correct ===
          true ||
        result.correct ===
          1 ||
        result.correct ===
          "1"
      ) {
        topicStats[
          topic
        ].correct++;
      }
    }
  );

  const topics =
    Object.entries(
      topicStats
    );

  if (
    topics.length ===
    0
  ) {
    return;
  }

  topics.sort(
    ([, a], [, b]) =>
      a.correct /
        a.total -
      b.correct /
        b.total
  );

  const performance =
    document.createElement(
      "div"
    );

  performance.className =
    "current-topic-performance";

  const heading =
    document.createElement(
      "h3"
    );

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
        stats.total >=
          2 &&
          stats.correct /
            stats.total <
            0.70
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
            ) ===
            questionIndex
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
        result.correct ===
          true ||
        result.correct ===
          1 ||
        result.correct ===
          "1";

      const oldBanner =
        card.querySelector(
          ".question-result"
        );

      if (oldBanner) {
        oldBanner.remove();
      }

      const resultBanner =
        document.createElement(
          "div"
        );

      resultBanner.className =
        `question-result ${
          isCorrect
            ? "question-result-correct"
            : "question-result-incorrect"
        }`;

      if (
        isCorrect
      ) {
        resultBanner.innerHTML = `
          <strong>✓ Correct</strong>

          <span>
            You selected
            ${
              selected >=
                0 &&
              selected < 4
                ? [
                    "A",
                    "B",
                    "C",
                    "D"
                  ][selected] +
                  "."
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
              selected ===
              -1
                ? "No answer"
                : [
                    "A",
                    "B",
                    "C",
                    "D"
                  ][selected]
            }
          </span>

          <span>
            Correct answer:
            ${
              correctChoice >=
                0 &&
              correctChoice < 4
                ? [
                    "A",
                    "B",
                    "C",
                    "D"
                  ][correctChoice]
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
          button.disabled =
            true;

          if (
            choiceIndex ===
            correctChoice
          ) {
            button.classList.add(
              "choice-correct"
            );
          }

          if (
            choiceIndex ===
              selected &&
            selected !==
              correctChoice
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
   NEW GAME BUTTON
   ========================================================= */

if (
  elements.submitButton
) {
  elements.submitButton.addEventListener(
    "click",
    () => {
      if (
        !state.newGameMode
      ) {
        submitMatch(
          false
        );

        return;
      }

      if (
        state.cooldownUntil >
        Date.now()
      ) {
        return;
      }

      state.newGameMode =
        false;

      elements.submitButton.style.display =
        "none";

      elements.submitButton.disabled =
        true;

      state.matchId =
        null;

      state.opponent =
        null;

      state.playerReady =
        false;

      state.matchConnectionConfirmed =
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
          "Join Queue";
      }

      setStatus(
        "Cooldown complete. You can join the queue."
      );
    }
  );
}


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

  startGame:
    handleGameStart,

  startMatchTimer,

  handleGameResult
});