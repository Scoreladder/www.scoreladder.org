const questionsDiv = document.getElementById("questions");
const resultDiv = document.getElementById("result");
const startButton = document.getElementById("startButton");
const submitButton = document.getElementById("submitButton");
const timerDiv = document.getElementById("timer");

// AI worker: generates/serves the daily questions
const QUESTION_API_URL =
    "https://dailyai-rw.scoreladder.org/";

// Auth API: handles sessions, users, stats, and score submission
const AUTH_API_URL =
    "https://auth.scoreladder.org";

const LOCAL_SESSION_KEY =
    "scoreladder_session";

let questions = [];
let selectedAnswers = [];
let challengeStarted = false;
let challengeSubmitted = false;
let submissionInProgress = false;
let autoSubmitFailed = false;
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


/* =========================================================
   NORMALIZE TOPIC
   ========================================================= */

function normalizeTopic(topic) {
    if (typeof topic !== "string") {
        return null;
    }

    const normalized = topic.trim().toLowerCase();

    return TOPIC_ALIASES[normalized] ?? null;
}


/* =========================================================
   CHECK AUTHENTICATION
   ========================================================= */

async function getCurrentUser() {
    try {
        const params =
            new URLSearchParams(window.location.search);

        // First check whether the auth worker
        // redirected us here with ?session=...
        const urlSession =
            params.get("session");

        let sessionId = urlSession;

        // Save the session so it survives navigation.
        if (urlSession) {
            try {
                sessionStorage.setItem(
                    LOCAL_SESSION_KEY,
                    urlSession
                );
            } catch (error) {
                console.error(
                    "Failed to save session:",
                    error
                );
            }
        }

        // Otherwise use the session saved previously.
        if (!sessionId) {
            try {
                sessionId =
                    sessionStorage.getItem(
                        LOCAL_SESSION_KEY
                    );
            } catch (error) {
                console.error(
                    "Failed to read session:",
                    error
                );
            }
        }

        let meUrl =
            `${AUTH_API_URL}/me`;

        if (sessionId) {
            meUrl =
                `${AUTH_API_URL}/me?session=${encodeURIComponent(
                    sessionId
                )}`;
        }

        console.log(
            "Checking authentication:",
            {
                sessionFound: Boolean(sessionId)
            }
        );

        const response =
            await fetch(
                meUrl,
                {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store"
                }
            );

        const text =
            await response.text();

        let data;

        try {
            data =
                JSON.parse(text);
        } catch {
            data = null;
        }

        console.log(
            "Authentication check:",
            {
                status: response.status,
                ok: response.ok,
                data
            }
        );

        if (!response.ok) {
            return null;
        }

        return data;

    } catch (error) {
        console.error(
            "Failed to check authentication:",
            error
        );

        return null;
    }
}


/* =========================================================
   LOAD DAILY QUESTIONS
   ========================================================= */

