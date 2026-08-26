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
  sendRoomMessage,
  stopMatchTimer,
  clearMatchTimer,
  refreshPlayerStats,
  loadRecentMatches,
  beginCooldown,
  appendTopicRow
} from "./script.js";

/* =========================================================
   GAME START
   ========================================================= */

export function handleGameStart(
  data
) {
  console.log(
    "GAME START RECEIVED:",
    data
  );

  if (
    !data ||
    !Array.isArray(
      data.questions
    )
  ) {
    console.error(
      "Invalid game_start payload:",
      data
    );

    setStatus(
      "The server sent an invalid question set."
    );

    return;
  }

  if (
    data.questions.length !==
    TOTAL_QUESTIONS
  ) {
    console.error(
      "Unexpected question count:",
      data.questions.length
    );

    setStatus(
      `The server sent ${data.questions.length} questions instead of ${TOTAL_QUESTIONS}.`
    );

    return;
  }

  state.questions =
    data.questions;

  state.selectedAnswers =
    new Array(
      state.questions.length
    ).fill(-1);

  state.challengeSubmitted =
    false;

  state.submissionInProgress =
    false;

  state.playerReady =
    true;

  state.inQueue =
    false;

  state.gameStarted =
    true;

  state.newGameMode =
    false;

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

    elements.startMatchButton.textContent =
      "Match In Progress";
  }

  if (
    elements.resultDiv
  ) {
    elements.resultDiv.innerHTML =
      "";
  }

  renderQuestions();

  startMatchTimer(
    data.startTime
  );

  setStatus(
    "Match started. Answer all questions before time expires."
  );

  updateSubmitButton();
}

/* =========================================================
   TIMER
   ========================================================= */

function startMatchTimer(
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
          !state.gameStarted
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

function renderQuestions() {
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
          : [];

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
            ];

          button.innerHTML = `
            <span class="choice-letter">
              ${letter}.
            </span>
            ${escapeHtml(choice)}
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
   ANSWERS
   ========================================================= */

function selectAnswer(
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

function updateSubmitButton() {
  if (
    !elements.submitButton
  ) {
    return;
  }

  if (
    state.newGameMode
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
        answer !== -1
    );

  elements.submitButton.disabled =
    !allAnswered ||
    state.challengeSubmitted ||
    state.submissionInProgress ||
    !state.gameStarted;
}

/* =========================================================
   SUBMISSION
   ========================================================= */

async function submitMatch(
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

  if (
    elements.submitButton
  ) {
    elements.submitButton.disabled =
      true;
  }

  stopMatchTimer();

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

    if (
      elements.submitButton
    ) {
      elements.submitButton.disabled =
        false;
    }

    alert(
      "Connection to match was lost."
    );

    return;
  }

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

  beginCooldown();
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
      a.correct / a.total -
      b.correct / b.total
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

      if (
        elements.startMatchButton
      ) {
        elements.startMatchButton.disabled =
          false;

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
  startMatchTimer,
  submitMatch,
  renderQuestions,
  selectAnswer
};