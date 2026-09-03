
async function load() {
  const sessionId =
    sessionStorage.getItem("scoreladder_session");

  let meUrl =
    "https://auth.scoreladder.org/me";

  if (sessionId) {
    meUrl =
      `https://auth.scoreladder.org/me?session=${encodeURIComponent(sessionId)}`;
  }

  const res = await fetch(meUrl, {
    credentials: "include",
    cache: "no-store"
  });

  if (!res.ok) {
    location.href = "/";
    return;
  }

  const user = await res.json();

  document.getElementById("displayName").value =
    user.display_name || "";
}

async function save() {
  await fetch("https://auth.scoreladder.org/settings", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bio: bio.value,
      banner: banner.value,
      twitter: twitter.value,
      instagram: instagram.value,
      youtube: youtube.value,
      website: website.value
    })
  });
}

function back() {
  location.href = "/profile/";
}

load();