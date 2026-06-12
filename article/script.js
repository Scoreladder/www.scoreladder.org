const topicInput = document.getElementById("topicInput");
const searchBtn = document.getElementById("searchBtn");
const aiBtn = document.getElementById("aiBtn");
const sourceSwitch = document.getElementById("sourceSwitch");

const resultDiv = document.getElementById("result");
const questionsDiv = document.getElementById("questions");

let currentText = "";

searchBtn.addEventListener("click", searchArticle);
aiBtn.addEventListener("click", generateAIQuestions);

//////////////////////////////////////////////////////
// MAIN ROUTER
//////////////////////////////////////////////////////
async function searchArticle() {

    const topic = topicInput.value.trim();

    if (!topic) {
        resultDiv.innerHTML = `<div class="card">Enter a topic.</div>`;
        return;
    }

    aiBtn.disabled = true;
    questionsDiv.innerHTML = "";
    resultDiv.innerHTML = `<div class="card">Loading...</div>`;

    try {

        if (sourceSwitch.checked) {
            await searchGutenberg(topic);
        } else {
            await searchWikipedia(topic);
        }

    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = `
            <div class="card">
                Failed to load article.<br><br>
                ${escapeHtml(err.message)}
            </div>
        `;
    }
}

//////////////////////////////////////////////////////
// WIKIPEDIA (STRICT ENGLISH + RELEVANCE FILTER)
//////////////////////////////////////////////////////
async function searchWikipedia(topic) {

    const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=20`
    );

    const searchData = await searchRes.json();

    if (!searchData.query?.search?.length) {
        throw new Error("No Wikipedia results found.");
    }

    const queryWords = topic.toLowerCase().split(/\s+/);

    // Score results for relevance
    const scored = searchData.query.search.map(item => {

        const title = item.title.toLowerCase();
        const snippet = item.snippet.toLowerCase();

        let score = 0;

        for (const word of queryWords) {
            if (title.includes(word)) score += 50;
            if (snippet.includes(word)) score += 20;
        }

        return { item, score };
    });

    // Sort best match first
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    // 🔥 HARD FILTER: must be somewhat relevant
    if (best.score < 30) {
        throw new Error("No closely related Wikipedia article found. Try a more specific topic.");
    }

    const title = best.item.title;

    const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );

    const pageData = await pageRes.json();
    const page = Object.values(pageData.query.pages)[0];

    let text = page.extract || "";

    // English enforcement heuristic
    if (!isEnglishText(text)) {
        throw new Error("Non-English or low-quality article detected. Try again.");
    }

    currentText = text;

    aiBtn.disabled = currentText.length < 200;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(title)}</div>

            <div class="meta">
                Source: Wikipedia (English)
            </div>

            <div class="abstract">
                ${escapeHtml(text)}
            </div>
        </div>
    `;
}

//////////////////////////////////////////////////////
// GUTENBERG (ENGLISH FILTER + CLEANING)
//////////////////////////////////////////////////////
async function searchGutenberg(topic) {

    const res = await fetch(
        `https://gutendex.com/books/?search=${encodeURIComponent(topic)}`
    );

    const data = await res.json();

    if (!data.results?.length) {
        throw new Error("No books found.");
    }

    const queryWords = topic.toLowerCase().split(/\s+/);

    // pick best matching book instead of random
    const scored = data.results.map(book => {

        const title = (book.title || "").toLowerCase();
        const author = (book.authors?.[0]?.name || "").toLowerCase();

        let score = 0;

        for (const word of queryWords) {
            if (title.includes(word)) score += 50;
            if (author.includes(word)) score += 20;
        }

        return { book, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    if (best.score < 20) {
        throw new Error("No closely relevant book found.");
    }

    const book = best.book;

    const textUrl =
        book.formats["text/plain; charset=utf-8"] ||
        book.formats["text/plain"];

    if (!textUrl) {
        throw new Error("No readable text available.");
    }

    let text = await fetch(textUrl).then(r => r.text());

    text = cleanGutenberg(text);

    // English enforcement
    if (!isEnglishText(text)) {
        throw new Error("Non-English or corrupted text detected.");
    }

    currentText = text;

    aiBtn.disabled = currentText.length < 200;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(book.title)}</div>

            <div class="meta">
                Author: ${escapeHtml(book.authors?.[0]?.name || "Unknown")}
                <br>Source: Project Gutenberg
            </div>

            <div class="abstract">
                ${escapeHtml(text)}
            </div>
        </div>
    `;
}

//////////////////////////////////////////////////////
// TEXT CLEANERS
//////////////////////////////////////////////////////
function cleanGutenberg(text) {

    text = text.replace(/\r/g, "");

    const start = text.indexOf("*** START");
    if (start !== -1) text = text.substring(start);

    const end = text.indexOf("*** END");
    if (end !== -1) text = text.substring(0, end);

    return text.trim().slice(0, 12000);
}

//////////////////////////////////////////////////////
// ENGLISH DETECTION (IMPORTANT UPGRADE)
//////////////////////////////////////////////////////
function isEnglishText(text) {

    if (!text || text.length < 200) {
        return false;
    }

    const sample = text
        .slice(0, 2000)
        .toLowerCase();

    // Strong non-English indicators
    const nonEnglishPatterns = [
        /[\u0400-\u04FF]/, // Cyrillic
        /[\u4e00-\u9fff]/, // Chinese
        /[\u3040-\u30ff]/, // Japanese
        /[\u0600-\u06ff]/  // Arabic
    ];

    if (nonEnglishPatterns.some(p => p.test(sample))) {
        return false;
    }

    // Common English word set (better weighting)
    const words = sample.match(/[a-z]+/g) || [];

    if (words.length < 50) return false;

    const common = new Set([
        "the","be","to","of","and","a","in","that","have","i",
        "it","for","not","on","with","he","as","you","do","at",
        "this","but","his","by","from"
    ]);

    let score = 0;

    for (const w of words) {
        if (common.has(w)) score++;
    }

    const ratio = score / words.length;

    // English texts usually have MUCH higher ratio than foreign abstracts
    return ratio > 0.02;
}

//////////////////////////////////////////////////////
// AI QUESTIONS (UNCHANGED)
//////////////////////////////////////////////////////
async function generateAIQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Generating SAT questions...</div>`;

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

        const data = await res.json();

        renderQuestions(data);

    } catch (err) {
        questionsDiv.innerHTML = `
            <div class="card">
                <pre>${escapeHtml(err.message)}</pre>
            </div>
        `;
    }
}

//////////////////////////////////////////////////////
// QUESTIONS (UNCHANGED)
//////////////////////////////////////////////////////
function renderQuestions(data) {

    if (!data.questions) {
        questionsDiv.innerHTML =
            `<div class="card">Invalid AI response.</div>`;
        return;
    }

    questionsDiv.innerHTML = "";

    data.questions.forEach((q, i) => {

        const choicesWithIndex = q.choices.map((c, idx) => ({
            text: c,
            idx
        }));

        const shuffled = shuffle(choicesWithIndex);

        const correctIndex =
            shuffled.findIndex(c => c.idx === q.answer);

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
                    Answer: ${["A","B","C","D"][correctIndex]}
                </div>
            </div>
        `;
    });
}

//////////////////////////////////////////////////////
// UTILS
//////////////////////////////////////////////////////
function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
