const API = "http://127.0.0.1:8787";

const startMatchButton =
  document.getElementById("startMatchButton");

const statusDiv =
  document.getElementById("status");

const timerDiv =
  document.getElementById("timer");

const questionsDiv =
  document.getElementById("questions");

const submitButton =
  document.getElementById("submitButton");

const resultDiv =
  document.getElementById("result");

const playerNameDiv =
  document.getElementById("playerName");

const playerEloDiv =
  document.getElementById("playerElo");

const opponentNameDiv =
  document.getElementById("opponentName");

const opponentEloDiv =
  document.getElementById("opponentElo");


/* =========================================================
   STATE
   ========================================================= */

let playerId = null;
let matchId = null;
let opponent = null;

let checkingMatch = false;
let matchSocket = null;
let inQueue = false;

let gameStarted = false;
let playerReady = false;

let challengeSubmitted = false;
let submissionInProgress = false;

let questions = [];
let selectedAnswers = [];

let timeRemaining = 660;
let timerInterval = null;
let challengeDeadline = 0;


/* =========================================================
   TOPIC NORMALIZATION
   ========================================================= */

const TOPIC_ALIASES = {
  "central_idea": "central_ideas",
  "central_ideas": "central_ideas",

  "text_evidence": "command_evidence_textual",
  "textual_evidence": "command_evidence_textual",
  "command_evidence_textual":
    "command_evidence_textual",

  "quantitative_evidence":
    "command_evidence_quantitative",
  "command_evidence_quantitative":
    "command_evidence_quantitative",

  "inference": "inferences",
  "inferences": "inferences",

  "word_in_context": "words_in_context",
  "words_in_context": "words_in_context",

  "structure_and_purpose":
    "text_structure_purpose",
  "text_structure_purpose":
    "text_structure_purpose",

  "cross_text":
    "cross_text_connections",
  "cross_text_connections":
    "cross_text_connections",

  "rhetorical":
    "rhetorical_synthesis",
  "rhetorical_synthesis":
    "rhetorical_synthesis",

  "transition": "transitions",
  "transitions": "transitions",

  "boundary": "boundaries",
  "boundaries": "boundaries",

  "form_structure_sense":
    "form_structure_sense"
};

function normalizeTopic(topic) {
  if (typeof topic !== "string") {
    return null;
  }

  const normalized =
    topic.trim().toLowerCase();

  return TOPIC_ALIASES[normalized] ?? null;
}


/* =========================================================
   BASIC UI
   ========================================================= */

function setStatus(message) {
  if (statusDiv) {
    statusDiv.textContent = message;
  }
}

