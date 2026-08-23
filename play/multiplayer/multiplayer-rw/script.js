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
  "command_evidence_textual": "command_evidence_textual",

  "quantitative_evidence": "command_evidence_quantitative",
  "command_evidence_quantitative": "command_evidence_quantitative",

  "inference": "inferences",
  "inferences": "inferences",

  "word_in_context": "words_in_context",
  "words_in_context": "words_in_context",

  "structure_and_purpose": "text_structure_purpose",
  "text_structure_purpose": "text_structure_purpose",

  "cross_text": "cross_text_connections",
  "cross_text_connections": "cross_text_connections",

  "rhetorical": "rhetorical_synthesis",
  "rhetorical_synthesis": "rhetorical_synthesis",

  "transition": "transitions",
  "transitions": "transitions",

  "boundary": "boundaries",
  "boundaries": "boundaries",

  "form_structure_sense": "form_structure_sense"
};

function normalizeTopic(topic) {
  if (typeof topic !== "string") {
    return null;
  }

  const normalized = topic.trim().toLowerCase();

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
    return sessionStorage.getItem("scoreladder_session");
  } catch (error) {
    console.error("Failed to get session:", error);
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
    player.stats?.elo ??
    player.elo ??
    1200;

  if (opponentEloDiv) {
    opponentEloDiv.textContent = elo;
  }
}


/* =========================================================
   MATCHMAKING
   ========================================================= */

async function startMatchmaking() {
  if (inQueue) {
    return;
  }

  const sessionId = getSessionId();

  if (!sessionId) {
    setStatus(
      "You must be logged in to play multiplayer."
    );
    return;
  }

  inQueue = true;

  startMatchButton.disabled = true;
  startMatchButton.textContent = "Joining Queue...";

  /* Keep submit hidden while in queue */
  submitButton.style.display = "none";

  setStatus("Finding an opponent...");

  try {
    const response = await fetch(
      `${API}/matchmake?session=${encodeURIComponent(sessionId)}`
    );

    const data = await response.json();

    console.log("Matchmaking response:", data);

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to enter matchmaking."
      );
    }

    playerId = data.playerId;

    if (data.player) {
      updatePlayer(data.player);
    }

    /* Already matched */
    if (data.status === "matched") {
      matchId = data.matchId;

      updateOpponent(data.opponent);

      setStatus("Opponent found!");

      startMatchButton.textContent =
        "Connecting...";

      onMatchFound();

      return;
    }

    /* Waiting */
    startMatchButton.textContent = "In Queue";

    setStatus("Waiting for opponent...");

    checkForMatch();

  } catch (error) {
    console.error("Matchmaking error:", error);

    setStatus(
      error.message ||
      "Unable to connect to matchmaking."
    );

    inQueue = false;

    startMatchButton.disabled = false;
    startMatchButton.textContent = "Join Queue";

    submitButton.style.display = "none";
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
    const response = await fetch(
      `${API}/check-match?playerId=${encodeURIComponent(playerId)}`
    );

    const data = await response.json();

    console.log("Match check:", data);

    if (
      response.ok &&
      data.status === "matched"
    ) {
      matchId = data.matchId;

      updateOpponent(data.opponent);

      setStatus("Opponent found!");

      startMatchButton.textContent =
        "Connecting...";

      onMatchFound();

      return;
    }

  } catch (error) {
    console.error("Match check error:", error);

  } finally {
    checkingMatch = false;
  }

  if (!matchId) {
    setTimeout(checkForMatch, 1000);
  }
}


/* =========================================================
   MATCH FOUND
   ========================================================= */

function onMatchFound() {
  console.log("Match found:", matchId);
  console.log("Opponent:", opponent);

  connectToRoom();
}


/* =========================================================
   WEBSOCKET
   ========================================================= */

