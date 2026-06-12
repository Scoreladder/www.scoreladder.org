const topicInput = document.getElementById("topicInput");
const searchBtn = document.getElementById("searchBtn");

const resultDiv = document.getElementById("result");

searchBtn.addEventListener("click", searchArticle);

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////
async function searchArticle() {

    const topic = topicInput.value.trim();

    if (!topic) {
        resultDiv.innerHTML = `<div class="card">Enter a topic.</div>`;
        return;
    }

    resultDiv.innerHTML = `<div class="card">Loading Wikipedia...</div>`;

    try {

        // 1. SEARCH WIKIPEDIA TITLE
        const searchRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&origin=*&srlimit=1`
        );

        const searchData = await searchRes.json();

        if (!searchData.query?.search?.length) {
            throw new Error("No Wikipedia page found.");
        }

        const title = searchData.query.search[0].title;

        // 2. GET FULL PAGE TEXT
        const pageRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
        );

        const pageData = await pageRes.json();
        const page = Object.values(pageData.query.pages)[0];

        if (!page?.extract) {
            throw new Error("No content found.");
        }

        // 3. CLEAN + SPLIT INTO PARAGRAPHS
        const paragraphs = page.extract
            .replace(/\r/g, "")
            .split("\n\n")
            .map(p => p.trim())
            .filter(p => p.length > 50);

        if (paragraphs.length < 2) {
            throw new Error("Not enough paragraphs found.");
        }

        // 4. PICK 2 RANDOM PARAGRAPHS
        const shuffled = paragraphs.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 2).join("\n\n");

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
        resultDiv.innerHTML = `
            <div class="card">
                Error: ${escapeHtml(err.message)}
            </div>
        `;
    }
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
