console.log("Scoreladder login.js loaded");

const API = "https://auth.scoreladder.org";
const LOCAL_SESSION_KEY = "scoreladder_session";

async function loadUser() {
  try {
    // Get session from the URL first, then fall back to stored session.
    const urlSession =
      new URLSearchParams(window.location.search).get("session");

    let session = urlSession;

    if (urlSession) {
      try {
        sessionStorage.setItem(
          LOCAL_SESSION_KEY,
          urlSession
        );
      } catch (error) {
        console.error(
          "Could not save local session:",
          error
        );
      }
    } else {
      try {
        session =
          sessionStorage.getItem(
            LOCAL_SESSION_KEY
          );
      } catch (error) {
        session = null;
      }
    }

    // Build /me URL without logging the session token.
    const meUrl = new URL(`${API}/me`);

    if (session) {
      meUrl.searchParams.set(
        "session",
        session
      );
    }

    console.log(
      "Checking authentication:",
      session
        ? "session found"
        : "no session"
    );

    const res = await fetch(meUrl, {
      credentials: "include"
    });

    if (!res.ok) {
      document
        .getElementById("loginSection")
        ?.classList.remove("hidden");

      document
        .getElementById("userSection")
        ?.classList.add("hidden");

      return null;
    }

    const user = await res.json();

    console.log(
      "Scoreladder user:",
      user
    );

    // Show logged-in state
    document
      .getElementById("loginSection")
      ?.classList.add("hidden");

    document
      .getElementById("userSection")
      ?.classList.remove("hidden");

    // Basic account information
    const username =
      document.getElementById("username");

    if (username) {
      username.innerText =
        user.display_name ||
        user.username ||
        "";
    }

    const email =
      document.getElementById("email");

    if (email) {
      email.innerText =
        user.email || "";
    }

    // Discord avatar
    const avatar =
      document.getElementById("avatar");

    if (avatar) {
      if (user.avatar) {
        const discordId =
          user.id.replace(
            "discord_",
            ""
          );

        avatar.src =
          `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`;
      } else {
        avatar.src =
          "https://cdn.discordapp.com/embed/avatars/0.png";
      }
    }

    // Make the complete user object available to the page
    window.currentUser = user;

    // If already logged in and on the login page,
    // send the user to their profile.
    if (
      window.location.pathname === "/login" ||
      window.location.pathname === "/login/"
    ) {
      const profileUrl =
        new URL(
          `${window.location.origin}/profile/`
        );

      // Preserve the session for local development.
      if (session) {
        profileUrl.searchParams.set(
          "session",
          session
        );
      }

      console.log(
        "Current URL:",
        window.location.href
      );

      console.log(
        "Redirecting to:",
        profileUrl.toString()
      );

      window.location.href =
        profileUrl.toString();

      return user;
    }

    return user;

  } catch (e) {
    console.error(
      "Failed to load user:",
      e
    );

    document
      .getElementById("loginSection")
      ?.classList.remove("hidden");

    document
      .getElementById("userSection")
      ?.classList.add("hidden");

    return null;
  }
}

async function logout() {
  try {
    await fetch(
      `${API}/logout`,
      {
        credentials: "include"
      }
    );
  } finally {
    try {
      sessionStorage.removeItem(
        LOCAL_SESSION_KEY
      );
    } catch (error) {
      console.error(
        "Could not clear local session:",
        error
      );
    }

    window.location.reload();
  }
}

loadUser();