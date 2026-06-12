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
// WIKIPEDIA (STRICT ENGLISH + REAL PASSAGE ONLY)
//////////////////////////////////////////////////////
async function searchWikipedia(topic) {

    const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=20`
    );

    const data = await res.json();

    if (!data.query?.search?.length) {
        throw new Error("No results.");
    }

    const words = topic.toLowerCase().split(/\s+/);

    const ranked = data.query.search
        .map(item => {
            let score = 0;

            const title = item.title.toLowerCase();
            const snippet = (item.snippet || "").toLowerCase();

            for (const w of words) {
                if (title.includes(w)) score += 100;
                if (snippet.includes(w)) score += 20;
            }

            return { item, score };
        })
        .sort((a, b) => b.score - a.score);

    const best = ranked[0];

    if (!best || best.score < 40) {
        throw new Error("No relevant Wikipedia article found.");
    }

    const title = best.item.title;

    const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );

    const pageData = await pageRes.json();
    const page = Object.values(pageData.query.pages)[0];

    let text = cleanText(page.extract || "");

    text = normalizeText(text);

    if (!isValidPassage(text)) {
        throw new Error("Invalid Wikipedia passage.");
    }

    if (!isEnglishText(text)) {
        throw new Error("Non-English Wikipedia content rejected.");
    }

    if (!isOnTopic(text, topic)) {
        throw new Error("Wikipedia article not relevant enough.");
    }

    currentText = text;
    aiBtn.disabled = false;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="meta">Source: Wikipedia</div>
            <div class="abstract">${escapeHtml(text)}</div>
        </div>
    `;
}

//////////////////////////////////////////////////////
// GUTENBERG (STRICT ENGLISH ONLY)
//////////////////////////////////////////////////////
async function searchGutenberg(topic) {

    const res = await fetch(
        `https://gutendex.com/books/?search=${encodeURIComponent(topic)}`
    );

    const data = await res.json();

    const books = (data.results || []).filter(b =>
        (b.languages || []).includes("en")
    );

    if (!books.length) {
        throw new Error("No English books found.");
    }

    const words = topic.toLowerCase().split(/\s+/);

    const ranked = books
        .map(book => {
            let score = 0;

            const title = (book.title || "").toLowerCase();

            for (const w of words) {
                if (title.includes(w)) score += 100;
            }

            return { book, score };
        })
        .sort((a, b) => b.score - a.score);

    const best = ranked[0];

    if (!best || best.score < 20) {
        throw new Error("No relevant book found.");
    }

    const url =
        best.book.formats["text/plain; charset=utf-8"] ||
        best.book.formats["text/plain"];

    if (!url) {
        throw new Error("No readable text.");
    }

    let text = await fetch(url).then(r => r.text());

    text = cleanGutenberg(text);
    text = normalizeText(text);

    if (!isValidPassage(text)) {
        throw new Error("Invalid Gutenberg text.");
    }

    if (!isEnglishText(text)) {
        throw new Error("Non-English book rejected.");
    }

    if (!isOnTopic(text, topic)) {
        throw new Error("Book not relevant enough.");
    }

    currentText = text;
    aiBtn.disabled = false;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(best.book.title)}</div>
            <div class="meta">Source: Project Gutenberg</div>
            <div class="abstract">${escapeHtml(text)}</div>
        </div>
    `;
}

//////////////////////////////////////////////////////
// CLEANERS
//////////////////////////////////////////////////////
function cleanText(text) {
    return text.replace(/\r/g, "").slice(0, 12000);
}

function normalizeText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

//////////////////////////////////////////////////////
// HARD PASSAGE VALIDATION (IMPORTANT FIX)
//////////////////////////////////////////////////////
function isValidPassage(text) {

    if (!text || text.length < 1500) return false;

    const metaSignals = [
        /authors?:/i,
        /journal:/i,
        /year:/i,
        /abstract:/i,
        /view article/i,
        /doi:/i
    ];

    let hits = 0;

    for (const r of metaSignals) {
        if (r.test(text)) hits++;
    }

    // if it looks like a metadata card → reject
    if (hits >= 2) return false;

    return true;
}

//////////////////////////////////////////////////////
// ENGLISH DETECTION (STRICT)
//////////////////////////////////////////////////////
function isEnglishText(text) {

    const sample = text.slice(0, 3000).toLowerCase();

    // reject accented Latin (Spanish/Italian/French leak fix)
    if (/[àáâäæèéêëìíîïòóôöùúûüçñ]/.test(sample)) {
        return false;
    }

    const words = sample.match(/[a-z]+/g) || [];

    if (words.length < 200) return false;

    const common = new Set([
        "the","be","to","of","and","a","in","that","have","i",
        "it","for","not","on","with","he","as","you","do","at",
        "this","but","his","by","from","they","we","say","her"
    ]);

    let score = 0;

    for (const w of words) {
        if (common.has(w)) score++;
    }

    return (score / words.length) > 0.05;
}

//////////////////////////////////////////////////////
// TOPIC CHECK
//////////////////////////////////////////////////////
function isOnTopic(text, topic) {

    const words = topic.toLowerCase().split(/\s+/);
    const sample = text.toLowerCase();

    let hits = 0;

    for (const w of words) {
        if (sample.includes(w)) hits++;
    }

    return hits >= Math.max(1, words.length - 1);
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
        questionsDiv.innerHTML =
            `<div class="card">${escapeHtml(err.message)}</div>`;
    }
}

//////////////////////////////////////////////////////
// QUESTIONS
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
// UTIL
//////////////////////////////////////////////////////
function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