function connectToRoom() {
  if (!matchId || !playerId) {
    console.error(
      "Cannot connect to room:",
      {
        matchId,
        playerId
      }
    );

    return;
  }

  const wsAPI = API
    .replace("http://", "ws://")
    .replace("https://", "wss://");

  const socketURL =
    `${wsAPI}/match?matchId=${encodeURIComponent(matchId)}` +
    `&playerId=${encodeURIComponent(playerId)}`;

  console.log(
    "Connecting to room:",
    socketURL
  );

  if (
    matchSocket &&
    matchSocket.readyState !== WebSocket.CLOSED
  ) {
    matchSocket.close();
  }

  const socket = new WebSocket(socketURL);

  matchSocket = socket;

  socket.addEventListener(
    "open",
    () => {
      console.log("WebSocket connected.");

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
        data = JSON.parse(event.data);
      } catch (error) {
        console.error(
          "Invalid WebSocket message:",
          event.data
        );

        return;
      }

      /* Connected */
      if (data.type === "connected") {
        console.log(
          "Connected to match room:",
          data.matchId
        );

        return;
      }

      /* Waiting */
      if (
        data.type ===
        "waiting_for_opponent"
      ) {
        setStatus(
          "Waiting for opponent to connect..."
        );

        return;
      }

      /* Match ready */
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

        startMatchButton.disabled = false;
        startMatchButton.textContent =
          "Start Match";

        return;
      }

      /* Opponent ready */
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

      /* Game start */
      if (
        data.type ===
        "game_start"
      ) {
        console.log(
          "Game starting:",
          data
        );

        startGame(data.questions);

        return;
      }

      /* Opponent answer update */
      if (
        data.type ===
        "answer_update"
      ) {
        console.log(
          "Opponent answer update received."
        );

        return;
      }

      /* Opponent submitted */
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

      /* Game result */
      if (
        data.type ===
        "game_result"
      ) {
        console.log(
          "Game result:",
          data
        );

        handleGameResult(data);

        return;
      }

      /* Opponent left */
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

        submitButton.disabled = true;
        startMatchButton.disabled = true;

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
          code: event.code,
          reason: event.reason
        }
      );
    }
  );
}


/* =========================================================
   START GAME
   ========================================================= */

