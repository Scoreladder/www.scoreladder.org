console.log("Scoreladder login.js loaded");

const API = "https://auth.scoreladder.org";

async function loadUser() {
  try {
    const res = await fetch(`${API}/me`, {
      credentials: "include"
    });

    if (!res.ok) {
      document.getElementById("loginSection")?.classList.remove("hidden");
      document.getElementById("userSection")?.classList.add("hidden");
      return null;
    }

    const user = await res.json();

    console.log("Scoreladder user:", user);

    // Show logged-in state
    document.getElementById("loginSection")?.classList.add("hidden");
    document.getElementById("userSection")?.classList.remove("hidden");

    // Basic account information
    const username = document.getElementById("username");

    if (username) {
      username.innerText =
        user.display_name || user.username || "";
    }

    const email = document.getElementById("email");

    if (email) {
      email.innerText = user.email || "";
    }

    // Discord avatar
    const avatar = document.getElementById("avatar");

    if (avatar) {
      if (user.avatar) {
        const discordId = user.id.replace("discord_", "");

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
      const profileUrl = `${window.location.origin}/profile/`;

      console.log("Current URL:", window.location.href);
      console.log("Redirecting to:", profileUrl);

      window.location.href = profileUrl;
      return user;
    }

    return user;

  } catch (e) {
    console.error("Failed to load user:", e);

    document.getElementById("loginSection")?.classList.remove("hidden");
    document.getElementById("userSection")?.classList.add("hidden");

    return null;
  }
}

async function logout() {
  try {
    await fetch(`${API}/logout`, {
      credentials: "include"
    });
  } finally {
    window.location.reload();
  }
}

loadUser();