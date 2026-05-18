/* ===== SETTINGS PAGE ONLY ===== */

(function initSettingsPage() {
  const settingsView = document.querySelector('[data-view="settings"]');
  if (!settingsView) return;

  const USERS_API_BASE = "/api/users";
  const BACKUP_API_URL = "/api/database/backup";

  const userList = document.getElementById("settingsUserList");
  const userForm = document.getElementById("settingsUserForm");
  const newUserButton = document.getElementById("settingsNewUserBtn");
  const cancelUserButton = document.getElementById("settingsCancelUserBtn");
  const saveUserButton = document.getElementById("settingsSaveUserBtn");
  const userIdInput = document.getElementById("settingsUserId");
  const usernameInput = document.getElementById("settingsUsername");
  const passwordInput = document.getElementById("settingsPassword");
  const passwordHint = document.getElementById("settingsPasswordHint");
  const passwordToggle = document.getElementById("settingsPasswordToggle");
  const roleInput = document.getElementById("settingsRole");
  const feedback = document.getElementById("settingsFeedback");
  const backupButton = document.getElementById("settingsBackupBtn");

  let latestUsers = [];
  let usersLoadedOnce = false;
  let latestUsersSignature = "";

  function createSettingsUsersSignature(users = []) {
    if (!Array.isArray(users)) return "[]";

    return JSON.stringify(users.map((user) => ({
      id: user?.id ?? "",
      username: user?.username ?? "",
      role: user?.role ?? "",
      isActive: user?.isActive ?? user?.is_active ?? "",
      updatedAt: user?.updatedAt ?? user?.updated_at ?? "",
      createdAt: user?.createdAt ?? user?.created_at ?? ""
    })));
  }

  function preserveSettingsUserListScroll(callback) {
    if (!userList || typeof callback !== "function") return callback?.();

    const top = userList.scrollTop;
    const left = userList.scrollLeft;
    const result = callback();

    userList.scrollTop = top;
    userList.scrollLeft = left;

    return result;
  }

  const roleLabels = {
    admin: "Admin",
    manager: "Manager",
    supervisor: "Supervisor",
    logistics: "Logistic",
    production_staff: "Production Staff",
    lockkey_production: "Lockkey Production",
    happy_production: "Happy Production",
    viewer: "Viewer",
    boss: "Manager",
    order_staff: "Logistic",
    delivery_staff: "Logistic",
    logistic: "Logistic"
  };

  function normalizeSettingsRole(role) {
    const normalizedRole = String(role || "")
      .trim()
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");

    if (normalizedRole === "boss") return "manager";
    if (["logistics", "logistic", "order_staff", "delivery_staff"].includes(normalizedRole)) return "logistics";
    if (["lockkey", "lockkey_production_staff"].includes(normalizedRole)) return "lockkey_production";
    if (["happy", "happy_production_staff"].includes(normalizedRole)) return "happy_production";
    return roleLabels[normalizedRole] ? normalizedRole : "production_staff";
  }

  function setPasswordVisibility(isVisible) {
    if (!passwordInput || !passwordToggle) return;

    passwordInput.type = isVisible ? "text" : "password";
    passwordToggle.classList.toggle("is-visible", isVisible);
    passwordToggle.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
    passwordToggle.setAttribute("aria-pressed", isVisible ? "true" : "false");
  }

  function escapeSettingsHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getStoredUser() {
    const keys = ["currentUser", "loggedInUser", "activeUser", "user"];

    for (const key of keys) {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) continue;

      try {
        const parsedValue = JSON.parse(rawValue);
        if (parsedValue?.username) return parsedValue;
      } catch (error) {
        if (String(rawValue).trim()) return { username: String(rawValue).trim() };
      }
    }

    const username = localStorage.getItem("username");
    return username ? { username } : null;
  }

  function getAuthHeaders() {
    const user = getStoredUser();
    const token = localStorage.getItem("dashboardAuthToken") || "";

    return {
      "Content-Type": "application/json",
      "X-User-Id": user?.username || "",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function requestSettingsApi(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {})
      },
      ...options
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || "Request failed.");
    }

    return data;
  }

  function showFeedback(message, isError = false) {
    if (!feedback) return;

    feedback.textContent = message;
    feedback.hidden = false;
    feedback.classList.toggle("error", isError);

    window.clearTimeout(showFeedback.timer);
    showFeedback.timer = window.setTimeout(() => {
      feedback.hidden = true;
      feedback.classList.remove("error");
    }, isError ? 5200 : 3200);
  }

  function setFormMode(mode, user = null) {
    if (!userForm) return;

    const isEdit = mode === "edit";
    userForm.hidden = false;
    userIdInput.value = isEdit ? String(user.id) : "";
    usernameInput.value = isEdit ? user.username : "";
    passwordInput.value = "";
    passwordInput.required = !isEdit;
    roleInput.value = isEdit ? normalizeSettingsRole(user.role) : "production_staff";
    setPasswordVisibility(false);
    passwordHint.textContent = isEdit
      ? "Leave blank if you do not want to change the password."
      : "Required when creating a new user.";
    saveUserButton.textContent = isEdit ? "Update User" : "Save User";
    usernameInput.focus();
  }

  function resetForm() {
    if (!userForm) return;

    userForm.hidden = true;
    userForm.reset();
    userIdInput.value = "";
    passwordInput.required = false;
    passwordHint.textContent = "Required when creating a new user.";
    saveUserButton.textContent = "Save User";
    setPasswordVisibility(false);
  }

  function renderUsers() {
    if (!userList) return;

    if (!latestUsers.length) {
      userList.innerHTML = `
        <div class="settings-empty-state">
          <strong>No users yet</strong>
          <span>Create your first user account.</span>
        </div>
      `;
      return;
    }

    userList.innerHTML = latestUsers.map((user) => {
      const safeRole = normalizeSettingsRole(user.role);
      const roleLabel = roleLabels[safeRole] || user.role;
      const isMainAdmin = String(user.username).toLowerCase() === "admin";
      const deleteDisabled = isMainAdmin ? "disabled" : "";
      const deleteTitle = isMainAdmin ? "Main admin cannot be deleted" : "Delete user";

      return `
        <article class="settings-user-row" data-user-id="${escapeSettingsHTML(user.id)}">
          <div class="settings-user-main">
            <strong>${escapeSettingsHTML(user.username)}</strong>
            <span>ID #${escapeSettingsHTML(user.id)}</span>
          </div>

          <div class="settings-user-role">
            <span class="settings-user-role-pill">${escapeSettingsHTML(roleLabel)}</span>
          </div>

          <div class="settings-user-status">
            <span class="settings-user-status-pill">${user.isActive ? "Active" : "Inactive"}</span>
          </div>

          <div class="settings-user-actions">
            <button class="settings-edit-btn" type="button" data-settings-edit-user="${escapeSettingsHTML(user.id)}">Edit</button>
            <button class="settings-danger-btn" type="button" data-settings-delete-user="${escapeSettingsHTML(user.id)}" title="${escapeSettingsHTML(deleteTitle)}" ${deleteDisabled}>Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadUsers(options = {}) {
    if (!userList) return;

    const isSilent = options.silent === true;

    if (!isSilent) {
      userList.innerHTML = `
        <div class="settings-empty-state">
          <strong>Loading users...</strong>
          <span>Accounts from the database will appear here.</span>
        </div>
      `;
    }

    try {
      const data = await requestSettingsApi(USERS_API_BASE);
      const nextUsers = Array.isArray(data.users) ? data.users : [];
      const nextSignature = createSettingsUsersSignature(nextUsers);

      usersLoadedOnce = true;

      if (isSilent && nextSignature === latestUsersSignature) {
        return;
      }

      latestUsers = nextUsers;
      latestUsersSignature = nextSignature;

      if (isSilent) {
        preserveSettingsUserListScroll(renderUsers);
      } else {
        renderUsers();
      }
    } catch (error) {
      if (isSilent) {
        console.warn("Settings users live refresh failed:", error.message);
        return;
      }

      userList.innerHTML = `
        <div class="settings-empty-state">
          <strong>Cannot load users</strong>
          <span>${escapeSettingsHTML(error.message || "Please log in again as admin.")}</span>
        </div>
      `;
    }
  }

  passwordToggle?.addEventListener("click", () => {
    setPasswordVisibility(passwordInput?.type === "password");
    passwordInput?.focus();
  });

  newUserButton?.addEventListener("click", () => setFormMode("create"));
  cancelUserButton?.addEventListener("click", resetForm);

  userForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const userId = userIdInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    const role = normalizeSettingsRole(roleInput.value);
    const isEdit = Boolean(userId);

    if (!username || username.length < 3) {
      showFeedback("Username must be at least 3 characters.", true);
      usernameInput.focus();
      return;
    }

    if (!isEdit && (!password || password.length < 4)) {
      showFeedback("Password must be at least 4 characters.", true);
      passwordInput.focus();
      return;
    }

    saveUserButton.disabled = true;
    saveUserButton.textContent = isEdit ? "Updating..." : "Saving...";

    try {
      const payload = { username, role };
      if (password) payload.password = password;

      await requestSettingsApi(isEdit ? `${USERS_API_BASE}/${encodeURIComponent(userId)}` : USERS_API_BASE, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });

      resetForm();
      await loadUsers();
      showFeedback(isEdit ? "User updated." : "User created.");
    } catch (error) {
      showFeedback(error.message || "Unable to save user.", true);
    } finally {
      saveUserButton.disabled = false;
      saveUserButton.textContent = isEdit ? "Update User" : "Save User";
    }
  });

  userList?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-settings-edit-user]");
    const deleteButton = event.target.closest("[data-settings-delete-user]");

    if (editButton) {
      const userId = Number(editButton.dataset.settingsEditUser);
      const user = latestUsers.find((item) => Number(item.id) === userId);
      if (user) setFormMode("edit", user);
      return;
    }

    if (deleteButton) {
      const userId = Number(deleteButton.dataset.settingsDeleteUser);
      const user = latestUsers.find((item) => Number(item.id) === userId);
      if (!user) return;

      const confirmed = window.confirm(`Delete user "${user.username}"?`);
      if (!confirmed) return;

      deleteButton.disabled = true;

      try {
        await requestSettingsApi(`${USERS_API_BASE}/${encodeURIComponent(userId)}`, {
          method: "DELETE"
        });

        await loadUsers();
        showFeedback("User deleted.");
      } catch (error) {
        showFeedback(error.message || "Unable to delete user.", true);
        deleteButton.disabled = false;
      }
    }
  });

  backupButton?.addEventListener("click", () => {
    const user = getStoredUser();
    const token = localStorage.getItem("dashboardAuthToken") || "";
    const backupUrl = new URL(BACKUP_API_URL, window.location.origin);

    if (user?.username) backupUrl.searchParams.set("username", user.username);
    if (token) backupUrl.searchParams.set("token", token);

    window.location.href = backupUrl.toString();
  });

  function isSettingsViewActiveForLiveRefresh() {
    return settingsView.classList.contains("active-view");
  }

  function isSettingsAutoRefreshBlocked() {
    if (!isSettingsViewActiveForLiveRefresh()) return true;
    if (userForm && !userForm.hidden) return true;

    const activeElement = document.activeElement;
    if (!activeElement) return false;

    return Boolean(activeElement.closest?.(".settings-view input, .settings-view textarea, .settings-view select, .settings-view button"));
  }

  function refreshSettingsUsersForLivePolling() {
    if (isSettingsAutoRefreshBlocked()) return;
    loadUsers({ silent: true });
  }

  document.addEventListener("system:settings-live-refresh", refreshSettingsUsersForLivePolling);

  document.querySelector('[data-view-target="settings"]')?.addEventListener("click", () => {
    if (!usersLoadedOnce) {
      window.setTimeout(loadUsers, 80);
    }
  });

  if (settingsView.classList.contains("active-view")) {
    loadUsers();
  }
})();
