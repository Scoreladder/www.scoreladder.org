const topicInput = document.getElementById("topicInput");
const searchBtn = document.getElementById("searchBtn");
const aiBtn = document.getElementById("aiBtn");

const resultDiv = document.getElementById("result");
const questionsDiv = document.getElementById("questions");

let currentText = "";

/* ---------------------------
   EVENTS
---------------------------- */
searchBtn.addEventListener("click", searchArticle);
aiBtn.addEventListener("click", generateAIQuestions);

/* ---------------------------
   SEARCH WIKIPEDIA
---------------------------- */
async function searchArticle() {

    const topic = topicInput.value.trim();

    resultDiv.innerHTML = `<div class="card">Loading Wikipedia...</div>`;
    questionsDiv.innerHTML = "";
    currentText = "";
    aiBtn.disabled = true;

    if (!topic) {
        resultDiv.innerHTML = `<div class="card">Enter a topic.</div>`;
        return;
    }

    try {

        // 1. SEARCH TITLE
        const searchRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`
        );

        const searchData = await searchRes.json();

        if (!searchData.query?.search?.length) {
            throw new Error("No Wikipedia page found.");
        }

        const title = searchData.query.search[0].title;

        // 2. GET HTML EXTRACT
        const htmlRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*`
        );

        const htmlData = await htmlRes.json();

        const htmlString = htmlData.parse?.text?.["*"];

        if (!htmlString) {
            throw new Error("No Wikipedia content returned.");
        }

        // 3. PARSE HTML
        const doc = new DOMParser().parseFromString(htmlString, "text/html");

        let paragraphs = Array.from(doc.querySelectorAll("p"))
            .map(p => p.textContent.trim())
            .filter(p =>
                p.length > 40 &&
                !p.toLowerCase().includes("coordinates") &&
                !p.toLowerCase().includes("listen") &&
                !p.toLowerCase().includes("pronunciation")
            );

        if (paragraphs.length < 2) {
            throw new Error("Not enough Wikipedia paragraphs found.");
        }

        // 4. PICK 2 RANDOM PARAGRAPHS
        paragraphs = paragraphs.sort(() => Math.random() - 0.5);
        const selected = paragraphs.slice(0, 2).join("\n\n");

        currentText = selected;
        aiBtn.disabled = false;

        // 5. BUILD LINK
        const link =
            `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`;

        // 6. RENDER
        resultDiv.innerHTML = `
            <div class="card">
                <div class="title">${escapeHtml(title)}</div>
                <div class="meta">Source: Wikipedia</div>

                <div class="abstract">${escapeHtml(selected)}</div>

                <br>
                <a href="${link}" target="_blank">View Article</a>
            </div>
        `;

    } catch (err) {
        console.error(err);

        resultDiv.innerHTML = `
            <div class="card">
                Error: ${escapeHtml(err.message)}
            </div>
        `;
    }
}

/* ---------------------------
   AI QUESTION GENERATION
---------------------------- */
async function generateAIQuestions() {

    if (!currentText) {
        questionsDiv.innerHTML = `
            <div class="card">Load an article first.</div>
        `;
        return;
    }

    questionsDiv.innerHTML =
        `<div class="card">Generating SAT questions...</div>`;

    aiBtn.disabled = true;

    try {

        const res = await fetch("https://ai.scoreladder.org", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: currentText
            })
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
