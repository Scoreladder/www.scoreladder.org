(() => {
  const API = "https://auth.scoreladder.org";
  const BASE_URL = window.location.origin;
  const LOCAL_SESSION_KEY = "scoreladder_session";

  // ============================================================
  // INITIALIZATION
  // ============================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLayout);
  } else {
    initLayout();
  }

  async function initLayout() {
    try {
      await loadComponent(
        "header",
        `${BASE_URL}/components/header.html`
      );

      await loadComponent(
        "footer",
        `${BASE_URL}/components/footer.html`
      );

      initTopbar();
      syncTopbarHeight();

      console.log("layout.js loaded");
    } catch (error) {
      console.error(
        "Layout initialization failed:",
        error
      );
    }
  }

  // ============================================================
  // LOAD HTML COMPONENT
  // ============================================================

  async function loadComponent(id, file) {
    const element = document.getElementById(id);

    if (!element) {
      throw new Error(
        `Element #${id} was not found`
      );
    }

    const res = await fetch(file, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(
        `Failed to load ${file}: ${res.status}`
      );
    }

    element.innerHTML = await res.text();
  }

  // ============================================================
  // TOPBAR
  // ============================================================

  function initTopbar() {
    initDarkMode();
    setupAuth();
  }

  // ============================================================
  // GET LOCAL SESSION
  // ============================================================

  function getLocalSession() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const urlSession =
      params.get("session");

    if (urlSession) {
      try {
        sessionStorage.setItem(
          LOCAL_SESSION_KEY,
          urlSession
        );

        // Remove the session credential from the URL
        // after successfully storing it.
        const cleanUrl =
          new URL(window.location.href);

        cleanUrl.searchParams.delete(
          "session"
        );

        window.history.replaceState(
          {},
          document.title,
          cleanUrl.pathname +
            cleanUrl.search +
            cleanUrl.hash
        );
      } catch (error) {
        console.error(
          "Could not save local session:",
          error
        );
      }

      return urlSession;
    }

    try {
      return sessionStorage.getItem(
        LOCAL_SESSION_KEY
      );
    } catch (error) {
      return null;
    }
  }

  // ============================================================
  // DARK MODE
  // ============================================================

  function initDarkMode() {
    const btn =
      document.getElementById(
        "darkmode-toggle"
      );

    if (!btn) {
      console.error(
        "Dark mode button was not found"
      );
      return;
    }

    let saved = null;

    try {
      saved =
        localStorage.getItem(
          "darkmode"
        );
    } catch (error) {
      saved = null;
    }

    if (saved === "true") {
      setDarkMode(true);
    } else if (saved === "false") {
      setDarkMode(false);
    } else {
      setDarkMode(
        window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches,
        false
      );
    }

    btn.addEventListener(
      "click",
      () => {
        const enabled =
          !document.documentElement.classList.contains(
            "darkmode"
          );

        setDarkMode(
          enabled,
          true
        );
      }
    );
  }

  function setDarkMode(
    enabled,
    save = true
  ) {
    const root =
      document.documentElement;

    root.classList.remove(
      "darkmode",
      "lightmode"
    );

    root.classList.add(
      enabled
        ? "darkmode"
        : "lightmode"
    );

    if (save) {
      try {
        localStorage.setItem(
          "darkmode",
          enabled
            ? "true"
            : "false"
        );
      } catch (error) {}
    }

    const btn =
      document.getElementById(
        "darkmode-toggle"
      );

    if (!btn) {
      return;
    }

    btn.setAttribute(
      "aria-pressed",
      enabled
        ? "true"
        : "false"
    );

    btn.setAttribute(
      "aria-label",
      enabled
        ? "Switch to light mode"
        : "Switch to dark mode"
    );

    const icon =
      btn.querySelector("span");

    if (icon) {
      icon.textContent =
        enabled
          ? "☀️"
          : "🌙";
    }
  }

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  async function setupAuth() {
    const profileBtn =
      document.getElementById(
        "profileBtn"
      );

    if (!profileBtn) {
      console.error(
        "profileBtn was not found in header"
      );
      return;
    }

    try {
      const session =
        getLocalSession();

      let meUrl =
        `${API}/me`;

      if (session) {
        meUrl =
          `${API}/me?session=${encodeURIComponent(
            session
          )}`;
      }

      console.log(
        "Checking authentication:",
        session
          ? "local session found"
          : "no local session"
      );

      const res =
        await fetch(meUrl, {
          credentials: "include"
        });

      if (!res.ok) {
        console.log(
          "User is not authenticated:",
          res.status
        );

        profileBtn.classList.add(
          "hidden"
        );

        showLoginButton();
        return;
      }

      const user =
        await res.json();

      console.log(
        "Authenticated user:",
        user
      );

      // --------------------------------------------------------
      // SHOW PROFILE BUTTON
      // --------------------------------------------------------

      profileBtn.classList.remove(
        "hidden"
      );

      // --------------------------------------------------------
      // AVATAR
      // --------------------------------------------------------

      const discordId =
        user.id.replace(
          "discord_",
          ""
        );

      if (user.avatar) {
        profileBtn.src =
          `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png?size=128`;
      } else {
        profileBtn.src =
          "https://cdn.discordapp.com/embed/avatars/0.png";
      }

      profileBtn.alt =
        `${
          user.display_name ||
          user.username ||
          "User"
        } profile picture`;

      // --------------------------------------------------------
      // PROFILE LINK
      // --------------------------------------------------------

      const profileLink =
        profileBtn.closest("a");

      if (profileLink) {
        const profileUrl =
          new URL(
            `${BASE_URL}/profile/`
          );

        profileLink.href =
          profileUrl.toString();
      }

      // Remove login button if present.
      const loginBtn =
        document.getElementById(
          "loginBtn"
        );

      if (loginBtn) {
        loginBtn.remove();
      }
    } catch (error) {
      console.error(
        "Auth check failed:",
        error
      );

      profileBtn.classList.add(
        "hidden"
      );

      showLoginButton();
    }
  }

  // ============================================================
  // LOGIN BUTTON
  // ============================================================

  function showLoginButton() {
    const right =
      document.querySelector(
        "#topbar .right"
      );

    if (!right) {
      console.error(
        "#topbar .right was not found"
      );
      return;
    }

    if (
      document.getElementById(
        "loginBtn"
      )
    ) {
      return;
    }

    const loginBtn =
      document.createElement(
        "button"
      );

    loginBtn.id =
      "loginBtn";

    loginBtn.type =
      "button";

    loginBtn.textContent =
      "Log in";

    loginBtn.addEventListener(
      "click",
      () => {
        window.location.href =
          "/login/";
      }
    );

    right.appendChild(
      loginBtn
    );
  }

  // ============================================================
  // TOPBAR HEIGHT
  // ============================================================

  function syncTopbarHeight() {
    const topbar =
      document.getElementById(
        "topbar"
      );

    if (!topbar) {
      return;
    }

    const height =
      topbar.offsetHeight;

    document.documentElement.style.setProperty(
      "--topbar-height",
      `${height}px`
    );
  }
})();