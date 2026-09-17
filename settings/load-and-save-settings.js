async function load() {
  const sessionId = sessionStorage.getItem("scoreladder_session");

  let meUrl = "https://auth.scoreladder.org/me";

  if (sessionId) {
    meUrl = `https://auth.scoreladder.org/me?session=${encodeURIComponent(sessionId)}`;
  }

  const res = await fetch(meUrl, {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    location.href = "/";
    return;
  }

  const user = await res.json();

  document.getElementById("displayName").value = user.display_name || "";
}

async function save() {
  const bio = document.getElementById("bio");
  const banner = document.getElementById("banner");
  const twitter = document.getElementById("twitter");
  const instagram = document.getElementById("instagram");
  const youtube = document.getElementById("youtube");
  const website = document.getElementById("website");

  await fetch("https://auth.scoreladder.org/settings", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bio: bio?.value ?? "",
      banner: banner?.value ?? "",
      twitter: twitter?.value ?? "",
      instagram: instagram?.value ?? "",
      youtube: youtube?.value ?? "",
      website: website?.value ?? "",
    }),
  });
}

function back() {
  location.href = "/profile/";
}

load();

// These handlers are referenced by the page's inline button handlers.
window.save = save;
window.back = back;
