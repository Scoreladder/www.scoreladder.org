const questionsDiv = document.getElementById("questions");

const API_URL =
    "https://scoreladderai-testing.scyyebiz.workers.dev/";

/* ---------------------------
   LOAD DAILY QUESTIONS
---------------------------- */

async function loadDailyQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Loading today's questions...</div>`;

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

        renderQuestions(data);

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


/* ---------------------------
   RENDER QUESTIONS
---------------------------- */

function renderQuestions(data) {

    if (
        !data ||
        !Array.isArray(data.questions)
    ) {

        questionsDiv.innerHTML = `
            <div class="card">
                Invalid question set received.
            </div>
        `;

        console.error(
            "Invalid question data:",
            data
        );

        return;
    }

    if (data.questions.length === 0) {

        questionsDiv.innerHTML = `
            <div class="card">
                Today's question set is empty.
            </div>
        `;

        return;
    }

    questionsDiv.innerHTML = "";

    data.questions.forEach((q, i) => {

        /*
         * Your worker currently returns choices
         * as an ARRAY:
         *
         * [
         *   "choice A",
         *   "choice B",
         *   "choice C",
         *   "choice D"
         * ]
         */

        const choices =
            Array.isArray(q.choices)
                ? q.choices
                : Object.values(q.choices || {});

        /*
         * Shuffle choices while keeping track
         * of the original answer index.
         */

        const shuffled =
            choices
                .map((text, idx) => ({
                    text,
                    originalIndex: idx
                }))
                .sort(
                    () =>
                        Math.random() - 0.5
                );

        const correctIndex =
            shuffled.findIndex(
                choice =>
                    choice.originalIndex ===
                    q.answer
            );

        questionsDiv.innerHTML += `
            <div class="card">

                <h3>
                    Question ${i + 1}
                </h3>

                <div class="meta">
                    ${escapeHtml(
                        q.topic || ""
                    )}
                    ${
                        q.difficulty
                            ? ` • ${escapeHtml(q.difficulty)}`
                            : ""
                    }
                </div>

                <div class="passage">
                    ${formatPassage(
                        q.passage
                    )}
                </div>

                <p>
                    ${escapeHtml(
                        q.question
                    )}
                </p>

                ${shuffled.map(
                    (choice, idx) => `
                        <div class="choice">
                            <b>
                                ${
                                    ["A", "B", "C", "D"][idx]
                                }.
                            </b>

                            ${escapeHtml(
                                choice.text
                            )}
                        </div>
                    `
                ).join("")}

                <div class="answer">
                    Answer:
                    ${
                        correctIndex >= 0
                            ? ["A", "B", "C", "D"][
                                correctIndex
                              ]
                            : "Unknown"
                    }
                </div>

            </div>
        `;
    });

    console.log(
        `Rendered ${data.questions.length} questions.`
    );
}


/* ---------------------------
   PASSAGE FORMATTING
---------------------------- */

function formatPassage(text) {

    if (
        typeof text !== "string"
    ) {
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


/* ---------------------------
   SAFE HTML
---------------------------- */

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


/* ---------------------------
   LOAD ON PAGE OPEN
---------------------------- */

loadDailyQuestions();