function showResult(message) {
  if (resultDiv) {
    resultDiv.textContent = message;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPassage(text) {
  if (typeof text !== "string") {
    return "";
  }

  return escapeHtml(text)
    .replace(
      /\[UNDERLINED\](.*?)\[\/UNDERLINED\]/g,
      "<u>$1</u>"
    )
    .replace(/\n/g, "<br>");
}


/* =========================================================
   SESSION
   ========================================================= */

function getSessionId() {
  try {
    return sessionStorage.getItem(
      "scoreladder_session"
    );
  } catch (error) {
    console.error(
      "Failed to get session:",
      error
    );

    return null;
  }
}


/* =========================================================
   PLAYER INFORMATION
   ========================================================= */

function updatePlayer(player) {
  if (!player) {
    return;
  }

  if (playerNameDiv) {
    playerNameDiv.textContent =
      player.username ||
      player.display_name ||
      "You";
  }

  const elo =
    player.stats?.rw_elo ??
    player.rw_elo ??
    player.stats?.elo ??
    player.elo ??
    1200;

  if (playerEloDiv) {
    playerEloDiv.textContent = elo;
  }
}

function updateOpponent(player) {
  if (!player) {
    return;
  }

  opponent = player;

  if (opponentNameDiv) {
    opponentNameDiv.textContent =
      player.username ||
      player.display_name ||
      "Opponent";
  }

  const elo =
    player.stats?.rw_elo ??
    player.rw_elo ??
    player.stats?.elo ??
    player.elo ??
    1200;

  if (opponentEloDiv) {
    opponentEloDiv.textContent = elo;
  }
}


/* =========================================================
   REFRESH PLAYER STATS
   ========================================================= */

async function refreshPlayerStats() {
  const sessionId =
    getSessionId();

  if (!sessionId) {
    return;
  }

  try {
    const response =
      await fetch(
        `${AUTH_API}/me?session=${encodeURIComponent(
          sessionId
        )}`
      );

    if (!response.ok) {
      console.error(
        "Failed to refresh player stats:",
        response.status
      );

      return;
    }

    const player =
      await response.json();

    console.log(
      "REFRESHED PLAYER:",
      player
    );

    updatePlayer(player);

  } catch (error) {
    console.error(
      "Failed to refresh player:",
      error
    );
  }
}


/* =========================================================
   AUTH API
   ========================================================= */

const AUTH_API =
  "https://auth.scoreladder.org";


/* =========================================================
   MATCHMAKING
   ========================================================= */

async function startMatchmaking() {
  if (inQueue) {
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

  inQueue = true;

  startMatchButton.disabled = true;

  startMatchButton.textContent =
    "Joining Queue...";

  submitButton.style.display =
    "none";

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
      throw new Error(
        data.error ||
        "Unable to enter matchmaking."
      );
    }

    playerId =
      data.playerId;

    if (data.player) {
      updatePlayer(
        data.player
      );
    }

    /*
     * Already matched.
     */
    if (
      data.status ===
      "matched"
    ) {
      matchId =
        data.matchId;

      updateOpponent(
        data.opponent
      );

      setStatus(
        "Opponent found!"
      );

      startMatchButton.textContent =
        "Connecting...";

      onMatchFound();

      return;
    }

    /*
     * Waiting for another player.
     */
    startMatchButton.textContent =
      "In Queue";

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

    inQueue = false;

    startMatchButton.disabled =
      false;

    startMatchButton.textContent =
      "Join Queue";

    submitButton.style.display =
      "none";
  }
}


/* =========================================================
   CHECK FOR MATCH
   ========================================================= */

async function checkForMatch() {
  if (
    checkingMatch ||
    !playerId ||
    matchId
  ) {
    return;
  }

  checkingMatch = true;

  try {
    const response =
      await fetch(
        `${API}/check-match?playerId=${encodeURIComponent(
          playerId
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
      data.status ===
        "matched"
    ) {
      matchId =
        data.matchId;

      updateOpponent(
        data.opponent
      );

      setStatus(
        "Opponent found!"
      );

      startMatchButton.textContent =
        "Connecting...";

      onMatchFound();

      return;
    }

  } catch (error) {
    console.error(
      "Match check error:",
      error
    );

  } finally {
    checkingMatch = false;
  }

  if (!matchId) {
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
    matchId
  );

  console.log(
    "Opponent:",
    opponent
  );

  connectToRoom();
}


/* =========================================================
   WEBSOCKET
   ========================================================= */

function connectToRoom() {
  if (
    !matchId ||
    !playerId
  ) {
    console.error(
      "Cannot connect to room:",
      {
        matchId,
        playerId
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
      matchId
    )}` +
    `&playerId=${encodeURIComponent(
      playerId
    )}`;

  console.log(
    "Connecting to room:",
    socketURL
  );

  if (
    matchSocket &&
    matchSocket.readyState !==
      WebSocket.CLOSED
  ) {
    matchSocket.close();
  }

  const socket =
    new WebSocket(
      socketURL
    );

  matchSocket =
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


      /* -----------------------------------------------
         CONNECTED
         ----------------------------------------------- */

      if (
        data.type ===
        "connected"
      ) {
        console.log(
          "Connected to match room:",
          data.matchId
        );

        return;
      }


      /* -----------------------------------------------
         WAITING
         ----------------------------------------------- */

      if (
        data.type ===
        "waiting_for_opponent"
      ) {
        setStatus(
          "Waiting for opponent to connect..."
        );

        return;
      }


      /* -----------------------------------------------
         MATCH READY
         ----------------------------------------------- */

      if (
        data.type ===
        "match_ready"
      ) {
        console.log(
          "Both players connected."
        );

        setStatus(
          "Both players connected. Ready to start."
        );

        startMatchButton.disabled =
          false;

        startMatchButton.textContent =
          "Start Match";

        return;
      }


      /* -----------------------------------------------
         OPPONENT READY
         ----------------------------------------------- */

      if (
        data.type ===
        "opponent_ready"
      ) {
        console.log(
          "Opponent is ready."
        );

        if (!gameStarted) {
          setStatus(
            "Opponent is ready. Click Start Match when ready."
          );
        }

        return;
      }


      /* -----------------------------------------------
         GAME START
         ----------------------------------------------- */

      if (
        data.type ===
        "game_start"
      ) {
        console.log(
          "Game starting:",
          data
        );

        startGame(
          data.questions,
          data.startTime
        );

        return;
      }


      /* -----------------------------------------------
         OPPONENT ANSWER UPDATE
         ----------------------------------------------- */

      if (
        data.type ===
        "answer_update"
      ) {
        console.log(
          "Opponent answered question:",
          data.questionIndex
        );

        /*
         * Intentionally do not display the
         * opponent's selected answer.
         */

        return;
      }


      /* -----------------------------------------------
         OPPONENT SUBMITTED
         ----------------------------------------------- */

      if (
        data.type ===
        "opponent_submitted"
      ) {
        console.log(
          "Opponent submitted."
        );

        setStatus(
          "Opponent has submitted. Finish your answers."
        );

        return;
      }


      /* -----------------------------------------------
         SUBMISSION RECEIVED
         ----------------------------------------------- */

      if (
        data.type ===
        "submission_received"
      ) {
        if (
          data.automatic
        ) {
          setStatus(
            "Time expired. Waiting for opponent..."
          );
        }

        return;
      }


      /* -----------------------------------------------
         GAME RESULT
         ----------------------------------------------- */

      if (
        data.type ===
        "game_result"
      ) {
        console.log(
          "Game result:",
          data
        );

        handleGameResult(
          data
        );

        return;
      }


      /* -----------------------------------------------
         GAME ERROR
         ----------------------------------------------- */

      if (
        data.type ===
        "game_error"
      ) {
        console.error(
          "Game error:",
          data.message
        );

        setStatus(
          data.message ||
          "Unable to start match."
        );

        startMatchButton.disabled =
          false;

        startMatchButton.textContent =
          "Start Match";

        return;
      }


      /* -----------------------------------------------
         OPPONENT LEFT
         ----------------------------------------------- */

      if (
        data.type ===
        "opponent_left"
      ) {
        console.log(
          "Opponent disconnected."
        );

        setStatus(
          "Opponent disconnected."
        );

        submitButton.disabled =
          true;

        startMatchButton.disabled =
          true;

        stopTimer();

        return;
      }
    }
  );


  socket.addEventListener(
    "error",
    error => {
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
    }
  );
}


/* =========================================================
   START GAME
   ========================================================= */

function startGame(
  serverQuestions,
  serverStartTime
) {
  if (
    !Array.isArray(
      serverQuestions
    ) ||
    serverQuestions.length === 0
  ) {
    console.error(
      "No questions received."
    );

    setStatus(
      "Unable to start match: no questions received."
    );

    return;
  }

  /*
   * The server already shuffled the choices.
   *
   * DO NOT shuffle them here.
   */

  questions =
    serverQuestions
      .slice(0, 10)
      .map(question => {
        const choices =
          Array.isArray(
            question.choices
          )
            ? question.choices
            : Object.values(
                question.choices ||
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
      });

  selectedAnswers =
    new Array(
      questions.length
    ).fill(-1);

  challengeSubmitted =
    false;

  submissionInProgress =
    false;

  gameStarted =
    true;

  playerReady =
    false;

  startMatchButton.disabled =
    true;

  startMatchButton.style.display =
    "none";

  submitButton.style.display =
    "block";

  submitButton.disabled =
    true;

  if (resultDiv) {
    resultDiv.textContent =
      "";
  }

  setStatus(
    "Match started!"
  );


  /*
   * Server-authoritative timer.
   */

  const startTime =
    Number(
      serverStartTime
    );

  if (
    Number.isFinite(
      startTime
    )
  ) {
    challengeDeadline =
      startTime +
      660000;
  } else {
    challengeDeadline =
      Date.now() +
      660000;
  }

  timeRemaining =
    Math.max(
      0,
      Math.ceil(
        (
          challengeDeadline -
          Date.now()
        ) / 1000
      )
    );

  renderQuestions();

  updateTimer();

  startTimer();
}


/* =========================================================
   RENDER QUESTIONS
   ========================================================= */

function renderQuestions() {
  if (!questionsDiv) {
    return;
  }

  questionsDiv.innerHTML =
    "";

  questions.forEach(
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
        `${q.topic || ""}` +
        `${
          q.difficulty
            ? " • " +
              q.difficulty
            : ""
        }`;

      card.appendChild(
        meta
      );


      if (q.passage) {
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


      q.choices.forEach(
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
            ["A", "B", "C", "D"][
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

      questionsDiv.appendChild(
        card
      );
    }
  );
}


/* =========================================================
   SELECT ANSWER
   ========================================================= */

function selectAnswer(
  questionIndex,
  choiceIndex
) {
  if (!gameStarted) {
    return;
  }

  if (challengeSubmitted) {
    return;
  }

  if (submissionInProgress) {
    return;
  }

  if (
    questionIndex < 0 ||
    questionIndex >=
      selectedAnswers.length
  ) {
    return;
  }

  /*
   * Players can change their answer
   * until submission/deadline.
   */

  selectedAnswers[
    questionIndex
  ] =
    choiceIndex;


  const card =
    questionsDiv.children[
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
    buttons[choiceIndex]
      .classList.add(
        "selected"
      );
  }

  updateSubmitButton();


  /*
   * Tell the server only that this
   * question was answered.
   *
   * The selected choice is NEVER
   * sent to the opponent.
   */

  sendRoomMessage({
    type:
      "answer_update",

    questionIndex
  });
}


/* =========================================================
   SUBMIT BUTTON STATE
   ========================================================= */

function updateSubmitButton() {
  if (!submitButton) {
    return;
  }

  const allAnswered =
    selectedAnswers.every(
      answer =>
        answer !== -1
    );

  submitButton.disabled =
    !allAnswered ||
    challengeSubmitted ||
    submissionInProgress;
}


/* =========================================================
   SUBMIT MATCH
   ========================================================= */

async function submitMatch(
  autoSubmitted = false
) {
  if (challengeSubmitted) {
    return;
  }

  if (submissionInProgress) {
    return;
  }

  if (!autoSubmitted) {
    const unanswered =
      selectedAnswers.filter(
        answer =>
          answer === -1
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

  submissionInProgress =
    true;

  submitButton.disabled =
    true;

  stopTimer();


  console.log(
    "Submitting multiplayer answers:",
    selectedAnswers
  );


  const sent =
    sendRoomMessage({
      type:
        "submit_answers",

      answers:
        selectedAnswers.map(
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
    submissionInProgress =
      false;

    submitButton.disabled =
      false;

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

async function handleGameResult(
  data
) {
  challengeSubmitted =
    true;

  submissionInProgress =
    false;

  gameStarted =
    false;

  stopTimer();

  submitButton.disabled =
    true;


  const yourCorrect =
    data.yourCorrect ??
    0;

  const yourTotal =
    data.yourTotal ??
    questions.length;

  const yourAccuracy =
    data.yourAccuracy ??
    (
      yourTotal > 0
        ? Math.round(
            (
              yourCorrect /
              yourTotal
            ) * 100
          )
        : 0
    );


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

  renderResults(
    data
  );


  /*
   * IMPORTANT:
   *
   * The multiplayer worker records the match
   * through auth.scoreladder.org.
   *
   * Fetch /me again so the newly updated
   * Elo/statistics appear immediately.
   */

  await refreshPlayerStats();


  if (
    data.statsRecorded?.success ===
    false
  ) {
    console.error(
      "Server reported that stats were not recorded:",
      data.statsRecorded
    );

    setStatus(
      "Match complete, but stats could not be updated."
    );
  } else {
    setStatus(
      "Match complete. Stats updated."
    );
  }
}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults(data) {
  const questionResults =
    Array.isArray(
      data.questionResults
    )
      ? data.questionResults
      : [];


  questions.forEach(
    (
      q,
      questionIndex
    ) => {
      const card =
        questionsDiv.children[
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
        true;


      /*
       * Remove old result banner.
       */

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


      if (isCorrect) {
        resultBanner.innerHTML = `
          <strong>✓ Correct</strong>

          <span>
            You selected
            ${
              selected >= 0 &&
              selected < 4
                ? ["A", "B", "C", "D"][
                    selected
                  ] + "."
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
                : ["A", "B", "C", "D"][
                    selected
                  ]
            }
          </span>

          <span>
            Correct answer:
            ${
              correctChoice >= 0 &&
              correctChoice < 4
                ? ["A", "B", "C", "D"][
                    correctChoice
                  ]
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
   TIMER
   ========================================================= */

function startTimer() {
  stopTimer();

  timerInterval =
    setInterval(
      () => {
        timeRemaining =
          Math.max(
            0,
            Math.ceil(
              (
                challengeDeadline -
                Date.now()
              ) / 1000
            )
          );

        updateTimer();

        if (
          timeRemaining <= 0
        ) {
          stopTimer();

          /*
           * The client submits at the deadline,
           * but the Durable Object alarm is still
           * authoritative.
           */

          submitMatch(
            true
          );
        }
      },
      1000
    );
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(
      timerInterval
    );

    timerInterval =
      null;
  }
}

function updateTimer() {
  if (!timerDiv) {
    return;
  }

  const minutes =
    Math.floor(
      timeRemaining / 60
    );

  const seconds =
    timeRemaining % 60;

  timerDiv.textContent =
    `${minutes}:${String(
      seconds
    ).padStart(2, "0")}`;
}


/* =========================================================
   SEND ROOM MESSAGE
   ========================================================= */

function sendRoomMessage(
  message
) {
  if (
    !matchSocket ||
    matchSocket.readyState !==
      WebSocket.OPEN
  ) {
    console.error(
      "WebSocket is not connected."
    );

    return false;
  }

  try {
    matchSocket.send(
      JSON.stringify(
        message
      )
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


/* =========================================================
   START BUTTON
   ========================================================= */

startMatchButton.addEventListener(
  "click",
  () => {

    /*
     * First click:
     * join matchmaking queue.
     */

    if (!inQueue) {
      startMatchmaking();
      return;
    }


    /*
     * Don't start twice.
     */

    if (
      gameStarted ||
      playerReady
    ) {
      return;
    }


    /*
     * Need WebSocket.
     */

    if (
      !matchSocket ||
      matchSocket.readyState !==
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
     * Player is ready.
     */

    playerReady =
      true;

    startMatchButton.disabled =
      true;

    startMatchButton.textContent =
      "Waiting for opponent...";

    setStatus(
      "Waiting for opponent to start..."
    );


    const sent =
      sendRoomMessage({
        type:
          "start_ready"
      });


    if (!sent) {
      playerReady =
        false;

      startMatchButton.disabled =
        false;

      startMatchButton.textContent =
        "Start Match";

      setStatus(
        "Unable to start match."
      );
    }
  }
);


/* =========================================================
   SUBMIT BUTTON
   ========================================================= */

submitButton.addEventListener(
  "click",
  () => {
    submitMatch(false);
  }
);


/* =========================================================
   INITIAL STATE
   ========================================================= */

startMatchButton.disabled =
  false;

startMatchButton.textContent =
  "Join Queue";

submitButton.style.display =
  "none";

submitButton.disabled =
  true;

if (timerDiv) {
  timerDiv.textContent =
    "11:00";
}

setStatus(
  "Ready to join queue."
);