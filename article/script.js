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
