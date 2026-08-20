const questionsDiv = document.getElementById("questions");
const resultDiv = document.getElementById("result");
const startButton = document.getElementById("startButton");
const submitButton = document.getElementById("submitButton");
const timerDiv = document.getElementById("timer");

const API_URL =
    "https://scoreladderai-testing.scyyebiz.workers.dev/";

let questions = [];
let selectedAnswers = [];

let challengeStarted = false;
let challengeSubmitted = false;

let timeRemaining = 660;
let timerInterval = null;

async function loadDailyQuestions() {

    questionsDiv.innerHTML = `
        <div class="card">
            Loading today's questions...
        </div>
    `;

    try {

        const res = await fetch(API_URL, {
            method: "GET",
            cache: "no-store"
        });

        const data = await res.json();

        console.log("Daily question response:", data);

        if (!res.ok) {
            throw new Error(
                data?.error ||
                `Worker returned HTTP ${res.status}`
            );
        }

        if (
            !data ||
            !Array.isArray(data.questions) ||
            data.questions.length === 0
        ) {
            throw new Error(
                "No valid questions were returned."
            );
        }

        questions = data.questions.slice(0, 10);

        selectedAnswers = new Array(
            questions.length
        ).fill(-1);

        questionsDiv.innerHTML = `
            <div class="card">
                <h3>Ready?</h3>

                <p>
                    Click <b>Start Challenge</b> to begin.
                    You will have 11 minutes to answer all
                    ${questions.length} questions.
                </p>
            </div>
        `;

        submitButton.disabled = true;

    } catch (err) {

        console.error(
            "Failed to load daily questions:",
            err
        );

        questionsDiv.innerHTML = `
            <div class="card">
                <h3>Unable to load today's questions</h3>
                <p>${escapeHtml(err.message)}</p>
            </div>
        `;
    }
}

function startChallenge() {

    if (questions.length === 0) {
        alert(
            "Questions are still loading. Please wait."
        );
        return;
    }

    if (challengeStarted) {
        return;
    }

    challengeStarted = true;

    startButton.disabled = true;
    submitButton.disabled = true;

    timeRemaining = 660;

    updateTimer();

    renderQuestions();

    timerInterval = setInterval(() => {

        timeRemaining--;

        updateTimer();

        if (timeRemaining <= 0) {

            clearInterval(timerInterval);
            timerInterval = null;

            submitChallenge(true);
        }

    }, 1000);
}

function updateTimer() {

    const minutes =
        Math.floor(timeRemaining / 60);

    const seconds =
        timeRemaining % 60;

    timerDiv.textContent =
        `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderQuestions() {

    questionsDiv.innerHTML = "";

    questions.forEach((q, questionIndex) => {

        const choices =
            Array.isArray(q.choices)
                ? q.choices
                : Object.values(q.choices || {});

        const shuffled = choices
            .map((text, originalIndex) => ({
                text,
                originalIndex
            }))
            .sort(() => Math.random() - 0.5);

        q._shuffledChoices = shuffled;

        const card =
            document.createElement("div");

        card.className = "card";

        const questionNumber =
            document.createElement("div");

        questionNumber.className =
            "question-number";

        questionNumber.textContent =
            `Question ${questionIndex + 1}`;

        card.appendChild(questionNumber);

        const meta =
            document.createElement("div");

        meta.className = "meta";

        meta.textContent =
            `${q.topic || ""}` +
            `${q.difficulty
                ? " • " + q.difficulty
                : ""
            }`;

        card.appendChild(meta);

        const passage =
            document.createElement("div");

        passage.className = "passage";

        passage.innerHTML =
            formatPassage(q.passage);

        card.appendChild(passage);

        const questionText =
            document.createElement("p");

        questionText.textContent =
            q.question || "";

        card.appendChild(questionText);

        shuffled.forEach(
            (choice, choiceIndex) => {

                const button =
                    document.createElement("button");

                button.className = "choice";
                button.type = "button";

                const letter =
                    ["A", "B", "C", "D"][choiceIndex];

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
    });
}

function selectAnswer(
    questionIndex,
    choiceIndex
) {

    if (!challengeStarted) {
        return;
    }

    if (challengeSubmitted) {
        return;
    }

    selectedAnswers[questionIndex] =
        choiceIndex;

    const card =
        questionsDiv.children[questionIndex];

    const buttons =
        card.querySelectorAll(".choice");

    buttons.forEach(button => {
        button.classList.remove("selected");
    });


    buttons[choiceIndex]
        .classList.add("selected");

    updateSubmitButton();
}


function updateSubmitButton() {

    const allAnswered =
        selectedAnswers.every(
            answer => answer !== -1
        );

    submitButton.disabled =
        !allAnswered ||
        challengeSubmitted;
}

function submitChallenge(
    autoSubmitted = false
) {

    if (challengeSubmitted) {
        return;
    }

    if (!autoSubmitted) {

        const unanswered =
            selectedAnswers.filter(
                answer => answer === -1
            ).length;

        if (unanswered > 0) {

            alert(
                `You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}.`
            );

            return;
        }
    }


    challengeSubmitted = true;

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;
    }

    submitButton.disabled = true;

    let correct = 0;

    questions.forEach(
        (q, questionIndex) => {

            const selectedChoice =
                selectedAnswers[questionIndex];

            if (selectedChoice === -1) {
                return;
            }

            const shuffledChoice =
                q._shuffledChoices[selectedChoice];

            if (
                shuffledChoice.originalIndex ===
                q.answer
            ) {

                correct++;
            }
        }
    );


    const total =
        questions.length;

    const accuracy =
        Math.round(
            (correct / total) * 100
        );

    renderResults(
        correct,
        total,
        accuracy,
        autoSubmitted
    );
}

function renderResults(
    correct,
    total,
    accuracy,
    autoSubmitted
) {

    resultDiv.innerHTML = `
        <div class="card result-card">

            <h2>Challenge Complete</h2>

            <div class="score">
                ${correct}/${total}
            </div>

            <div class="accuracy">
                Accuracy: ${accuracy}%
            </div>

            ${
                autoSubmitted
                    ? `
                        <p>
                            Time ran out.
                            Your answers were submitted
                            automatically.
                        </p>
                    `
                    : `
                        <p>
                            You answered every question.
                        </p>
                    `
            }

        </div>
    `;

    questions.forEach(
        (q, questionIndex) => {

            const card =
                questionsDiv.children[questionIndex];

            if (!card) {
                return;
            }


            const selected =
                selectedAnswers[questionIndex];

            const correctChoice =
                q._shuffledChoices.findIndex(
                    choice =>
                        choice.originalIndex ===
                        q.answer
                );


            const buttons =
                card.querySelectorAll(".choice");


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
                (button, choiceIndex) => {

                    button.disabled = true;

                    if (
                        choiceIndex === correctChoice
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

function formatPassage(text) {

    if (typeof text !== "string") {
        return "";
    }

    return escapeHtml(text)

        .replace(
            /\[UNDERLINED\](.*?)\[\/UNDERLINED\]/g,
            "<u>$1</u>"
        )

        .replace(
            /\n/g,
            "<br>"
        );
}

function escapeHtml(text) {

    return String(text)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );
}

startButton.addEventListener(
    "click",
    startChallenge
);

submitButton.addEventListener(
    "click",
    () => submitChallenge(false)
);

loadDailyQuestions();