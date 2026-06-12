const topicInput = document.getElementById("topicInput");
const searchBtn = document.getElementById("searchBtn");
const aiBtn = document.getElementById("aiBtn");
const sourceSwitch = document.getElementById("sourceSwitch");

const resultDiv = document.getElementById("result");
const questionsDiv = document.getElementById("questions");

let currentText = "";

searchBtn.addEventListener("click", searchArticle);
aiBtn.addEventListener("click", generateAIQuestions);

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

//////////////////////////////
// WIKIPEDIA
//////////////////////////////
async function searchWikipedia(topic) {

    const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*`
    );

    const searchData = await searchRes.json();

    if (!searchData.query.search.length) {
        throw new Error("No Wikipedia article found.");
    }

    const title = searchData.query.search[0].title;

    const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );

    const pageData = await pageRes.json();
    const page = Object.values(pageData.query.pages)[0];

    const text = page.extract || "";

    currentText = text;

    aiBtn.disabled = currentText.length < 200;

    resultDiv.innerHTML = `
        <div class="card">
            <div class="title">${escapeHtml(title)}</div>

            <div class="meta">
                Source: Wikipedia
            </div>

            <div class="abstract">
                ${escapeHtml(text)}
            </div>
        </div>
    `;
}

//////////////////////////////
// GUTENBERG (LITERATURE)
//////////////////////////////
async function searchGutenberg(topic) {

    const res = await fetch(
        `https://gutendex.com/books/?search=${encodeURIComponent(topic)}`
    );

    const data = await res.json();

    if (!data.results.length) {
        throw new Error("No books found.");
    }

    const book = data.results[Math.floor(Math.random() * data.results.length)];

    const textUrl =
        book.formats["text/plain; charset=utf-8"] ||
        book.formats["text/plain"];

    if (!textUrl) {
        throw new Error("No readable text found.");
    }

    let text = await fetch(textUrl).then(r => r.text());

    text = cleanGutenberg(text);

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

function cleanGutenberg(text) {

    text = text.replace(/\r/g, "");

    const start = text.indexOf("*** START");
    if (start !== -1) text = text.substring(start);

    const end = text.indexOf("*** END");
    if (end !== -1) text = text.substring(0, end);

    return text.trim().slice(0, 12000);
}

//////////////////////////////
// AI QUESTIONS (UNCHANGED)
//////////////////////////////
async function generateAIQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Generating AI questions...</div>`;

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

//////////////////////////////
// QUESTIONS (UNCHANGED)
//////////////////////////////
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

//////////////////////////////
// UTIL
//////////////////////////////
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
