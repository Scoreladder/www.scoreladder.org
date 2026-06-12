const topicInput = document.getElementById("topicInput");
const searchBtn = document.getElementById("searchBtn");
const aiBtn = document.getElementById("aiBtn");

const resultDiv = document.getElementById("result");
const questionsDiv = document.getElementById("questions");

let currentText = "";

searchBtn.addEventListener("click", searchArticle);
aiBtn.addEventListener("click", generateAIQuestions);

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////
async function searchArticle() {

    const topic = topicInput.value.trim();

    if (!topic) {
        resultDiv.innerHTML = `<div class="card">Enter a topic.</div>`;
        return;
    }

    aiBtn.disabled = true;
    questionsDiv.innerHTML = "";
    resultDiv.innerHTML = `<div class="card">Loading Wikipedia...</div>`;

    try {
        await loadWikipediaPage(topic);
    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = `
            <div class="card">
                Failed to load page.<br><br>
                ${escapeHtml(err.message)}
            </div>
        `;
    }
}

//////////////////////////////////////////////////////
// PURE WIKIPEDIA PAGE FETCH (NO OTHER SOURCES)
//////////////////////////////////////////////////////
async function loadWikipediaPage(topic) {

    // 1. GET PAGE TITLE FROM WIKIPEDIA SEARCH
    const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`
    );

    const searchData = await searchRes.json();

    if (!searchData.query?.search?.length) {
        throw new Error("No Wikipedia page found.");
    }

    const title = searchData.query.search[0].title;

    // 2. FETCH FULL PAGE EXTRACT
    const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );

    const pageData = await pageRes.json();
    const page = Object.values(pageData.query.pages)[0];

    if (!page?.extract) {
        throw new Error("No page text found.");
    }

    // 3. CLEAN TEXT
    const text = cleanText(page.extract);

    // 4. SPLIT INTO PARAGRAPHS
    const paragraphs = text
        .split("\n\n")
        .map(p => p.trim())
        .filter(p => p.length > 80);

    if (paragraphs.length < 2) {
        throw new Error("Not enough Wikipedia content.");
    }

    // 5. TAKE FIRST 2–3 PARAGRAPHS (REAL ARTICLE TEXT ONLY)
    const excerpt = paragraphs.slice(0, 3).join("\n\n");

    currentText = excerpt;
    aiBtn.disabled = false;

    // 6. BUILD REAL WIKIPEDIA LINK (NOT FROM API)
    const link =
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="meta">Source: Wikipedia</div>

            <div class="abstract">${escapeHtml(excerpt)}</div>

            <br>
            <a href="${link}" target="_blank">View Article</a>
        </div>
    `;
}

//////////////////////////////////////////////////////
// TEXT CLEANING
//////////////////////////////////////////////////////
function cleanText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

//////////////////////////////////////////////////////
// AI QUESTIONS (unchanged)
//////////////////////////////////////////////////////
async function generateAIQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Generating SAT questions...</div>`;

    const res = await fetch("https://ai.scoreladder.org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText })
    });

    const data = await res.json();
    renderQuestions(data);
}

function renderQuestions(data) {

    if (!data.questions) {
        questionsDiv.innerHTML =
            `<div class="card">Invalid response</div>`;
        return;
    }

    questionsDiv.innerHTML = "";

    data.questions.forEach((q, i) => {

        const shuffled = q.choices
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

//////////////////////////////////////////////////////
// SAFE HTML
//////////////////////////////////////////////////////
function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