async function loadDailyQuestions() {
    questionsDiv.innerHTML = `
        <div class="card">
            Loading today's questions...
        </div>
    `;

    try {
        console.log(
            "Loading daily questions from:",
            QUESTION_API_URL
        );

        const res =
            await fetch(
                QUESTION_API_URL,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );

        const responseText =
            await res.text();

        let data;

        try {
            data =
                JSON.parse(responseText);
        } catch (parseError) {
            console.error(
                "Question worker returned invalid JSON:",
                responseText
            );

            throw new Error(
                "The question worker returned invalid JSON."
            );
        }

        console.log(
            "Daily question response:",
            data
        );

        if (!res.ok) {
            throw new Error(
                data?.error ||
                `Question worker returned HTTP ${res.status}`
            );
        }

        /*
         * IMPORTANT:
         *
         * The current question worker returns a TOP-LEVEL ARRAY:
         *
         * [
         *   {
         *     topic: "...",
         *     question: "...",
         *     choices: [...],
         *     answer: 0,
         *     ...
         *   }
         * ]
         *
         * Older/frontend code expected:
         *
         * {
         *   questions: [...]
         * }
         *
         * Accept both formats.
         */

        let rawQuestions;

        if (Array.isArray(data)) {
            rawQuestions = data;

            console.log(
                "Question worker returned a top-level question array."
            );
        } else if (
            data &&
            Array.isArray(data.questions)
        ) {
            rawQuestions = data.questions;

            console.log(
                "Question worker returned { questions: [...] }."
            );
        } else {
            throw new Error(
                "The question worker returned an invalid question format."
            );
        }

        if (rawQuestions.length === 0) {
            throw new Error(
                "No questions were returned by the question worker."
            );
        }

        /*
         * The daily challenge requires exactly 10 questions.
         */

        const candidateQuestions =
            rawQuestions.slice(0, 10);

        const invalidQuestions = [];

        const hasValidQuestion =
            (question, index) => {

                /*
                 * choices may be an array:
                 *
                 * ["A", "B", "C", "D"]
                 *
                 * or an object:
                 *
                 * {
                 *   A: "...",
                 *   B: "...",
                 *   C: "...",
                 *   D: "..."
                 * }
                 */

                const choices =
                    Array.isArray(question?.choices)
                        ? question.choices
                        : Object.values(
                            question?.choices ?? {}
                        );

                const normalizedTopic =
                    normalizeTopic(
                        question?.topic
                    );

                const problems = [];

                if (!normalizedTopic) {
                    problems.push(
                        `invalid topic "${question?.topic ?? "(missing)"}"`
                    );
                }

                if (choices.length !== 4) {
                    problems.push(
                        `expected 4 choices, got ${choices.length}`
                    );
                }

                /*
                 * The worker is currently expected to send
                 * the correct answer as an integer 0-3.
                 */

                if (
                    !Number.isInteger(
                        question?.answer
                    ) ||
                    question.answer < 0 ||
                    question.answer >= choices.length
                ) {
                    problems.push(
                        `invalid answer "${question?.answer}"`
                    );
                }

                if (
                    typeof question?.question !==
                    "string" ||
                    question.question.trim() === ""
                ) {
                    problems.push(
                        "missing question text"
                    );
                }

                if (
                    typeof question?.passage !==
                    "string"
                ) {
                    problems.push(
                        "missing passage"
                    );
                }

                if (problems.length > 0) {
                    invalidQuestions.push({
                        index: index + 1,
                        problems
                    });

                    return false;
                }

                return true;
            };

        const allValid =
            candidateQuestions.every(
                hasValidQuestion
            );

        /*
         * Require exactly 10 questions.
         */

        if (
            candidateQuestions.length !== 10 ||
            !allValid
        ) {
            console.error(
                "Invalid daily questions:",
                {
                    received:
                        rawQuestions.length,
                    accepted:
                        candidateQuestions.length,
                    invalidQuestions
                }
            );

            if (
                candidateQuestions.length !== 10
            ) {
                throw new Error(
                    `The daily challenge returned ${candidateQuestions.length} questions, but exactly 10 are required.`
                );
            }

            if (
                invalidQuestions.length > 0
            ) {
                const details =
                    invalidQuestions
                        .map(
                            item =>
                                `Question ${item.index}: ${item.problems.join(", ")}`
                        )
                        .join("; ");

                throw new Error(
                    `Invalid daily question data. ${details}`
                );
            }

            throw new Error(
                "The daily challenge contained invalid questions."
            );
        }

        /*
         * Normalize every question before storing it.
         */

        questions =
            candidateQuestions.map(
                question => {

                    const normalizedTopic =
                        normalizeTopic(
                            question.topic
                        );

                    return {
                        ...question,

                        originalTopic:
                            question.topic,

                        topic:
                            normalizedTopic
                    };
                }
            );

        console.log(
            "Loaded and normalized daily questions:",
            questions.map(
                (q, index) => ({
                    number: index + 1,
                    originalTopic:
                        q.originalTopic,
                    normalizedTopic:
                        q.topic,
                    answer:
                        q.answer,
                    choiceCount:
                        Array.isArray(q.choices)
                            ? q.choices.length
                            : Object.keys(
                                q.choices || {}
                            ).length
                })
            )
        );

        selectedAnswers =
            new Array(
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

        questions = [];
        selectedAnswers = [];

        questionsDiv.innerHTML = `
            <div class="card">
                <h3>
                    Unable to load today's questions
                </h3>

                <p>
                    ${escapeHtml(
                        err?.message ||
                        "Unknown question-loading error."
                    )}
                </p>
            </div>
        `;
    }
}


/* =========================================================
   START CHALLENGE
   ========================================================= */

async function startChallenge() {

    if (questions.length === 0) {
        alert(
            "Questions are still loading. Please wait."
        );

        return;
    }

    if (challengeStarted) {
        return;
    }

    /*
     * Check the actual authenticated session.
     */

    const user =
        await getCurrentUser();

    if (!user) {
        alert(
            "You must be logged in to complete the daily challenge."
        );

        return;
    }

challengeStarted = true;
challengeSubmitted = false;
submissionInProgress = false;
autoSubmitFailed = false;

startButton.disabled = true;
submitButton.disabled = true;

timeRemaining = 660;

challengeDeadline =
    Date.now() + 660000;

    updateTimer();

    renderQuestions();

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
                    clearInterval(
                        timerInterval
                    );

                    timerInterval = null;

                    submitChallenge(true);
                }

            },
            1000
        );
}


