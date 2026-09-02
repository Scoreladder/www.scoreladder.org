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

      document
        .getElementById("usernameSection")
        ?.style.setProperty("display", "none");

      return null;
    }

    const user = await res.json();

    console.log(
      "Scoreladder user:",
      user
    );

    // Make the complete user object available to the page.
    window.currentUser = user;

    // Only new Google users without a username
    // should see the username selection section.
    if (
      (window.location.pathname === "/login" ||
        window.location.pathname === "/login/") &&
      user.id?.startsWith("google_") &&
      !user.username &&
      !user.display_name
    ) {
      document
        .getElementById("loginSection")
        ?.classList.add("hidden");

      document
        .getElementById("userSection")
        ?.classList.add("hidden");

      document
        .getElementById("usernameSection")
        ?.style.setProperty("display", "block");

      return user;
    }

    // Show logged-in state.
    document
      .getElementById("loginSection")
      ?.classList.add("hidden");

    document
      .getElementById("userSection")
      ?.classList.remove("hidden");

    document
      .getElementById("usernameSection")
      ?.style.setProperty("display", "none");

    // Basic account information.
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

    // Profile avatar.
    const avatar =
      document.getElementById("avatar");

    if (avatar) {
      if (user.id?.startsWith("discord_")) {
        // Discord avatar.
        const discordId =
          user.id.replace("discord_", "");

        if (user.avatar) {
          avatar.src =
            `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`;
        } else {
          avatar.src =
            "https://cdn.discordapp.com/embed/avatars/0.png";
        }

      } else if (user.id?.startsWith("google_")) {
        // Google profile picture.
        if (user.avatar) {
          avatar.src = user.avatar;
        } else {
          avatar.src =
            "/assets/default-avatar.png";
        }

      } else {
        // Unknown provider / fallback.
        avatar.src =
          "/assets/default-avatar.png";
      }

      avatar.onerror = () => {
        avatar.src =
          "/assets/default-avatar.png";
      };
    }

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

    document
      .getElementById("usernameSection")
      ?.style.setProperty("display", "none");

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

async function setUsername() {
  const session =
    sessionStorage.getItem(
      LOCAL_SESSION_KEY
    );

  const input =
    document.getElementById("usernameInput");

  const error =
    document.getElementById("usernameError");

  const button =
    document.getElementById("usernameButton");

  const username =
    input?.value.trim();

  if (!username) {
    error.textContent =
      "Please enter a username.";
    return;
  }

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    error.textContent =
      "Username must be 3–20 characters and can only contain letters, numbers, and underscores.";
    return;
  }

  button.disabled = true;
  error.textContent = "";

  try {
    const res = await fetch(
      `${API}/onboarding/username?session=${encodeURIComponent(session)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          username
        })
      }
    );

    const data = await res.json();

    if (!res.ok) {
      error.textContent =
        data.error ||
        "Could not set username.";

      button.disabled = false;
      return;
    }

    const profileUrl =
      new URL(
        `${window.location.origin}/profile/`
      );

    if (session) {
      profileUrl.searchParams.set(
        "session",
        session
      );
    }

    window.location.href =
      profileUrl.toString();

  } catch (e) {
    console.error(
      "Failed to set username:",
      e
    );

    error.textContent =
      "Something went wrong. Please try again.";

    button.disabled = false;
  }
}

loadUser();