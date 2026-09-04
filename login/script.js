console.log("Scoreladder login.js loaded");

const API = "https://auth.scoreladder.org";
const LOCAL_SESSION_KEY = "scoreladder_session";


function showSection(sectionId) {
  const sections = [
    "loginSection",
    "usernameSection",
    "scoreSection",
    "userSection"
  ];

  for (const id of sections) {
    const element =
      document.getElementById(id);

    if (!element) continue;

    if (id === sectionId) {
      element.classList.remove("hidden");
      element.style.display = "block";
    } else {
      element.classList.add("hidden");
      element.style.display = "none";
    }
  }
}

function populateScoreDropdown(id) {
  const select =
    document.getElementById(id);

  if (!select) return;

  select.innerHTML = `
    <option value="" disabled selected>
      Select your score
    </option>
  `;

  for (let score = 200; score <= 800; score += 10) {
    const option =
      document.createElement("option");

    option.value = score;
    option.textContent = score;

    select.appendChild(option);
  }
}


function initializeScoreInputs() {
  populateScoreDropdown(
    "rwScoreInput"
  );

  populateScoreDropdown(
    "mathScoreInput"
  );
}


function showScoreSetup() {
  initializeScoreInputs();
  showSection("scoreSection");
}


async function loadUser() {
  try {
    // Get session from the URL first,
    // then fall back to stored session.
    const urlSession =
      new URLSearchParams(
        window.location.search
      ).get("session");

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

    // Build /me URL without logging
    // the session token.
    const meUrl =
      new URL(`${API}/me`);

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

    const res =
      await fetch(meUrl, {
        credentials: "include"
      });

    if (!res.ok) {
      showSection("loginSection");
      return null;
    }

    const user =
      await res.json();

    console.log(
      "Scoreladder user:",
      user
    );

    // Make the complete user object
    // available to the page.
    window.currentUser = user;

    const isLoginPage =
      window.location.pathname === "/login" ||
      window.location.pathname === "/login/";

    /*
      NEW GOOGLE USER

      Only Google accounts that still have
      no username/display name go through
      username selection.

      Discord users never go through this.
    */
    if (
      isLoginPage &&
      user.id?.startsWith("google_") &&
      !user.username &&
      !user.display_name
    ) {
      showSection(
        "usernameSection"
      );

      return user;
    }

    /*
      INITIAL SCORE SETUP

      A null Elo means the user has not
      completed initial score setup yet.

      The actual test scores are never
      retrieved from /me after submission.
    */
    const rwElo =
      user.stats?.rw_elo;

    const mathElo =
      user.stats?.math_elo;

    if (
      isLoginPage &&
      (rwElo == null ||
        mathElo == null)
    ) {
      showScoreSetup();

      return user;
    }

    // Show logged-in state.
    showSection("userSection");

    // Basic account information.
    const username =
      document.getElementById(
        "username"
      );

    if (username) {
      username.innerText =
        user.display_name ||
        user.username ||
        "";
    }

    const email =
      document.getElementById(
        "email"
      );

    if (email) {
      email.innerText =
        user.email || "";
    }

    // Profile avatar.
    const avatar =
      document.getElementById(
        "avatar"
      );

    if (avatar) {
      if (
        user.id?.startsWith(
          "discord_"
        )
      ) {
        const discordId =
          user.id.replace(
            "discord_",
            ""
          );

if (user.avatar) {
  avatar.src =
    /^https?:\/\//i.test(user.avatar)
      ? user.avatar
      : `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`;
} else {
  avatar.src =
    "https://cdn.discordapp.com/embed/avatars/0.png";
}

      } else if (
        user.id?.startsWith(
          "google_"
        )
      ) {
        if (user.avatar) {
          avatar.src =
            user.avatar;
        } else {
          avatar.src =
            "/assets/default-avatar.png";
        }

      } else {
        avatar.src =
          "/assets/default-avatar.png";
      }

      avatar.onerror = () => {
        avatar.src =
          "/assets/default-avatar.png";
      };
    }

    // If already logged in and on the
    // login page, send the user to profile.
    if (isLoginPage) {
      const profileUrl =
        new URL(
          `${window.location.origin}/profile/`
        );

      // Preserve the session for local development.
const hostname = window.location.hostname;

const isLocalDevelopment =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname.endsWith(".localhost");

if (session && isLocalDevelopment) {
  profileUrl.searchParams.set("session", session);
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

    showSection("loginSection");

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
  let session = null;

  try {
    session =
      sessionStorage.getItem(
        LOCAL_SESSION_KEY
      );
  } catch (error) {
    console.error(
      "Could not read local session:",
      error
    );
  }

  const input =
    document.getElementById(
      "usernameInput"
    );

  const error =
    document.getElementById(
      "usernameError"
    );

  const button =
    document.getElementById(
      "usernameButton"
    );

  const username =
    input?.value.trim();

  if (!username) {
    error.textContent =
      "Please enter a username.";
    return;
  }

  if (
    !/^[A-Za-z0-9_]{3,20}$/.test(
      username
    )
  ) {
    error.textContent =
      "Username must be 3–20 characters and can only contain letters, numbers, and underscores.";

    return;
  }

  button.disabled = true;
  error.textContent = "";

  try {
    const res =
      await fetch(
        `${API}/onboarding/username?session=${encodeURIComponent(session)}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          credentials: "include",
          body: JSON.stringify({
            username
          })
        }
      );

    const data =
      await res.json();

    if (!res.ok) {
      error.textContent =
        data.error ||
        "Could not set username.";

      button.disabled = false;
      return;
    }

    /*
      Do NOT redirect to profile yet.

      The Google user still needs to complete
      initial score setup.
    */

      initializeScoreInputs();
      showSection("scoreSection");

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


async function submitInitialScores() {
  let session = null;

  try {
    session =
      sessionStorage.getItem(
        LOCAL_SESSION_KEY
      );
  } catch (error) {
    console.error(
      "Could not read local session:",
      error
    );
  }

  const rwInput =
    document.getElementById(
      "rwScoreInput"
    );

  const mathInput =
    document.getElementById(
      "mathScoreInput"
    );

  const error =
    document.getElementById(
      "scoreError"
    );

  const button =
    document.getElementById(
      "scoreButton"
    );

  const rwScore =
    Number(rwInput?.value);

  const mathScore =
    Number(mathInput?.value);

  if (
    !Number.isInteger(rwScore) ||
    rwScore < 200 ||
    rwScore > 800
  ) {
    error.textContent =
      "Please select your Reading & Writing score.";

    return;
  }

  if (
    !Number.isInteger(mathScore) ||
    mathScore < 200 ||
    mathScore > 800
  ) {
    error.textContent =
      "Please select your Math score.";

    return;
  }

  button.disabled = true;
  error.textContent = "";

  try {
    const res =
      await fetch(
        `${API}/onboarding/initial-score?session=${encodeURIComponent(session)}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          credentials: "include",
          body: JSON.stringify({
            rw_score: rwScore,
            math_score: mathScore
          })
        }
      );

    const data =
      await res.json();

    if (!res.ok) {
      error.textContent =
        data.error ||
        "Could not save your starting rating.";

      button.disabled = false;
      return;
    }

    /*
      Initial score setup is complete.
      The backend has converted the scores
      to Elo and does not need to store the
      original scores.
    */
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
      "Failed to submit initial scores:",
      e
    );

    error.textContent =
      "Something went wrong. Please try again.";

    button.disabled = false;
  }
}


loadUser();