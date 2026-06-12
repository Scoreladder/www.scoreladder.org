const DEBUG = true;

function log(...args) {
    if (DEBUG) {
        console.log("[WikiDebug]", ...args);
    }
}

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

    log("User input:", topic);

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
        log("ERROR:", err.message, err.stack);

        resultDiv.innerHTML = `
            <div class="card">
                Failed to load page.<br><br>
                ${escapeHtml(err.message)}
            </div>
        `;
    }
}

//////////////////////////////////////////////////////
// WIKIPEDIA FETCH
//////////////////////////////////////////////////////
async function loadWikipediaPage(topic) {

    log("Starting Wikipedia search...");

    // 1. SEARCH TITLE
    const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`
    );

    const searchData = await searchRes.json();

    log("Search response:", searchData);

    if (!searchData.query?.search?.length) {
        throw new Error("No Wikipedia page found.");
    }

    const title = searchData.query.search[0].title;

    log("Selected title:", title);

    // 2. GET PAGE EXTRACT
    const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );

    const pageData = await pageRes.json();
    const page = Object.values(pageData.query.pages)[0];

    if (!page?.extract) {
        throw new Error("No Wikipedia content found.");
    }

    log("Raw extract length:", page.extract.length);
    log("Raw extract preview:", page.extract.slice(0, 200));

    const text = cleanText(page.extract);

    log("Cleaned text length:", text.length);

    // 3. STUB CHECK
    if (text.length < 400) {
        throw new Error("Wikipedia page too short (likely stub). Try a broader topic.");
    }

    // 4. PARAGRAPH EXTRACTION
    const paragraphs = extractParagraphs(text);

    log("Paragraph count:", paragraphs.length);
    log("Paragraph sample:", paragraphs.slice(0, 2));

    if (paragraphs.length < 2) {
        throw new Error("Not enough usable Wikipedia content.");
    }

    // 5. PICK RANDOM PASSAGE (2–3 PARAGRAPHS)
    const maxStart = Math.max(0, paragraphs.length - 3);
    const start = Math.floor(Math.random() * (maxStart + 1));

    const excerpt = paragraphs.slice(start, start + 3).join("\n\n");

    log("Passage start index:", start);
    log("Final excerpt:", excerpt.slice(0, 300));

    currentText = excerpt;
    aiBtn.disabled = false;

    // 6. BUILD LINK
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
// PARAGRAPH EXTRACTION
//////////////////////////////////////////////////////
function extractParagraphs(text) {

    const cleaned = text
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    let raw = cleaned.split("\n\n");

    if (raw.length < 2) {
        raw = cleaned.split("\n");
    }

    return raw
        .map(p => p.trim())
        .filter(p =>
            p.length > 30 &&
            !/^(references|see also|external links)/i.test(p)
        );
}

//////////////////////////////////////////////////////
// CLEAN TEXT
//////////////////////////////////////////////////////
function cleanText(text) {
    return text
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

//////////////////////////////////////////////////////
// AI QUESTIONS
//////////////////////////////////////////////////////
async function generateAIQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Generating SAT questions...</div>`;

    try {

        const res = await fetch("https://ai.scoreladder.org", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: currentText })
        });

        const data = await res.json();
        renderQuestions(data);

    } catch (err) {
        console.error(err);
        log("AI ERROR:", err.message);

        questionsDiv.innerHTML =
            `<div class="card">${escapeHtml(err.message)}</div>`;
    }
}

//////////////////////////////////////////////////////
// QUESTIONS RENDER
//////////////////////////////////////////////////////
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
