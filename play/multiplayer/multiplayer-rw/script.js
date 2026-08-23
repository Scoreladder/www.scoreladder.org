const API = window.location.origin;

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


let playerId = null;
let matchId = null;
let opponent = null;

let checkingMatch = false;
let matchSocket = null;

let gameStarted = false;
let playerReady = false;
let inQueue = false;


/* ----------------------------- */
/* Basic UI helpers               */
/* ----------------------------- */

function setStatus(message) {
  statusDiv.textContent = message;
}


function showQuestions(questions) {
  questionsDiv.innerHTML = "";

  questions.forEach((question, index) => {
    const card =
      document.createElement("div");

    card.className = "card";

    const heading = document.createElement("h3");
    heading.textContent = `Question ${index + 1}`;
    card.appendChild(heading);

    const questionText = document.createElement("p");
    questionText.textContent = question.question;
    card.appendChild(questionText);

    const choicesContainer = document.createElement("div");
    choicesContainer.className = "choices";

    question.choices.forEach((choice, choiceIndex) => {
      const label = document.createElement("label");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${index}`;
      input.value = choiceIndex;

      const choiceText = document.createTextNode(choice);

      label.appendChild(input);
      label.appendChild(document.createTextNode(" "));
      label.appendChild(choiceText);

      choicesContainer.appendChild(label);
    });

    card.appendChild(choicesContainer);

    questionsDiv.appendChild(card);
  });
}


function showResult(message) {
  resultDiv.textContent = message;
}


/* ----------------------------- */
/* Session                       */
/* ----------------------------- */

function getSessionId() {
  return sessionStorage.getItem(
    "scoreladder_session"
  );
}


/* ----------------------------- */
/* Player information             */
/* ----------------------------- */

function updatePlayer(player) {
  if (!player) {
    return;
  }

  playerNameDiv.textContent =
    player.username ||
    player.display_name ||
    "You";

  const elo =
    player.stats?.elo ??
    player.elo ??
    1200;

  playerEloDiv.textContent = elo;
}


function updateOpponent(player) {
  if (!player) {
    return;
  }

  opponent = player;

  opponentNameDiv.textContent =
    player.username ||
    player.display_name ||
    "Opponent";

  const elo =
    player.stats?.elo ??
    player.elo ??
    1200;

  opponentEloDiv.textContent = elo;
}


/* ----------------------------- */
/* Join Queue                    */
/* ----------------------------- */

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

  setStatus(
    "Finding an opponent..."
  );

  try {
    const response =
      await fetch(
        `${API}/matchmake`,
        {
          headers: {
            'Authorization': `Bearer ${sessionId}`
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      setStatus(
        data.error ||
        "Unable to enter matchmaking."
      );

      inQueue = false;

      startMatchButton.disabled = false;

      startMatchButton.textContent =
        "Join Queue";

      return;
    }

    playerId =
      data.playerId;

    if (data.player) {
      updatePlayer(data.player);
    }

    console.log(
      "Matchmaking response:",
      data
    );

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
      "Unable to connect to matchmaking."
    );

    inQueue = false;

    startMatchButton.disabled = false;

    startMatchButton.textContent =
      "Join Queue";
  }
}


/* ----------------------------- */
/* Check for waiting-player match */
/* ----------------------------- */

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


/* ----------------------------- */
/* Match found                   */
/* ----------------------------- */

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


/* ----------------------------- */
/* WebSocket room                */
/* ----------------------------- */

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
    )}&playerId=${encodeURIComponent(
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


  /* ------------------------- */
  /* Connected                  */
  /* ------------------------- */

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


  /* ------------------------- */
  /* Messages                  */
  /* ------------------------- */

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


      /* --------------------- */
      /* Room connection       */
      /* --------------------- */

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


      /* --------------------- */
      /* Waiting               */
      /* --------------------- */

      if (
        data.type ===
        "waiting_for_opponent"
      ) {
        setStatus(
          "Waiting for opponent to connect..."
        );

        return;
      }


      /* --------------------- */
      /* Both players ready    */
      /* --------------------- */

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


      /* --------------------- */
      /* Opponent started      */
      /* --------------------- */

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


      /* --------------------- */
      /* Game start            */
      /* --------------------- */

      if (
        data.type ===
        "game_start"
      ) {
        console.log(
          "Game starting:",
          data
        );

        gameStarted = true;

        startMatchButton.disabled =
          true;

        startMatchButton.style.display =
          "none";

        setStatus(
          "Match started!"
        );

        if (
          Array.isArray(
            data.questions
          )
        ) {
          showQuestions(
            data.questions
          );
        }

        submitButton.disabled =
          false;

        return;
      }


      /* --------------------- */
      /* Opponent disconnected */
      /* --------------------- */

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

        return;
      }


      /* --------------------- */
      /* Answer update         */
      /* --------------------- */

      if (
        data.type ===
        "answer_update"
      ) {
        console.log(
          "Opponent answer update:",
          data
        );

        return;
      }


      /* --------------------- */
      /* Game result           */
      /* --------------------- */

      if (
        data.type ===
        "game_result"
      ) {
        console.log(
          "Game result:",
          data
        );

        return;
      }
    }
  );


  /* ------------------------- */
  /* WebSocket error           */
  /* ------------------------- */

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

      if (!gameStarted && matchSocket === socket) {
        inQueue = false;
        matchId = null;
        playerId = null;

        startMatchButton.disabled = false;
        startMatchButton.textContent = "Retry";
      }
    }
  );


  /* ------------------------- */
  /* WebSocket closed          */
  /* ------------------------- */

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

      if (
        event.code !== 1000
      ) {
        console.log(
          "WebSocket closed unexpectedly."
        );

        if (!gameStarted && matchSocket === socket) {
          inQueue = false;
          matchId = null;
          playerId = null;

          setStatus(
            "Connection lost. Please try again."
          );

          startMatchButton.disabled = false;
          startMatchButton.textContent = "Retry";
        }
      }
    }
  );
}


/* ----------------------------- */
/* Start Match button            */
/* ----------------------------- */

startMatchButton.addEventListener(
  "click",
  () => {

    /* First click = Join Queue */

    if (!inQueue) {
      startMatchmaking();
      return;
    }


    /* Don't allow starting twice */

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


    /* Player is ready */

    playerReady = true;

    startMatchButton.disabled =
      true;

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


/* ----------------------------- */
/* Send a message to room        */
/* ----------------------------- */

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

  matchSocket.send(
    JSON.stringify(message)
  );

  return true;
}


/* ----------------------------- */
/* Submit answers                */
/* ----------------------------- */

submitButton.addEventListener(
  "click",
  () => {
    const answers = [];
    const questionCards = questionsDiv.querySelectorAll(".card");

    for (let i = 0; i < questionCards.length; i++) {
      const selectedInput = questionCards[i].querySelector(
        `input[name="question-${i}"]:checked`
      );

      if (!selectedInput) {
        setStatus(
          `Please answer question ${i + 1}`
        );
        return;
      }

      answers.push(parseInt(selectedInput.value, 10));
    }

    submitButton.disabled = true;

    const sent = sendRoomMessage({
      type: "submit_answers",
      answers: answers
    });

    if (sent) {
      setStatus("Answers submitted!");
    } else {
      submitButton.disabled = false;
      setStatus("Failed to submit answers.");
    }
  }
);


/* ----------------------------- */
/* Initial state                 */
/* ----------------------------- */

startMatchButton.disabled =
  false;

startMatchButton.textContent =
  "Join Queue";

submitButton.disabled =
  true;

setStatus(
  "Ready to join queue."
);