(function () {
  const tokenKey = "nodewings_token";
  let panelSettingsCache = null;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readCookie(name) {
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (const part of parts) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) {
        return decodeURIComponent(rest.join("=") || "");
      }
    }
    return "";
  }

  function getToken() {
    return localStorage.getItem(tokenKey) || "";
  }

  function setToken(token) {
    localStorage.setItem(tokenKey, token);
    document.cookie = `${tokenKey}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24}`;
  }

  function clearToken() {
    localStorage.removeItem(tokenKey);
    document.cookie = `${tokenKey}=; Path=/; SameSite=Lax; Max-Age=0`;
  }

  async function api(path, options = {}) {
    const config = {
      method: options.method || "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    };

    if (options.body !== undefined) {
      config.body = JSON.stringify(options.body);
    }

    const token = getToken();
    if (options.auth !== false && token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, config);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(data.error || data.raw || response.statusText);
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function showError(target, message) {
    if (!target) return;
    target.textContent = message;
    target.style.color = "#bf2f2f";
  }

  function showInfo(target, message, ok = true) {
    if (!target) return;
    target.textContent = message;
    target.style.color = ok ? "#1d7f4e" : "#bf2f2f";
  }

  function shadeHex(color, amount) {
    const hex = String(color || "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return color;
    }

    const raw = hex.slice(1);
    const next = [0, 2, 4]
      .map((idx) => {
        const value = parseInt(raw.slice(idx, idx + 2), 16);
        const shaded = Math.max(0, Math.min(255, value + amount));
        return shaded.toString(16).padStart(2, "0");
      })
      .join("");

    return `#${next}`;
  }

  function defaultPalette(theme) {
    if (theme === "dark") {
      return {
        background: "#12151b",
        sidebar: "#191d25",
        card: "#1d222c",
        text: "#eceef1",
        muted: "#9ca4b0",
        line: "#30343b",
        input_bg: "#23272f",
        input_text: "#eceef1",
        table_head: "#242932",
        hover_bg: "rgba(255,255,255,0.05)",
        accent: "#4f8cff",
        button: "#2d3645",
      };
    }
    if (theme === "light") {
      return {
        background: "#edf0f5",
        sidebar: "#e3e7ee",
        card: "#ffffff",
        text: "#1f2328",
        muted: "#5a616d",
        line: "#d6dbe3",
        input_bg: "#ffffff",
        input_text: "#1f2328",
        table_head: "#e9edf3",
        hover_bg: "rgba(0,0,0,0.04)",
        accent: "#4f8cff",
        button: "#3b3f45",
      };
    }
    return {
      background: "#1a1f26",
      sidebar: "#151a21",
      card: "#1f252e",
      text: "#e6e9ef",
      muted: "#9aa3af",
      line: "#2a323d",
      input_bg: "#232a34",
      input_text: "#e6e9ef",
      table_head: "#222833",
      hover_bg: "rgba(255,255,255,0.04)",
      accent: "#4f8cff",
      button: "#2d3645",
    };
  }

  function applyTheme(settings, userTheme, themeData) {
    const root = document.documentElement;
    const theme = String(themeData?.id || userTheme || settings.default_theme || "gray").toLowerCase();
    const base = defaultPalette(theme);
    const palette = { ...base, ...(themeData?.palette || {}) };

    root.setAttribute("data-theme", theme);

    root.style.setProperty("--bg-color", palette.background || base.background);
    root.style.setProperty("--text-color", palette.text || base.text);
    root.style.setProperty("--muted-color", palette.muted || base.muted);
    root.style.setProperty("--line-color", palette.line || base.line);
    root.style.setProperty("--input-bg", palette.input_bg || base.input_bg);
    root.style.setProperty("--input-text", palette.input_text || base.input_text);
    root.style.setProperty("--table-head", palette.table_head || base.table_head);
    root.style.setProperty("--hover-bg", palette.hover_bg || base.hover_bg);
    root.style.setProperty("--accent-color", palette.accent || base.accent);

    root.style.setProperty("--sidebar-color", settings.sidebar_color || palette.sidebar || base.sidebar);
    root.style.setProperty("--card-color", settings.card_color || palette.card || base.card);
    const buttonColor = settings.button_color || palette.button || base.button;
    root.style.setProperty("--button-color", buttonColor);
    root.style.setProperty("--button-color-hover", shadeHex(buttonColor, -18));

    const bgImage = settings.background_image ? String(settings.background_image).trim() : "";
    root.style.setProperty("--bg-image", bgImage ? `url("${bgImage}")` : "none");
  }

  async function loadPanelSettings() {
    if (!panelSettingsCache) {
      panelSettingsCache = await api("/api/panel-settings", { auth: false });
    }
    return panelSettingsCache;
  }

  function injectPageBanner(title, user) {
    const main = document.querySelector("main");
    if (!main || main.querySelector(".page-banner")) {
      return;
    }

    const banner = document.createElement("section");
    banner.className = "page-banner";
    banner.innerHTML = `
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(user.name || user.email)} · ${escapeHtml(user.role || "user")}</p>
    `;
    main.prepend(banner);
  }

  function renderHeader(title, user) {
    const header = document.getElementById("header");
    if (!header) return;

    document.body.classList.remove("auth-page");
    document.body.classList.add("app-page");

    const path = location.pathname;
    const links = [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", active: path === "/dashboard" || path === "/" },
      { href: "/servers", label: "Servers", icon: "servers", active: path === "/servers" || /^\/servers\//.test(path) },
      { href: "/nodes", label: "Nodes", icon: "nodes", active: path === "/nodes" },
      { href: "/settings", label: "Settings", icon: "settings", active: path === "/settings" },
    ];

    const adminLinks = [
      { href: "/admin", label: "Admin Dashboard", icon: "admin", active: path === "/admin" },
      { href: "/admin/nodes", label: "Nodes", icon: "nodes", active: path === "/admin/nodes" },
      { href: "/admin/users", label: "Users", icon: "users", active: path === "/admin/users" },
      { href: "/admin/api-keys", label: "API Keys", icon: "keys", active: path === "/admin/api-keys" },
      { href: "/admin/audit-logs", label: "Audit Logs", icon: "audit", active: path === "/admin/audit-logs" },
      { href: "/admin/user-logs", label: "User Logs", icon: "logs", active: path === "/admin/user-logs" },
      { href: "/admin/themes", label: "Themes", icon: "theme", active: path === "/admin/themes" },
      { href: "/admin/update", label: "Updates", icon: "update", active: path === "/admin/update" },
      { href: "/admin/docker", label: "Docker Image", icon: "docker", active: path === "/admin/docker" },
    ];

    const renderLink = (item) =>
      `<a href="${item.href}" class="${item.active ? "active" : ""}">
        <span class="icon icon-${item.icon}" aria-hidden="true"></span>
        <span>${item.label}</span>
      </a>`;

    const linksHtml = `
      <div class="nav-section">Panel</div>
      ${links.map(renderLink).join("")}
      ${
        user && user.role === "admin"
          ? `<div class="nav-section">Admin</div>${adminLinks.map(renderLink).join("")}`
          : ""
      }
    `;

    header.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-badge">NW</div>
          <div>
            <div class="brand-title">NodeWings</div>
            <div class="brand-subtitle">Panel</div>
          </div>
        </div>
        <nav class="sidebar-nav">${linksHtml}</nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">${escapeHtml(user?.email || "Unknown")}</div>
          <button id="logoutBtn" class="secondary full">Logout</button>
        </div>
      </aside>
    `;

    const logoutBtn = header.querySelector("#logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await logout();
      });
    }

    injectPageBanner(title, user || {});
  }

  function renderLoginHeader() {
    const header = document.getElementById("header");
    if (!header) return;

    document.body.classList.remove("app-page");
    document.body.classList.add("auth-page");

    header.innerHTML = `
      <div class="auth-topbar">
        <div class="auth-brand">
          <div class="brand-badge">NW</div>
          <div>
            <div class="brand-title">NodeWings</div>
            <div class="brand-subtitle">Sign in</div>
          </div>
        </div>
      </div>
    `;
  }

  async function requireAuth() {
    try {
      const payload = await api("/api/auth/me");
      return payload.user;
    } catch {
      clearToken();
      location.href = "/login";
      return null;
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors and clear local state.
    }
    clearToken();
    location.href = "/login";
  }

  async function initPage(title, options = {}) {
    const user = await requireAuth();
    if (!user) {
      return null;
    }

    if (options.adminOnly && user.role !== "admin") {
      location.href = "/forbidden";
      return null;
    }

    try {
      const payload = await api("/api/settings");
      applyTheme(payload.settings, payload.user?.theme || user.theme, payload.theme);
      renderHeader(title, payload.user || user);
      return payload.user || user;
    } catch {
      try {
        const panel = await loadPanelSettings();
        applyTheme(panel.settings || panel, user.theme || panel.settings?.default_theme, panel.theme);
      } catch {
        // Keep CSS defaults if settings fetch fails.
      }
      renderHeader(title, user);
      return user;
    }
  }

  async function initLoginPage() {
    renderLoginHeader();
    try {
      const panel = await loadPanelSettings();
      applyTheme(panel.settings || panel, panel.settings?.default_theme || panel.default_theme, panel.theme);
    } catch {
      // Keep CSS defaults.
    }
  }

  function parseServerUuidFromPath() {
    const parts = location.pathname.split("/").filter(Boolean);
    const serversIndex = parts.indexOf("servers");
    if (serversIndex < 0 || parts.length <= serversIndex + 1) {
      return null;
    }
    return parts[serversIndex + 1];
  }

  function connectServerSocket(token, onEvent) {
    const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
    const authToken = token || getToken() || readCookie(tokenKey);
    const query = authToken ? `?token=${encodeURIComponent(authToken)}` : "";
    const ws = new WebSocket(`${wsProtocol}://${location.host}/ws${query}`);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onEvent(parsed);
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    return ws;
  }

  window.NodeWings = {
    api,
    escapeHtml,
    getToken,
    setToken,
    clearToken,
    showError,
    showInfo,
    loadPanelSettings,
    applyTheme,
    requireAuth,
    logout,
    renderHeader,
    renderLoginHeader,
    initPage,
    initLoginPage,
    parseServerUuidFromPath,
    connectServerSocket,
  };
})();
