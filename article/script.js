questionButton.addEventListener(
    "click",
    generateAIQuestions
);

async function generateAIQuestions() {

    if (!currentAbstract) return;

    questionsDiv.innerHTML = `
        <div class="card">
            Generating SAT-style questions...
        </div>
    `;

    try {

        const response = await fetch(
            "https://YOUR-WORKER-URL.workers.dev",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    text: currentAbstract
                })
            }
        );

        const data =
            await response.json();

        renderAIQuestions(data);

    } catch (err) {

        console.error(err);

        questionsDiv.innerHTML = `
            <div class="card">
                Failed to generate questions.
            </div>
        `;
    }
}

function renderAIQuestions(data) {

    if (!data.questions) {

        questionsDiv.innerHTML = `
            <div class="card">
                AI failed to generate questions.
            </div>
        `;

        return;
    }

    questionsDiv.innerHTML = "";

    data.questions.forEach((q, index) => {

        questionsDiv.innerHTML += `
            <div class="card">

                <h2>
                    Question ${index + 1}
                </h2>

                <p>
                    ${escapeHtml(q.question)}
                </p>

                ${q.choices.map((choice, i) => `
                    <div class="choice">
                        <strong>
                            ${["A","B","C","D"][i]}.
                        </strong>

                        ${escapeHtml(choice)}
                    </div>
                `).join("")}

                <div class="answer">
                    Correct Answer:
                    ${["A","B","C","D"][q.answer]}
                </div>

            </div>
        `;
    });
}
