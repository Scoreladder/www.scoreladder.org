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
// ROUTER
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
// WIKIPEDIA (ENGLISH ONLY + RELEVANCE FILTER)
//////////////////////////////////////////////////////
async function searchWikipedia(topic) {

    const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=20`
    );

    const searchData = await searchRes.json();

    if (!searchData.query?.search?.length) {
        throw new Error("No Wikipedia results.");
    }

    const words = topic.toLowerCase().split(/\s+/);

    const scored = searchData.query.search.map(item => {

        const title = item.title.toLowerCase();
        const snippet = item.snippet.toLowerCase();

        let score = 0;

        for (const w of words) {
            if (title.includes(w)) score += 80;
            if (snippet.includes(w)) score += 20;
        }

        return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    if (best.score < 40) {
        throw new Error("No closely related Wikipedia article found.");
    }

    const title = best.item.title;

    const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );

    const pageData = await pageRes.json();
    const page = Object.values(pageData.query.pages)[0];

    let text = page.extract || "";

    if (!text || text.length < 800) {
        throw new Error("Article too short or invalid.");
    }

    if (!isEnglishText(text)) {
        throw new Error("Non-English article rejected.");
    }

    if (!isOnTopic(text, topic)) {
        throw new Error("Article not relevant enough.");
    }

    currentText = text;
    aiBtn.disabled = false;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="meta">Source: Wikipedia (English)</div>
            <div class="abstract">${escapeHtml(text)}</div>
        </div>
    `;
}

//////////////////////////////////////////////////////
// GUTENBERG (STRICT ENGLISH FILTER)
//////////////////////////////////////////////////////
async function searchGutenberg(topic) {

    const res = await fetch(
        `https://gutendex.com/books/?search=${encodeURIComponent(topic)}`
    );

    const data = await res.json();

    if (!data.results?.length) {
        throw new Error("No books found.");
    }

    // ONLY ENGLISH BOOKS
    const englishBooks = data.results.filter(b =>
        (b.languages || []).includes("en")
    );

    if (!englishBooks.length) {
        throw new Error("No English books found.");
    }

    const words = topic.toLowerCase().split(/\s+/);

    const scored = englishBooks.map(book => {

        const title = (book.title || "").toLowerCase();

        let score = 0;

        for (const w of words) {
            if (title.includes(w)) score += 80;
        }

        return { book, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    if (!best || best.score < 20) {
        throw new Error("No relevant English book found.");
    }

    const book = best.book;

    const url =
        book.formats["text/plain; charset=utf-8"] ||
        book.formats["text/plain"];

    if (!url) {
        throw new Error("No readable text available.");
    }

    let text = await fetch(url).then(r => r.text());

    text = cleanGutenberg(text);

    if (!isEnglishText(text)) {
        throw new Error("Non-English text rejected.");
    }

    if (!isOnTopic(text, topic)) {
        throw new Error("Book not relevant enough.");
    }

    currentText = text;
    aiBtn.disabled = false;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(book.title)}</div>
            <div class="meta">
                Author: ${escapeHtml(book.authors?.[0]?.name || "Unknown")}
                <br>Source: Project Gutenberg
            </div>
            <div class="abstract">${escapeHtml(text)}</div>
        </div>
    `;
}

//////////////////////////////////////////////////////
// CLEAN GUTENBERG
//////////////////////////////////////////////////////
function cleanGutenberg(text) {

    const start = text.indexOf("*** START");
    if (start !== -1) text = text.slice(start);

    const end = text.indexOf("*** END");
    if (end !== -1) text = text.slice(0, end);

    return text.trim().slice(0, 12000);
}

//////////////////////////////////////////////////////
// ENGLISH DETECTION (STRICT)
//////////////////////////////////////////////////////
function isEnglishText(text) {

    const sample = text.slice(0, 2000).toLowerCase();

    if (/[àáâäæèéêëìíîïòóôöùúûüçñ]/.test(sample)) {
        return false;
    }

    const words = sample.match(/[a-z]+/g) || [];

    if (words.length < 120) return false;

    const common = new Set([
        "the","be","to","of","and","a","in","that","have","i",
        "it","for","not","on","with","he","as","you","do","at",
        "this","but","his","by","from","they","we","say"
    ]);

    let score = 0;

    for (const w of words) {
        if (common.has(w)) score++;
    }

    return (score / words.length) > 0.04;
}

//////////////////////////////////////////////////////
// TOPIC RELEVANCE FILTER
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
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text: currentText })
        });

        const data = await res.json();

        renderQuestions(data);

    } catch (err) {
        questionsDiv.innerHTML = `
            <div class="card">${escapeHtml(err.message)}</div>
        `;
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