/* =========================================================
   TIMER
   ========================================================= */

function updateTimer() {

    const minutes =
        Math.floor(
            timeRemaining / 60
        );

    const seconds =
        timeRemaining % 60;

    timerDiv.textContent =
        `${minutes}:${String(seconds).padStart(2, "0")}`;
}


/* =========================================================
   RENDER QUESTIONS
   ========================================================= */

function renderQuestions() {

    questionsDiv.innerHTML = "";

    questions.forEach(
        (q, questionIndex) => {

            const choices =
                Array.isArray(q.choices)
                    ? q.choices
                    : Object.values(
                        q.choices || {}
                    );

            /*
             * Shuffle the choices visually while preserving
             * their original indexes so q.answer remains valid.
             */

            const shuffled =
                choices
                    .map(
                        (text, originalIndex) => ({
                            text,
                            originalIndex
                        })
                    )
                    .sort(
                        () =>
                            Math.random() - 0.5
                    );

            q._shuffledChoices =
                shuffled;

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
                `Question ${questionIndex + 1}`;

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
                        ? " • " + q.difficulty
                        : ""
                }`;

            card.appendChild(
                meta
            );

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

            const questionText =
                document.createElement(
                    "p"
                );

            questionText.textContent =
                q.question || "";

            card.appendChild(
                questionText
            );

            shuffled.forEach(
                (choice, choiceIndex) => {

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

    if (!challengeStarted) {
        return;
    }

    if (challengeSubmitted) {
        return;
    }

    if (submissionInProgress) {
        return;
    }

    selectedAnswers[
        questionIndex
    ] = choiceIndex;

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

    if (buttons[choiceIndex]) {
        buttons[choiceIndex]
            .classList.add(
                "selected"
            );
    }

    updateSubmitButton();
}


/* =========================================================
   UPDATE SUBMIT BUTTON
   ========================================================= */

function updateSubmitButton(
    forceEnabled = false
) {

    const allAnswered =
        selectedAnswers.every(
            answer => answer !== -1
        );

    submitButton.disabled =
        (!allAnswered && !forceEnabled) ||
        challengeSubmitted ||
        submissionInProgress;
}

/* =========================================================
   SUBMIT DAILY CHALLENGE
   ========================================================= */

async function submitChallenge(
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
                    unanswered === 1
                        ? ""
                        : "s"
                }.`
            );

            return;
        }
    }

    submissionInProgress = true;
    submitButton.disabled = true;

    if (timerInterval) {
        clearInterval(
            timerInterval
        );

        timerInterval = null;
    }