function startGame(serverQuestions) {
  if (
    !Array.isArray(serverQuestions) ||
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

  questions = serverQuestions
    .slice(0, 10)
    .map(question => {
      const choices =
        Array.isArray(question.choices)
          ? question.choices
          : Object.values(
              question.choices || {}
            );

      return {
        ...question,

        choices,

        originalTopic:
          question.topic,

        topic:
          normalizeTopic(
            question.topic
          ),

        _shuffledChoices:
          choices
            .map(
              (
                text,
                originalIndex
              ) => ({
                text,
                originalIndex
              })
            )
            .sort(
              () =>
                Math.random() - 0.5
            )
      };
    });

  selectedAnswers =
    new Array(
      questions.length
    ).fill(-1);

  challengeSubmitted = false;
  submissionInProgress = false;

  gameStarted = true;
  playerReady = false;

  startMatchButton.disabled = true;
  startMatchButton.style.display = "none";

  /*
   * IMPORTANT:
   * Submit button was hidden during queue.
   * Show it only once the actual game starts.
   */
  submitButton.style.display = "block";
  submitButton.disabled = true;

  setStatus("Match started!");

  timeRemaining = 660;

  challengeDeadline =
    Date.now() + 660000;

  renderQuestions();

  updateTimer();

  startTimer();
}


/* =========================================================
   RENDER QUESTIONS
   ========================================================= */

function renderQuestions() {
  questionsDiv.innerHTML = "";

  questions.forEach(
    (q, questionIndex) => {

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
        `${q.topic || ""}` +
        `${
          q.difficulty
            ? " • " + q.difficulty
            : ""
        }`;

      card.appendChild(meta);

      if (q.passage) {
        const passage =
          document.createElement("div");

        passage.className =
          "passage";

        passage.innerHTML =
          formatPassage(q.passage);

        card.appendChild(passage);
      }

      const questionText =
        document.createElement("p");

      questionText.textContent =
        q.question || "";

      card.appendChild(
        questionText
      );

      q._shuffledChoices.forEach(
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
            ];

          button.innerHTML = `
            <span class="choice-letter">
              ${letter}.
            </span>
            ${escapeHtml(choice.text)}
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

      questionsDiv.appendChild(card);
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

  selectedAnswers[questionIndex] =
    choiceIndex;

  const card =
    questionsDiv.children[
      questionIndex
    ];

  if (!card) {
    return;
  }

  const buttons =
    card.querySelectorAll(".choice");

  buttons.forEach(button => {
    button.classList.remove("selected");
  });

  if (buttons[choiceIndex]) {
    buttons[choiceIndex]
      .classList.add("selected");
  }

  updateSubmitButton();

  /*
   * Server receives the update,
   * but opponent does not receive
   * the actual answer.
   */
  sendRoomMessage({
    type: "answer_update",
    questionIndex,
    choiceIndex
  });
}


/* =========================================================
   SUBMIT BUTTON STATE
   ========================================================= */

function updateSubmitButton() {
  const allAnswered =
    selectedAnswers.every(
      answer => answer !== -1
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
        answer => answer === -1
      ).length;

    if (unanswered > 0) {
      alert(
        `You still have ${unanswered} unanswered question${
          unanswered === 1 ? "" : "s"
        }.`
      );

      return;
    }
  }

  submissionInProgress = true;
  submitButton.disabled = true;

  stopTimer();

  const results =
    questions.map(
      (
        q,
        questionIndex
      ) => {

        const selected =
          selectedAnswers[
            questionIndex
          ];

        let correct = false;

        if (selected !== -1) {
          const shuffledChoice =
            q._shuffledChoices[
              selected
            ];

          correct =
            shuffledChoice.originalIndex ===
            q.answer;
        }

        return {
          questionIndex,

          topic:
            normalizeTopic(q.topic),

          selected,
          correct
        };
      }
    );

  console.log(
    "Submitting multiplayer answers:",
    results
  );

  const sent =
    sendRoomMessage({
      type: "submit_answers",

      answers:
        results.map(result => ({
          questionIndex:
            result.questionIndex,

          selected:
            result.selected
        }))
    });

  if (!sent) {
    submissionInProgress = false;

    submitButton.disabled = false;

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

function handleGameResult(data) {
  challengeSubmitted = true;
  submissionInProgress = false;

  stopTimer();

  submitButton.disabled = true;

  const yourCorrect =
    data.yourCorrect ??
    data.playerCorrect ??
    0;

  const yourAccuracy =
    data.yourAccuracy ??
    Math.round(
      (yourCorrect / questions.length) * 100
    );

  let message;

  if (data.result === "win") {
    message =
      `You won! ${yourCorrect}/${questions.length} (${yourAccuracy}%)`;

  } else if (data.result === "loss") {
    message =
      `You lost. ${yourCorrect}/${questions.length} (${yourAccuracy}%)`;

  } else if (data.result === "tie") {
    message =
      `Tie! ${yourCorrect}/${questions.length} (${yourAccuracy}%)`;

  } else {
    message =
      `Match complete: ${yourCorrect}/${questions.length} (${yourAccuracy}%)`;
  }

  showResult(message);

  renderResults(data);
}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults(data) {
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

      const selected =
        selectedAnswers[
          questionIndex
        ];

      const correctChoice =
        q._shuffledChoices.findIndex(
          choice =>
            choice.originalIndex ===
            q.answer
        );

      const buttons =
        card.querySelectorAll(
          ".choice"
        );

      const isCorrect =
        selected !== -1 &&
        selected === correctChoice;

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
            ${["A", "B", "C", "D"][selected]}.
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
            ${["A", "B", "C", "D"][correctChoice]}
          </span>
        `;
      }

      card.insertBefore(
        resultBanner,
        card.firstChild
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

          submitMatch(true);
        }
      },
      1000
    );
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);

    timerInterval = null;
  }
}

function updateTimer() {
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

function sendRoomMessage(message) {
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


/* =========================================================
   START BUTTON
   ========================================================= */

startMatchButton.addEventListener(
  "click",
  () => {

    /* First click: join queue */
    if (!inQueue) {
      startMatchmaking();
      return;
    }

    /* Don't start twice */
    if (
      gameStarted ||
      playerReady
    ) {
      return;
    }

    /* Need WebSocket */
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

    /* Player ready */
    playerReady = true;

    startMatchButton.disabled = true;

    startMatchButton.textContent =
      "Waiting for opponent...";

    setStatus(
      "Waiting for opponent to start..."
    );

    const sent =
      sendRoomMessage({
        type: "start_ready"
      });

    if (!sent) {
      playerReady = false;

      startMatchButton.disabled = false;

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

startMatchButton.disabled = false;
startMatchButton.textContent = "Join Queue";

/*
 * Hidden until game_start.
 */
submitButton.style.display = "none";
submitButton.disabled = true;

timerDiv.textContent = "11:00";

setStatus(
  "Ready to join queue."
);