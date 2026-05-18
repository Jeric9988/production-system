/* ===== LOGIN PAGE SAFETY CLEANUP ===== */
/*
  Removes any stale dashboard modal/sidebar state when the browser returns to
  the login page from back/forward cache or after logout.
*/
function clearLoginPageStuckVisualState() {
  const classesToRemove = [
    "mobile-menu-open",
    "tablet-sidebar-expanded",
    "dashboard-logout-modal-open",
    "dashboard-session-ended-open",
    "overview-modal-open",
    "overview-order-details-open",
    "notice-order-details-open",
    "pr-modal-open"
  ];

  document.documentElement.classList.remove(...classesToRemove);
  document.body?.classList.remove(...classesToRemove);

  document.querySelectorAll(
    ".logout-confirm-backdrop, " +
    ".session-ended-backdrop, " +
    ".sidebar-backdrop, " +
    ".overview-modal-backdrop, " +
    ".overview-order-details-backdrop, " +
    ".notice-order-details-backdrop, " +
    ".pr-modal-backdrop"
  ).forEach((element) => {
    element.classList.remove("show", "open", "active");
    element.setAttribute("aria-hidden", "true");
    element.style.removeProperty("opacity");
    element.style.removeProperty("pointer-events");
    element.style.removeProperty("visibility");

    if (element.classList.contains("session-ended-backdrop")) {
      element.remove();
    }
  });
}

clearLoginPageStuckVisualState();
window.addEventListener("pageshow", clearLoginPageStuckVisualState);
window.addEventListener("load", clearLoginPageStuckVisualState);

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const rememberMeInput = document.getElementById("rememberMe");
const passwordToggle = document.getElementById("passwordToggle");
const loginAlert = document.getElementById("loginAlert");

const AUTH_API_BASE = "/api/auth";

function showLoginAlert(message) {
  loginAlert.textContent = message;
  loginAlert.hidden = false;
}

function hideLoginAlert() {
  loginAlert.textContent = "";
  loginAlert.hidden = true;
}

function saveLoggedInUser(user, rememberMe, sessionToken = "") {
  const safeUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    loggedInAt: new Date().toISOString()
  };

  localStorage.setItem("currentUser", JSON.stringify(safeUser));
  localStorage.setItem("loggedInUser", JSON.stringify(safeUser));
  localStorage.setItem("activeUser", JSON.stringify(safeUser));
  localStorage.setItem("username", safeUser.username);

  if (sessionToken) {
    localStorage.setItem("dashboardAuthToken", sessionToken);
  }

  if (rememberMe) {
    localStorage.setItem("rememberedUsername", safeUser.username);
  } else {
    localStorage.removeItem("rememberedUsername");
  }
}

function setLoading(isLoading) {
  const submitButton = loginForm.querySelector(".login-button");

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Signing in..." : "Log In";
}

async function requestLogin(username, password) {
  const response = await fetch(`${AUTH_API_BASE}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || "Invalid username or password.");
  }

  return data;
}

passwordToggle?.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  passwordToggle.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideLoginAlert();

  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    showLoginAlert("Please enter your username and password.");
    return;
  }

  setLoading(true);

  try {
    const data = await requestLogin(username, password);

    if (!data?.user) {
      throw new Error("Login failed. Please try again.");
    }

    saveLoggedInUser(data.user, rememberMeInput.checked, data.sessionToken || "");
    window.location.href = "/dashboard";
  } catch (error) {
    showLoginAlert(error.message || "Invalid username or password.");
    passwordInput.focus();
    passwordInput.select();
  } finally {
    setLoading(false);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const rememberedUsername = localStorage.getItem("rememberedUsername");

  if (rememberedUsername) {
    usernameInput.value = rememberedUsername;
    rememberMeInput.checked = true;
    passwordInput.focus();
  } else {
    usernameInput.focus();
  }
});