try {

    let correct = 0;

    const results = [];

    questions.forEach(
        (q, questionIndex) => {

            const selectedChoice =
                selectedAnswers[
                    questionIndex
                ];

            let isCorrect = false;

            if (
                selectedChoice !== -1
            ) {

                const shuffledChoice =
                    q._shuffledChoices[
                        selectedChoice
                    ];

                isCorrect =
                    shuffledChoice.originalIndex ===
                    q.answer;

                if (isCorrect) {
                    correct++;
                }
            }

            const normalizedTopic =
                normalizeTopic(
                    q.topic
                );

            if (!normalizedTopic) {
                console.error(
                    "Cannot submit unknown topic:",
                    q.topic
                );

                throw new Error(
                    `Unknown question topic: ${q.topic}`
                );
            }

            results.push({
                topic:
                    normalizedTopic,
                correct:
                    isCorrect
            });
        }
    );

    const total =
        questions.length;

    const accuracy =
        Math.round(
            (correct / total) * 100
        );

    console.log(
        "Submitting daily challenge results:",
        results
    );

        let sessionId = null;

        try {

            const params =
                new URLSearchParams(
                    window.location.search
                );

            sessionId =
                params.get("session") ||
                sessionStorage.getItem(
                    LOCAL_SESSION_KEY
                );

        } catch (error) {

            console.error(
                "Failed to retrieve session:",
                error
            );
        }

        let saveUrl =
            `${AUTH_API_URL}/daily-complete`;

        if (sessionId) {

            saveUrl =
                `${AUTH_API_URL}/daily-complete?session=${encodeURIComponent(
                    sessionId
                )}`;
        }

        console.log(
            "Submitting daily challenge:",
            {
                sessionFound:
                    Boolean(sessionId)
            }
        );

        const saveResponse =
            await fetch(
                saveUrl,
                {
                    method: "POST",

                    credentials: "include",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            results
                        })
                }
            );

        const responseText =
            await saveResponse.text();

        let saveData;

        try {

            saveData =
                JSON.parse(
                    responseText
                );

        } catch {

            saveData = {
                error:
                    responseText ||
                    "Auth worker returned a non-JSON response."
            };
        }

        console.log(
            "Daily challenge save response:",
            {
                status:
                    saveResponse.status,

                ok:
                    saveResponse.ok,

                data:
                    saveData
            }
        );

        if (
            saveResponse.status === 401
        ) {

            throw new Error(
                "Your login session is invalid or expired. Please log in again."
            );
        }

        if (
            saveResponse.status === 409
        ) {

            throw new Error(
                saveData?.error ||
                "You have already completed today's challenge."
            );
        }

        if (!saveResponse.ok) {

            throw new Error(
                saveData?.error ||
                `Failed to save results (HTTP ${saveResponse.status})`
            );
        }

challengeSubmitted = true;
submissionInProgress = false;
autoSubmitFailed = false;

renderResults(
            saveData.correct ?? correct,
            saveData.total ?? total,
            saveData.accuracy ?? accuracy,
            autoSubmitted
        );

} catch (err) {
    console.error(
        "Failed to save daily challenge:",
        err
    );

    submissionInProgress = false;
    challengeSubmitted = false;

    autoSubmitFailed =
        autoSubmitted;

    updateSubmitButton(
        autoSubmitted
    );

    alert(
        `Failed to save your results.\n\n${
            err.message
        }`
    );

    if (
        !autoSubmitted &&
        challengeStarted &&
        timeRemaining > 0 &&
        !timerInterval
    ) {
        challengeDeadline =
            Date.now() +
            timeRemaining * 1000;

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
                        clearInterval(
                            timerInterval
                        );

                        timerInterval = null;

                        submitChallenge(
                            true
                        );
                    }
                },
                1000
            );
    }
}
}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

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
                            ["A", "B", "C", "D"][
                                selected
                            ]
                        }.
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
                            ["A", "B", "C", "D"][
                                correctChoice
                            ]
                        }
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
   FORMAT PASSAGE
   ========================================================= */

function formatPassage(text) {

    if (typeof text !== "string") {
        return "";
    }

    return escapeHtml(text)
        .replace(
            /\[UNDERLINED\]\((.*?)\[\/UNDERLINED\]\)/g,
            "<u>$1</u>"
        )
        .replace(
            /\n/g,
            "<br>"
        );
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

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


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

startButton.addEventListener(
    "click",
    startChallenge
);

submitButton.addEventListener(
    "click",
    () =>
        submitChallenge(autoSubmitFailed)
);


/* =========================================================
   INITIAL LOAD
   ========================================================= */

loadDailyQuestions();