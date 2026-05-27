const topicInput = document.getElementById("topicInput");
const searchBtn = document.getElementById("searchBtn");
const aiBtn = document.getElementById("aiBtn");

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

        const res = await fetch(
            `https://doaj.org/api/search/articles/${encodeURIComponent(topic)}?pageSize=50`
        );

        const data = await res.json();

        if (!data.results?.length) {
            resultDiv.innerHTML = `<div class="card">No results found.</div>`;
            return;
        }

        const article =
            data.results[Math.floor(Math.random() * data.results.length)];

        renderArticle(article);

    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = `<div class="card">Failed to load articles.</div>`;
    }
}

function renderArticle(article) {

    const bib = article.bibjson || {};

    const title = bib.title || "No title";
    const abstract = bib.abstract || bib.title || "No abstract available";

    currentText = abstract;

    aiBtn.disabled = currentText.length < 50;

    const authors =
        (bib.author || []).map(a => a.name).join(", ") || "Unknown";

    const journal = bib.journal?.title || "Unknown journal";
    const year = bib.year || "Unknown year";

    const link = bib.link?.[0]?.url || "#";

    resultDiv.innerHTML = `
        <div class="card">

            <div class="title">${escapeHtml(title)}</div>

            <div class="meta">
                <b>Authors:</b> ${escapeHtml(authors)}<br>
                <b>Journal:</b> ${escapeHtml(journal)}<br>
                <b>Year:</b> ${escapeHtml(year)}
            </div>

            <div class="abstract">
                ${sanitizeHTML(abstract)}
            </div>

            <br>
            <a href="${link}" target="_blank">View Article</a>

        </div>
    `;
}

async function generateAIQuestions() {

    questionsDiv.innerHTML =
        `<div class="card">Generating AI questions...</div>`;

    try {

        const res = await fetch(
            "https://ai.scoreladder.org",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: currentText
                })
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
        }

        const data = await res.json();

        renderQuestions(data);

    } catch (err) {

        console.error(err);

        questionsDiv.innerHTML = `
            <div class="card">
                <h3>Error</h3>
                <pre style="white-space: pre-wrap; color: #ff6b6b;">
${escapeHtml(err.message)}
                </pre>
            </div>
        `;
    }
}

class ShuffleNoRepeat {
  constructor() {
    this.last = null;
  }

  shuffle(arr) {
    let result;

    do {
      result = this._fisherYates(arr.slice());
    } while (this.last && this._sameArray(result, this.last));

    this.last = result.slice();
    return result;
  }

  _fisherYates(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _sameArray(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
}

const shuffler = new ShuffleNoRepeat();


function shuffle(arr) {
    shuffler.shuffle(arr);
}


function renderQuestions(data) {

    if (!data.questions) {
        questionsDiv.innerHTML =
            `<div class="card">Invalid AI response.</div>`;
        return;
    }

    questionsDiv.innerHTML = "";

    data.questions.forEach((q, i) => {

        // 1. Attach original index to each choice
        const choicesWithIndex = q.choices.map((choice, idx) => ({
            text: choice,
            idx: idx
        }));

        // 2. Shuffle them
        const shuffled = shuffle(choicesWithIndex);

        // 3. Find where correct answer moved
        const correctIndex = shuffled.findIndex(
            c => c.idx === q.answer
        );

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

/* ---------------------------
   SAFE HTML HANDLING
---------------------------- */

function sanitizeHTML(html) {

    if (!html) return "";

    const doc = new DOMParser().parseFromString(html, "text/html");

    // remove dangerous tags
    doc.querySelectorAll("script, iframe, object, embed")
        .forEach(el => el.remove());

    return doc.body.innerHTML;
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
