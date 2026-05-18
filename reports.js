/* ===== REPORTS PAGE ONLY ===== */

(function initReportsPage() {
  const reportsView = document.querySelector('[data-view="reports"]');
  if (!reportsView) return;

  const ACTIVITY_API_URL = "/api/activity/logs";
  const logList = document.getElementById("reportsLogList");
  const searchInput = document.getElementById("reportsSearchInput");
  const moduleFilter = document.getElementById("reportsModuleFilter");
  const dateFromInput = document.getElementById("reportsDateFrom");
  const dateToInput = document.getElementById("reportsDateTo");
  const clearButton = document.getElementById("reportsClearBtn");
  const refreshButton = document.getElementById("reportsRefreshBtn");
  const totalCount = document.getElementById("reportsTotalCount");
  const scopeLabel = document.getElementById("reportsScopeLabel");
  const summaryGrid = document.getElementById("reportsSummaryGrid");

  let reportsLoadedOnce = false;
  let reportsSearchTimer = null;
  let latestReportsSignature = "";

  function createReportsSignature(data = {}) {
    const logs = Array.isArray(data.logs) ? data.logs : [];
    const summary = Array.isArray(data.summary) ? data.summary : [];

    return JSON.stringify({
      scope: data.scope || "",
      logs: logs.map((log) => ({
        id: log?.id ?? "",
        createdAt: log?.createdAt ?? "",
        username: log?.username ?? "",
        module: log?.module ?? "",
        action: log?.action ?? "",
        referenceLabel: log?.referenceLabel ?? ""
      })),
      summary: summary.map((item) => ({ module: item?.module ?? "", count: item?.count ?? 0 }))
    });
  }

  function preserveReportsScroll(callback) {
    if (!logList || typeof callback !== "function") return callback?.();

    const top = logList.scrollTop;
    const left = logList.scrollLeft;
    const result = callback();

    logList.scrollTop = top;
    logList.scrollLeft = left;

    return result;
  }

  const roleLabels = {
    admin: "Admin",
    manager: "Manager",
    supervisor: "Supervisor",
    logistics: "Logistic",
    production_staff: "Production Staff",
    viewer: "Viewer"
  };

  function escapeReportsHTML(value) {
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

  async function requestReportsApi(url) {
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || "Unable to load activity logs.");
    }

    return data;
  }

  function formatActivityDateTime(value) {
    if (!value) return "—";

    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})\s+(\d{2}):(\d{2})/);

    if (match) {
      const [, year, month, day, hour, minute] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }).format(date);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(parsed);
  }

  function buildReportsUrl() {
    const url = new URL(ACTIVITY_API_URL, window.location.origin);
    const search = searchInput?.value.trim() || "";
    const moduleName = moduleFilter?.value || "all";
    const dateFrom = dateFromInput?.value || "";
    const dateTo = dateToInput?.value || "";

    url.searchParams.set("limit", "120");
    if (search) url.searchParams.set("search", search);
    if (moduleName && moduleName !== "all") url.searchParams.set("module", moduleName);
    if (dateFrom) url.searchParams.set("dateFrom", dateFrom);
    if (dateTo) url.searchParams.set("dateTo", dateTo);

    return url;
  }

  function renderSummary(data) {
    const logs = Array.isArray(data.logs) ? data.logs : [];
    const summary = Array.isArray(data.summary) ? data.summary : [];

    if (totalCount) totalCount.textContent = String(logs.length);
    if (scopeLabel) scopeLabel.textContent = data.scope === "production" ? "Production" : "All";

    const existingDynamicCards = summaryGrid?.querySelectorAll(".reports-summary-card.dynamic-summary");
    existingDynamicCards?.forEach((card) => card.remove());

    summary.slice(0, 4).forEach((item) => {
      const card = document.createElement("article");
      card.className = "reports-summary-card dynamic-summary";
      card.innerHTML = `
        <span>${escapeReportsHTML(item.module)}</span>
        <strong>${escapeReportsHTML(item.count)}</strong>
      `;
      summaryGrid?.appendChild(card);
    });
  }

  function renderLogs(logs) {
    if (!logList) return;

    if (!Array.isArray(logs) || !logs.length) {
      logList.innerHTML = `
        <div class="reports-empty-state">
          <strong>No activity logs found</strong>
          <span>Try clearing filters or refresh the report.</span>
        </div>
      `;
      return;
    }

    logList.innerHTML = logs.map((log) => {
      const roleLabel = roleLabels[log.role] || log.role || "—";
      const reference = log.referenceLabel ? `<span class="reports-reference">${escapeReportsHTML(log.referenceLabel)}</span>` : "";

      return `
        <article class="reports-log-row">
          <div class="reports-log-date">
            <strong>${escapeReportsHTML(formatActivityDateTime(log.createdAt))}</strong>
            <span>${escapeReportsHTML(log.createdAt || "")}</span>
          </div>

          <div class="reports-log-user">
            <strong>${escapeReportsHTML(log.username || "—")}</strong>
            <span>${escapeReportsHTML(roleLabel)}</span>
          </div>

          <div class="reports-log-module">
            <span class="reports-module-pill">${escapeReportsHTML(log.module || "System")}</span>
          </div>

          <div class="reports-log-action">
            <strong>${escapeReportsHTML(log.action || "Activity")}</strong>
            ${reference}
          </div>

          <div class="reports-log-details">
            <p>${escapeReportsHTML(log.details || "No details provided.")}</p>
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadActivityLogs(options = {}) {
    if (!logList) return;

    const isSilent = options.silent === true;
    const forceRender = options.forceRender === true;

    if (!isSilent) {
      logList.innerHTML = `
        <div class="reports-empty-state">
          <strong>Loading activity logs...</strong>
          <span>Please wait while the report is being prepared.</span>
        </div>
      `;
    }

    try {
      const data = await requestReportsApi(buildReportsUrl());
      const nextSignature = createReportsSignature(data);

      reportsLoadedOnce = true;

      if (isSilent && !forceRender && nextSignature === latestReportsSignature) {
        return;
      }

      latestReportsSignature = nextSignature;

      if (isSilent) {
        preserveReportsScroll(() => {
          renderSummary(data);
          renderLogs(data.logs || []);
        });
      } else {
        renderSummary(data);
        renderLogs(data.logs || []);
      }
    } catch (error) {
      if (isSilent) {
        console.warn("Reports live refresh failed:", error.message);
        return;
      }

      logList.innerHTML = `
        <div class="reports-empty-state error">
          <strong>Cannot load activity logs</strong>
          <span>${escapeReportsHTML(error.message || "Please log in again with report access.")}</span>
        </div>
      `;
      if (totalCount) totalCount.textContent = "0";
    }
  }

  function scheduleReportsRefresh() {
    window.clearTimeout(reportsSearchTimer);
    reportsSearchTimer = window.setTimeout(loadActivityLogs, 250);
  }

  document.querySelector('[data-view-target="reports"]')?.addEventListener("click", () => {
    window.setTimeout(loadActivityLogs, reportsLoadedOnce ? 40 : 120);
  });

  refreshButton?.addEventListener("click", loadActivityLogs);

  function isReportsAutoRefreshBlocked() {
    if (!reportsView.classList.contains("active-view")) return true;

    const activeElement = document.activeElement;
    if (!activeElement) return false;

    return Boolean(activeElement.closest?.(".reports-toolbar input, .reports-toolbar select"));
  }

  document.addEventListener("system:reports-live-refresh", () => {
    if (isReportsAutoRefreshBlocked()) return;
    loadActivityLogs({ silent: true });
  });
  searchInput?.addEventListener("input", scheduleReportsRefresh);
  moduleFilter?.addEventListener("change", loadActivityLogs);
  dateFromInput?.addEventListener("change", loadActivityLogs);
  dateToInput?.addEventListener("change", loadActivityLogs);

  clearButton?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (moduleFilter) moduleFilter.value = "all";
    if (dateFromInput) dateFromInput.value = "";
    if (dateToInput) dateToInput.value = "";
    loadActivityLogs();
  });

  document.addEventListener("system:activity-logs-updated", () => loadActivityLogs({ silent: true, forceRender: true }));

  if (reportsView.classList.contains("active-view")) {
    loadActivityLogs();
  }
})();
