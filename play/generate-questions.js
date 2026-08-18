const aiBtn = document.getElementById("aiBtn");

const questionsDiv = document.getElementById("questions");

/* ---------------------------
   EVENTS
---------------------------- */
aiBtn.addEventListener("click", generateAIQuestions);

/* ---------------------------
   AI QUESTION GENERATION
---------------------------- */
async function generateAIQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Generating SAT questions...</div>`;

    aiBtn.disabled = true;

    try {

        const res = await fetch("https://scoreladderai-testing.scyyebiz.workers.dev/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });

        if (!res.ok) {
            throw new Error(await res.text());
        }

        const data = await res.json();

        renderQuestions(data);

    } catch (err) {
        console.error(err);

        questionsDiv.innerHTML = `
            <div class="card">
                Error generating questions:<br><br>
                ${escapeHtml(err.message)}
            </div>
        `;
    } finally {
        aiBtn.disabled = false;
    }
}

/* ---------------------------
   RENDER QUESTIONS
---------------------------- */
function renderQuestions(data) {

    if (!data.questions) {
        questionsDiv.innerHTML =
            `<div class="card">Invalid AI response</div>`;
        return;
    }

    questionsDiv.innerHTML = "";

    data.questions.forEach((q, i) => {

        const shuffled = Object.values(q.choices)
            .map((c, idx) => ({ text: c, idx }))
            .sort(() => Math.random() - 0.5);

        const correct = shuffled.findIndex(c => c.idx === q.answer);

        questionsDiv.innerHTML += `
            <div class="card">
                <h3>Question ${i + 1}</h3>

                <div class="passage">
                  ${escapeHtml(q.passage)
                  }
                </div>
                
                <p>${escapeHtml(q.question)}</p>

                ${shuffled.map((c, idx) => `
                    <div class="choice">
                        <b>${["A","B","C","D"][idx]}.</b>
                        ${escapeHtml(c.text)}
                    </div>
                `).join("")}

                <div class="answer">
                    Answer: ${["A","B","C","D"][correct]}
                </div>
            </div>
        `;
    });
}

/* ---------------------------
   SAFE HTML
---------------------------- */
function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}