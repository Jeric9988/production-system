/* ===== LOGIN-FIRST DASHBOARD GUARD ===== */
(function enforceDashboardLogin() {
  const sessionKeys = ["currentUser", "loggedInUser", "activeUser"];

  function hasValidSession() {
    return sessionKeys.some((key) => {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) return false;

      try {
        const parsedValue = JSON.parse(rawValue);
        return Boolean(parsedValue?.username || parsedValue?.name || parsedValue?.role);
      } catch (error) {
        return false;
      }
    });
  }

  if (!hasValidSession()) {
    window.location.replace("/login");
  }
})();

const root = document.documentElement;
const body = document.body;

/* ===== OLDER BROWSER ICON FALLBACK ===== */
/* Keeps the current CSS-mask icon system for modern browsers.
   If an older browser cannot render CSS masks, it injects inline SVG icons instead. */
(function initDashboardIconFallback() {
  const testIconMask = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 1 1\'%3E%3Cpath d=\'M0 0h1v1H0z\'/%3E%3C/svg%3E")';

  function supportsMaskIcons() {
    try {
      if (window.CSS && typeof window.CSS.supports === "function") {
        return window.CSS.supports("mask-image", testIconMask) ||
          window.CSS.supports("-webkit-mask-image", testIconMask);
      }

      const testElement = document.createElement("span");
      testElement.style.maskImage = testIconMask;
      testElement.style.webkitMaskImage = testIconMask;

      return Boolean(testElement.style.maskImage || testElement.style.webkitMaskImage);
    } catch (error) {
      return false;
    }
  }

  const iconPaths = {
    home: "M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5v-9Z",
    bag: "M7 7V6a5 5 0 0 1 10 0v1h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2Zm2 0h6V6a3 3 0 0 0-6 0v1Z",
    truck: "M3 5h11v10H3V5Zm12 4h3.5L22 12.5V15h-2.1a3 3 0 0 0-5.8 0H10a3 3 0 0 0-5.8 0H3v2h1.2a3 3 0 0 0 5.6 0h4.4a3 3 0 0 0 5.6 0H22v-4.5L19.5 9H15V9ZM7 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    delivery: "M3 5h11v10H3V5Zm12 4h3.5L22 12.5V15h-2.1a3 3 0 0 0-5.8 0H10a3 3 0 0 0-5.8 0H3v2h1.2a3 3 0 0 0 5.6 0h4.4a3 3 0 0 0 5.6 0H22v-4.5L19.5 9H15V9ZM7 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    users: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z",
    user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z",
    box: "m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 2.3L5.4 8 12 11.7 18.6 8 12 4.3ZM5 10v5.8l6 3.3v-5.7L5 10Zm14 0-6 3.4v5.7l6-3.3V10Z",
    chart: "M4 19h16v2H2V3h2v16Zm2-3 4-5 4 3 6-8 1.6 1.2-7.2 9.6-4-3-2.8 3.5L6 16Z",
    line: "M4 19h16v2H2V3h2v16Zm2-3 4-5 4 3 6-8 1.6 1.2-7.2 9.6-4-3-2.8 3.5L6 16Z",
    trend: "M4 19h16v2H2V3h2v16Zm2-3 4-5 4 3 6-8 1.6 1.2-7.2 9.6-4-3-2.8 3.5L6 16Z",
    settings: "m19.4 13.5.1-1.5-.1-1.5 2-1.5-2-3.5-2.4 1a8.5 8.5 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A8.5 8.5 0 0 0 7 6L4.6 5 2.6 8.5l2 1.5-.1 1.5.1 1.5-2 1.5 2 3.5 2.4-1a8.5 8.5 0 0 0 2.6 1.5L10 22h4l.4-2.5A8.5 8.5 0 0 0 17 18l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
    calendar: "M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm13 8H4v10h16V10ZM4 8h16V6H4v2Z",
    clock: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-10.4V6h-2v7h6v-2h-4Z",
    logout: "M14 3h-3a2 2 0 0 0-2 2v2h2V5h3v14h-3v-2H9v2a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm3.6 5.6L16.2 10H4v2h12.2l1.4 1.4L19 12l-1.4-1.4L19 9.2l-1.4-1.4Z",
    clipboard: "M9 2h6l1 2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3l1-2Zm0 6h6V6H9v2Zm-1 5h8v-2H8v2Zm0 4h8v-2H8v2Z",
    check: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm-1.2-6 6.7-6.7-1.4-1.4-5.3 5.3-2.4-2.4L7 12.2l3.8 3.8Z",
    bell: "M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5-6.7V3a2 2 0 0 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z",
    bolt: "m13 2-8 12h6l-1 8 8-12h-6l1-8Z",
    play: "M8 5v14l11-7L8 5Z",
    pause: "M6 5h5v14H6V5Zm7 0h5v14h-5V5Z"
  };

  function renderInlineIcon(iconName) {
    const path = iconPaths[iconName] || iconPaths.clipboard;
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="' + path + '"></path></svg>';
  }

  function applyIconFallback() {
    if (supportsMaskIcons()) return;

    root.classList.add("icon-fallback");

    document.querySelectorAll("[data-icon]").forEach((iconElement) => {
      const iconName = iconElement.getAttribute("data-icon");
      if (!iconName) return;
      if (iconElement.querySelector("svg")) return;
      iconElement.innerHTML = renderInlineIcon(iconName);
      iconElement.setAttribute("aria-hidden", "true");
    });
  }

  applyIconFallback();
  document.addEventListener("DOMContentLoaded", applyIconFallback);
  window.addEventListener("load", applyIconFallback);
})();

const themeToggle = document.getElementById("themeToggle");
const sidebar = document.getElementById("sidebar");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const mobileInfoToggle = document.getElementById("mobileInfoToggle");
const mobileInfoPanel = document.getElementById("mobileInfoPanel");
const mobilePanelUser = document.getElementById("mobilePanelUser");
const mobilePanelTime = document.getElementById("mobilePanelTime");
const mobilePanelDate = document.getElementById("mobilePanelDate");
const dashboardLogoutButtons = document.querySelectorAll(".sidebar-logout-btn, .logout-btn, #mobilePanelLogoutBtn");

/* ===== SAFETY FIX: CLEAR STUCK DASHBOARD OVERLAYS ON LOAD ===== */
/*
  Fixes black tint / unclickable page caused by stale modal/sidebar state,
  browser back-forward cache, or old cached JS/CSS during development.
*/
const dashboardOverlayLockClasses = [
  "mobile-menu-open",
  "tablet-sidebar-expanded",
  "dashboard-logout-modal-open",
  "dashboard-session-ended-open",
  "overview-modal-open",
  "overview-order-details-open",
  "notice-order-details-open",
  "pr-modal-open"
];

function resetDashboardStuckOverlays() {
  root.classList.remove(...dashboardOverlayLockClasses);
  body.classList.remove(...dashboardOverlayLockClasses);

  sidebar?.classList.remove("open", "swiping");
  sidebarBackdrop?.classList.remove("show");
  sidebarBackdrop?.setAttribute("aria-hidden", "true");

  document.querySelectorAll(
    ".logout-confirm-backdrop, " +
    ".session-ended-backdrop, " +
    ".sidebar-backdrop, " +
    ".overview-modal-backdrop, " +
    ".overview-order-details-backdrop, " +
    ".notice-order-details-backdrop, " +
    ".pr-modal-backdrop"
  ).forEach((overlay) => {
    overlay.classList.remove("show", "open", "active");
    overlay.setAttribute("aria-hidden", "true");

    // Remove any stale inline state from old patches or browser cache.
    overlay.style.removeProperty("opacity");
    overlay.style.removeProperty("pointer-events");
    overlay.style.removeProperty("visibility");
  });
}

resetDashboardStuckOverlays();
document.addEventListener("DOMContentLoaded", resetDashboardStuckOverlays);
window.addEventListener("load", resetDashboardStuckOverlays);
window.addEventListener("pageshow", resetDashboardStuckOverlays);
window.setTimeout(resetDashboardStuckOverlays, 80);
window.setTimeout(resetDashboardStuckOverlays, 350);

const philippinesTimeZone = "Asia/Manila";

const philippinesDateTimeFormatter = {
  date: new Intl.DateTimeFormat("en-US", {
    timeZone: philippinesTimeZone,
    month: "long",
    day: "numeric",
    year: "numeric"
  }),
  time: new Intl.DateTimeFormat("en-US", {
    timeZone: philippinesTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }),
  monthYear: new Intl.DateTimeFormat("en-US", {
    timeZone: philippinesTimeZone,
    month: "long",
    year: "numeric"
  }),
  parts: new Intl.DateTimeFormat("en-US", {
    timeZone: philippinesTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
};

const savedTheme = localStorage.getItem("dashboard-theme");
if (savedTheme) root.dataset.theme = savedTheme;

themeToggle?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = nextTheme;
  localStorage.setItem("dashboard-theme", nextTheme);
});

function lockBackgroundScroll() {
  if (window.innerWidth <= 768) {
    body.classList.add("mobile-menu-open");
    root.classList.add("mobile-menu-open");
  }
}

function unlockBackgroundScroll() {
  body.classList.remove("mobile-menu-open");
  root.classList.remove("mobile-menu-open");
}

function openSidebar() {
  sidebar?.classList.add("open");
  sidebarBackdrop?.classList.add("show");
  lockBackgroundScroll();
  closeMobileInfoPanel();
}

function closeSidebar() {
  sidebar?.classList.remove("open");
  sidebarBackdrop?.classList.remove("show");
  unlockBackgroundScroll();
}

mobileMenuBtn?.addEventListener("click", openSidebar);
sidebarBackdrop?.addEventListener("click", closeSidebar);

window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    closeSidebar();
    closeMobileInfoPanel();
  }
});

function getPhilippinesDateParts(date = new Date()) {
  const parts = philippinesDateTimeFormatter.parts.formatToParts(date);
  const map = {};

  parts.forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month) - 1,
    day: Number(map.day)
  };
}

function getTopbarDateElement() {
  return Array.from(document.querySelectorAll(".topbar-actions span")).find((item) => item.querySelector('[data-icon="calendar"]'));
}

function getTopbarTimeElement() {
  return Array.from(document.querySelectorAll(".topbar-actions span")).find((item) => item.querySelector('[data-icon="clock"]'));
}

function getTopbarUserElement() {
  return Array.from(document.querySelectorAll(".topbar-actions span")).find((item) => item.querySelector('[data-icon="user"]'));
}

function replaceIconText(element, iconSelector, value) {
  if (!element) return;

  const icon = element.querySelector(iconSelector);
  const nextText = ` ${value}`;

  if (!icon) {
    if (element.textContent !== value) element.textContent = value;
    return;
  }

  let textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);

  if (!textNode) {
    textNode = document.createTextNode("");
    element.appendChild(textNode);
  }

  if (textNode.nodeValue !== nextText) {
    textNode.nodeValue = nextText;
  }
}

function updatePhilippinesTopbarDateTime() {
  const now = new Date();
  replaceIconText(getTopbarDateElement(), '[data-icon="calendar"]', philippinesDateTimeFormatter.date.format(now));
  replaceIconText(getTopbarTimeElement(), '[data-icon="clock"]', philippinesDateTimeFormatter.time.format(now));
  updateMobileInfoPanelData();
}

function buildOverviewPhilippinesCalendar() {
  const calendarPanel = document.querySelector(".overview-view .calendar-panel .calendar");
  if (!calendarPanel) return;

  const monthTitle = calendarPanel.querySelector("h3");
  const datesGrid = calendarPanel.querySelector(".dates");
  if (!monthTitle || !datesGrid) return;

  const phDate = getPhilippinesDateParts();
  const currentYear = phDate.year;
  const currentMonth = phDate.month;
  const currentDay = phDate.day;

  monthTitle.textContent = philippinesDateTimeFormatter.monthYear.format(new Date(currentYear, currentMonth, 1));
  datesGrid.innerHTML = "";

  const firstDay = new Date(currentYear, currentMonth, 1);
  const startDay = firstDay.getDay();
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
  const previousLastDate = new Date(currentYear, currentMonth, 0).getDate();

  for (let cellIndex = 0; cellIndex < 42; cellIndex++) {
    const dateCell = document.createElement("span");
    let dayNumber;
    let isMuted = false;

    if (cellIndex < startDay) {
      dayNumber = previousLastDate - startDay + cellIndex + 1;
      isMuted = true;
    } else if (cellIndex >= startDay + lastDate) {
      dayNumber = cellIndex - (startDay + lastDate) + 1;
      isMuted = true;
    } else {
      dayNumber = cellIndex - startDay + 1;
    }

    dateCell.textContent = dayNumber;
    if (isMuted) dateCell.classList.add("muted");
    if (!isMuted && dayNumber === currentDay) dateCell.classList.add("today");

    datesGrid.appendChild(dateCell);
  }
}

function getTopbarUserText() {
  return getTopbarUserElement()?.textContent.trim() || "Admin User";
}

function updateMobileInfoPanelData() {
  const now = new Date();

  if (mobilePanelUser) mobilePanelUser.textContent = getTopbarUserText();
  if (mobilePanelTime) mobilePanelTime.textContent = philippinesDateTimeFormatter.time.format(now);
  if (mobilePanelDate) mobilePanelDate.textContent = philippinesDateTimeFormatter.date.format(now);
}

function openMobileInfoPanel() {
  if (window.innerWidth > 768) return;

  updateMobileInfoPanelData();
  mobileInfoPanel?.classList.add("show");
  mobileInfoPanel?.setAttribute("aria-hidden", "false");
  mobileInfoToggle?.classList.add("is-open");
  mobileInfoToggle?.setAttribute("aria-expanded", "true");
}

function closeMobileInfoPanel() {
  mobileInfoPanel?.classList.remove("show");
  mobileInfoPanel?.setAttribute("aria-hidden", "true");
  mobileInfoToggle?.classList.remove("is-open");
  mobileInfoToggle?.setAttribute("aria-expanded", "false");
}

function toggleMobileInfoPanel() {
  if (mobileInfoPanel?.classList.contains("show")) closeMobileInfoPanel();
  else openMobileInfoPanel();
}

mobileInfoToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMobileInfoPanel();
});

mobileInfoToggle?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleMobileInfoPanel();
  }
});

mobileInfoPanel?.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeMobileInfoPanel);

function ensureLogoutConfirmModalStyles() {
  if (document.getElementById("logoutConfirmModalStyles")) return;

  const style = document.createElement("style");
  style.id = "logoutConfirmModalStyles";
  style.textContent = `
    body.dashboard-logout-modal-open {
      overflow: hidden;
    }

    .logout-confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 260;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(15, 23, 42, .46);
      backdrop-filter: blur(10px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .22s var(--ease);
    }

    .logout-confirm-backdrop.show {
      opacity: 1;
      pointer-events: auto;
    }

    .logout-confirm-modal {
      width: min(420px, 100%);
      border: 1px solid var(--line);
      border-radius: 24px;
      background:
        linear-gradient(135deg, rgba(36, 107, 254, .07), transparent 46%),
        var(--panel-solid);
      box-shadow: 0 26px 70px rgba(15, 23, 42, .25);
      padding: 24px;
      transform: translateY(14px) scale(.98);
      transition: transform .22s var(--ease);
    }

    html[data-theme="dark"] .logout-confirm-modal {
      box-shadow: 0 26px 70px rgba(0, 0, 0, .48);
    }

    .logout-confirm-backdrop.show .logout-confirm-modal {
      transform: translateY(0) scale(1);
    }


    .logout-confirm-modal h2 {
      margin: 0;
      color: var(--text);
      font-size: 1.35rem;
      letter-spacing: -.04em;
      line-height: 1.15;
    }

    .logout-confirm-modal p {
      margin: 9px 0 0;
      color: var(--muted);
      font-size: .94rem;
      font-weight: 550;
      line-height: 1.5;
    }

    .logout-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }

    .logout-confirm-no,
    .logout-confirm-yes {
      min-height: 44px;
      min-width: 104px;
      border-radius: 14px;
      padding: 10px 16px;
      border: 1px solid var(--line);
      cursor: pointer;
      font-weight: 900;
      transition: transform .18s var(--ease), background .18s var(--ease), border-color .18s var(--ease), color .18s var(--ease);
    }

    .logout-confirm-no {
      color: var(--text);
      background: var(--panel);
    }

    .logout-confirm-yes {
      color: #fff;
      border-color: rgba(239, 68, 68, .18);
      background: #ef4444;
      box-shadow: 0 12px 24px rgba(239, 68, 68, .22);
    }

    .logout-confirm-no:hover,
    .logout-confirm-yes:hover {
      transform: translateY(-1px);
    }

    .logout-confirm-no:hover {
      color: var(--blue);
      border-color: rgba(36, 107, 254, .22);
      background: var(--blue-soft);
    }

    .logout-confirm-yes:hover {
      background: #dc2626;
    }

    @media (max-width: 768px) {
      .logout-confirm-backdrop {
        align-items: end;
        padding: 14px;
      }

      .logout-confirm-modal {
        width: 100%;
        border-radius: 22px;
      }

      .logout-confirm-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .logout-confirm-no,
      .logout-confirm-yes {
        width: 100%;
        min-width: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

function getDashboardStoredUser() {
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

function getDashboardAuthHeaders() {
  const user = getDashboardStoredUser();
  const token = localStorage.getItem("dashboardAuthToken") || "";

  return {
    "Content-Type": "application/json",
    "X-User-Id": user?.username || "",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function notifyServerLogoutActivity() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: getDashboardAuthHeaders()
    });
  } catch (error) {
    // Logout should still continue even if the activity-log request fails.
  }
}

function clearDashboardLoginSession() {
  [
    "currentUser",
    "loggedInUser",
    "activeUser",
    "username",
    "user",
    "dashboardAuthToken"
  ].forEach((key) => localStorage.removeItem(key));
}

let dashboardSessionEnded = false;

function ensureSessionEndedModalStyles() {
  if (document.getElementById("sessionEndedModalStyles")) return;

  const style = document.createElement("style");
  style.id = "sessionEndedModalStyles";
  style.textContent = `
    body.dashboard-session-ended-open {
      overflow: hidden;
    }

    .session-ended-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(15, 23, 42, .48);
      backdrop-filter: blur(10px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s var(--ease);
    }

    .session-ended-backdrop.show {
      opacity: 1;
      pointer-events: auto;
    }

    .session-ended-modal {
      width: min(430px, 100%);
      padding: 26px;
      border: 1px solid var(--line);
      border-radius: 24px;
      color: var(--text);
      background: var(--panel-solid);
      box-shadow: 0 28px 80px rgba(15, 23, 42, .24);
      text-align: center;
      transform: translateY(10px) scale(.98);
      transition: transform .2s var(--ease);
    }

    .session-ended-backdrop.show .session-ended-modal {
      transform: translateY(0) scale(1);
    }

    .session-ended-modal h2 {
      margin: 0 0 9px;
      font-size: 1.35rem;
      letter-spacing: -.035em;
    }

    .session-ended-modal p {
      margin: 0 0 20px;
      color: var(--muted);
      line-height: 1.55;
      font-weight: 650;
    }

    .session-ended-modal button {
      width: 100%;
      min-height: 46px;
      border: 0;
      border-radius: 15px;
      color: #fff;
      background: var(--blue);
      font-weight: 900;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

function redirectToLoginAfterSessionEnd() {
  document.body?.classList.remove("dashboard-session-ended-open");
  document.documentElement?.classList.remove("dashboard-session-ended-open");
  document.querySelectorAll(".session-ended-backdrop").forEach((modal) => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  });
  window.location.replace("/login");
}

function showDashboardSessionEndedModal(message) {
  if (dashboardSessionEnded) return;
  dashboardSessionEnded = true;

  clearDashboardLoginSession();
  closeLogoutConfirmModal?.();
  closeSidebar?.();
  closeMobileInfoPanel?.();
  ensureSessionEndedModalStyles();

  let modal = document.getElementById("sessionEndedModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.className = "session-ended-backdrop";
    modal.id = "sessionEndedModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="session-ended-modal" role="dialog" aria-modal="true" aria-labelledby="sessionEndedTitle" aria-describedby="sessionEndedText">
        <h2 id="sessionEndedTitle">Session ended</h2>
        <p id="sessionEndedText"></p>
        <button type="button" data-session-ended-login>Sign in again</button>
      </section>
    `;
    document.body.appendChild(modal);
    modal.querySelector("[data-session-ended-login]")?.addEventListener("click", redirectToLoginAfterSessionEnd);
  }

  const text = modal.querySelector("#sessionEndedText");
  if (text) {
    text.textContent = message || "Your account was logged in on another device. Please sign in again to continue.";
  }

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("dashboard-session-ended-open");
  modal.querySelector("[data-session-ended-login]")?.focus();

  window.setTimeout(redirectToLoginAfterSessionEnd, 3500);
}

async function checkDashboardActiveSession() {
  if (dashboardSessionEnded) return false;

  const token = localStorage.getItem("dashboardAuthToken") || "";
  const user = getDashboardStoredUser();

  if (!token || !user?.username) {
    showDashboardSessionEndedModal("Please sign in again to continue.");
    return false;
  }

  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      headers: getDashboardAuthHeaders(),
      cache: "no-store"
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.ok) {
      if (data?.user?.username) {
        const currentUser = getDashboardStoredUser() || {};
        const freshUser = {
          ...currentUser,
          ...data.user,
          loggedInAt: currentUser.loggedInAt || new Date().toISOString()
        };

        ["currentUser", "loggedInUser", "activeUser"].forEach((key) => {
          localStorage.setItem(key, JSON.stringify(freshUser));
        });
        localStorage.setItem("username", freshUser.username);
      }

      return true;
    }

    const code = String(data?.code || "").toUpperCase();

    if (code === "SESSION_REPLACED") {
      showDashboardSessionEndedModal(data?.error || "Your account was logged in on another device. Please sign in again to continue.");
      return false;
    }

    if (["SESSION_EXPIRED", "NO_SESSION"].includes(code) || response.status === 401) {
      clearDashboardLoginSession();
      redirectToLoginAfterSessionEnd();
      return false;
    }
  } catch (error) {
    // Network hiccup: keep the current page usable and try again on the next poll.
  }

  return true;
}

function closeLogoutConfirmModal() {
  const modal = document.getElementById("logoutConfirmModal");
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("dashboard-logout-modal-open");
}

async function confirmDashboardLogout() {
  closeLogoutConfirmModal();
  await notifyServerLogoutActivity();
  clearDashboardLoginSession();
  window.location.replace("/login");
}

function createLogoutConfirmModal() {
  ensureLogoutConfirmModalStyles();

  let modal = document.getElementById("logoutConfirmModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "logout-confirm-backdrop";
  modal.id = "logoutConfirmModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <section class="logout-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle" aria-describedby="logoutConfirmText">
      <h2 id="logoutConfirmTitle">Log out?</h2>
      <p id="logoutConfirmText">Are you sure you want to log out from the dashboard?</p>

      <div class="logout-confirm-actions">
        <button class="logout-confirm-no" type="button" data-logout-cancel>No</button>
        <button class="logout-confirm-yes" type="button" data-logout-confirm>Yes</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector("[data-logout-cancel]")?.addEventListener("click", closeLogoutConfirmModal);
  modal.querySelector("[data-logout-confirm]")?.addEventListener("click", confirmDashboardLogout);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) event.stopPropagation();
  });

  return modal;
}

function openLogoutConfirmModal() {
  closeSidebar();
  closeMobileInfoPanel();

  const modal = createLogoutConfirmModal();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("dashboard-logout-modal-open");
  modal.querySelector("[data-logout-cancel]")?.focus();
}

dashboardLogoutButtons.forEach((logoutButton) => {
  logoutButton.addEventListener("click", (event) => {
    event.preventDefault();
    openLogoutConfirmModal();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeLogoutConfirmModal();
});

const pieTooltip = document.getElementById("pieTooltip");
const radialChart = document.getElementById("radialChart");

document.querySelectorAll(".slice").forEach((slice) => {
  slice.addEventListener("mouseenter", () => {
    document.querySelectorAll(".slice").forEach((s) => s.classList.remove("active"));
    slice.classList.add("active");

    const title = slice.dataset.title || "Chart";
    const percent = slice.dataset.percent || "";
    const orders = slice.dataset.orders || "";

    if (pieTooltip) {
      pieTooltip.innerHTML = `${title}<br><b>${percent}</b><small>${orders}</small>`;
      pieTooltip.classList.add("show");
    }
  });
});

radialChart?.addEventListener("mouseleave", () => {
  pieTooltip?.classList.remove("show");
});

const lineChart = document.getElementById("lineChart");
const lineTooltip = document.getElementById("lineTooltip");

document.querySelectorAll(".points circle").forEach((point) => {
  point.addEventListener("mouseenter", () => {
    document.querySelectorAll(".points circle").forEach((p) => p.classList.remove("active"));
    point.classList.add("active");

    const month = point.dataset.month;
    const value = point.dataset.value;
    const cx = Number(point.getAttribute("cx"));
    const cy = Number(point.getAttribute("cy"));

    if (lineTooltip && lineChart) {
      lineTooltip.innerHTML = `${month}<br><b>${value}</b>`;
      lineTooltip.style.left = `calc(${(cx / 720) * 100}% - 26px)`;
      lineTooltip.style.top = `calc(${(cy / 260) * 100}% - 54px)`;
      lineTooltip.classList.add("show");
    }
  });
});

lineChart?.addEventListener("mouseleave", () => {
  lineTooltip?.classList.remove("show");
});

updatePhilippinesTopbarDateTime();
buildOverviewPhilippinesCalendar();
setInterval(updatePhilippinesTopbarDateTime, 60000);

/* Style based on the user's preferred donut chart.
   - Uses the 4 Overview cards as data source
   - Colors follow the card colors
   - Hover interaction: highlighted/lifted segment + tooltip
   - Shows quantity, not percentage
*/

function parseOverviewCount(value) {
  const number = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function getOverviewCardData() {
  const cards = Array.from(document.querySelectorAll(".overview-view .stats-grid .stat-card"));

  return cards.map((card, index) => {
    const title = card.querySelector("p")?.textContent.trim() || `Card ${index + 1}`;
    const count = parseOverviewCount(card.querySelector("strong")?.textContent);
    return { title, count };
  });
}

const donutChartColors = [
  { key: "pending", color: "var(--blue)", shadow: "rgba(36, 107, 254, .26)" },
  { key: "active", color: "var(--green)", shadow: "rgba(22, 184, 106, .26)" },
  { key: "delivery", color: "var(--orange)", shadow: "rgba(249, 115, 22, .26)" },
  { key: "delivered", color: "var(--purple)", shadow: "rgba(124, 77, 255, .26)" }
];

function getDonutChartColor(title, index) {
  const normalized = String(title || "").toLowerCase();
  const matched = donutChartColors.find((item) => normalized.includes(item.key));
  return matched || donutChartColors[index % donutChartColors.length];
}

function setMonthlyChartCenter(value, label) {
  const chartCenter = document.querySelector(".monthly-panel .chart-center");
  const valueNode = chartCenter?.querySelector("strong");
  const labelNode = chartCenter?.querySelector("span");

  if (valueNode) valueNode.textContent = value;
  if (labelNode) labelNode.textContent = label;
}

function updateMonthlyChartLegend(cardData) {
  const legendItems = Array.from(document.querySelectorAll(".monthly-panel .chart-legend li"));

  legendItems.forEach((legend, index) => {
    const item = cardData[index];

    if (!item) {
      legend.style.display = "none";
      return;
    }

    const colorSet = getDonutChartColor(item.title, index);
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = colorSet.color;

    const value = document.createElement("b");
    value.textContent = item.count.toLocaleString();

    legend.innerHTML = "";
    legend.appendChild(dot);
    legend.append(`${item.title} `);
    legend.appendChild(value);
    legend.style.display = "";
  });
}

function buildMonthlyDonutChart() {
  const cardData = getOverviewCardData();
  if (!cardData.length) return;

  const total = cardData.reduce((sum, item) => sum + item.count, 0);
  const radialChart = document.getElementById("radialChart");
  const pieTooltip = document.getElementById("pieTooltip");
  const monthlyPanel = document.querySelector(".monthly-panel");

  if (!radialChart || !monthlyPanel) return;

  monthlyPanel.classList.add("quantity-chart-mode", "donut-chart-mode");
  radialChart.classList.add("donut-chart-mode");

  radialChart.querySelector(".donut-svg")?.remove();

  setMonthlyChartCenter(total.toLocaleString(), "Total Orders");
  updateMonthlyChartLegend(cardData);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 240 240");
  svg.setAttribute("class", "donut-svg");
  svg.setAttribute("aria-label", "Overview monthly donut chart");

  const track = document.createElementNS(svgNS, "circle");
  track.setAttribute("class", "donut-track");
  track.setAttribute("cx", "120");
  track.setAttribute("cy", "120");
  track.setAttribute("r", "78");
  svg.appendChild(track);

  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const gapLength = 4.5;
  let runningLength = 0;

  cardData.forEach((item, index) => {
    const fraction = total > 0 ? item.count / total : 0;
    const segmentLength = Math.max((circumference * fraction) - gapLength, 0);
    const colorSet = getDonutChartColor(item.title, index);

    const segment = document.createElementNS(svgNS, "circle");
    segment.setAttribute("class", "donut-segment");
    segment.setAttribute("cx", "120");
    segment.setAttribute("cy", "120");
    segment.setAttribute("r", String(radius));
    segment.setAttribute("stroke", colorSet.color);
    segment.setAttribute("stroke-dasharray", `${segmentLength} ${circumference}`);
    segment.setAttribute("stroke-dashoffset", String(-runningLength));
    segment.dataset.title = item.title;
    segment.dataset.value = item.count.toLocaleString();
    segment.dataset.shadow = colorSet.shadow;

    const activateSegment = (event) => {
      svg.querySelectorAll(".donut-segment").forEach((el) => el.classList.remove("active"));
      segment.classList.add("active");
      setMonthlyChartCenter(item.count.toLocaleString(), item.title);

      if (pieTooltip) {
        pieTooltip.innerHTML = `${item.title}<br><b>${item.count.toLocaleString()}</b><small>Quantity</small>`;
        pieTooltip.classList.add("show");

        const chartRect = radialChart.getBoundingClientRect();
        const x = event.clientX - chartRect.left + 12;
        const y = event.clientY - chartRect.top - 8;

        pieTooltip.style.left = `${Math.max(18, Math.min(x, chartRect.width - 120))}px`;
        pieTooltip.style.top = `${Math.max(18, y)}px`;
      }
    };

    const deactivateSegment = () => {
      segment.classList.remove("active");
      setMonthlyChartCenter(total.toLocaleString(), "Total Orders");
      pieTooltip?.classList.remove("show");
    };

    segment.addEventListener("mouseenter", activateSegment);
    segment.addEventListener("mousemove", activateSegment);
    segment.addEventListener("mouseleave", deactivateSegment);

    svg.appendChild(segment);
    runningLength += circumference * fraction;
  });

  radialChart.insertBefore(svg, radialChart.querySelector(".chart-center"));

  radialChart.addEventListener("mouseleave", () => {
    setMonthlyChartCenter(total.toLocaleString(), "Total Orders");
    pieTooltip?.classList.remove("show");
    radialChart.querySelectorAll(".donut-segment").forEach((el) => {
      el.classList.remove("active");
    });
  });
}

buildMonthlyDonutChart();


/* ===== LATEST UPDATE: TABLET SIDEBAR SWIPE ONLY ===== */
/* Tablet range: 769px–1300px.
   Swipe right on compact sidebar to expand.
   Swipe left on expanded sidebar to collapse.
   No click-to-expand behavior.
*/

const tabletSidebarMinWidth = 769;
const tabletSidebarMaxWidth = 1300;

let tabletSwipeStartX = 0;
let tabletSwipeStartY = 0;
let tabletSwipeLastX = 0;
let tabletSwipeTracking = false;

function isTabletSidebarRange() {
  return window.innerWidth >= tabletSidebarMinWidth && window.innerWidth <= tabletSidebarMaxWidth;
}

function setTabletSidebarExpanded(isExpanded) {
  root.classList.toggle("tablet-sidebar-expanded", isExpanded);
  body.classList.toggle("tablet-sidebar-expanded", isExpanded);

  if (sidebar) {
    sidebar.setAttribute("aria-expanded", String(isExpanded));
  }
}

function openTabletSidebar() {
  if (!isTabletSidebarRange()) return;
  setTabletSidebarExpanded(true);
}

function closeTabletSidebar() {
  setTabletSidebarExpanded(false);
}

function resetTabletSwipe() {
  tabletSwipeStartX = 0;
  tabletSwipeStartY = 0;
  tabletSwipeLastX = 0;
  tabletSwipeTracking = false;
  sidebar?.classList.remove("swiping");
}

function syncTabletSidebarState() {
  if (!isTabletSidebarRange()) {
    closeTabletSidebar();
    resetTabletSwipe();
  }
}

sidebar?.addEventListener("touchstart", (event) => {
  if (!isTabletSidebarRange()) return;

  const touch = event.touches[0];
  if (!touch) return;

  tabletSwipeStartX = touch.clientX;
  tabletSwipeStartY = touch.clientY;
  tabletSwipeLastX = touch.clientX;
  tabletSwipeTracking = true;

  sidebar.classList.add("swiping");
}, { passive: true });

sidebar?.addEventListener("touchmove", (event) => {
  if (!tabletSwipeTracking || !isTabletSidebarRange()) return;

  const touch = event.touches[0];
  if (!touch) return;

  tabletSwipeLastX = touch.clientX;
}, { passive: true });

sidebar?.addEventListener("touchend", () => {
  if (!tabletSwipeTracking || !isTabletSidebarRange()) {
    resetTabletSwipe();
    return;
  }

  const deltaX = tabletSwipeLastX - tabletSwipeStartX;
  const isHorizontalSwipe = Math.abs(deltaX) >= 55;

  if (isHorizontalSwipe) {
    if (deltaX > 0 && !root.classList.contains("tablet-sidebar-expanded")) {
      openTabletSidebar();
    }

    if (deltaX < 0 && root.classList.contains("tablet-sidebar-expanded")) {
      closeTabletSidebar();
    }
  }

  resetTabletSwipe();
}, { passive: true });

sidebarBackdrop?.addEventListener("click", () => {
  if (isTabletSidebarRange()) {
    closeTabletSidebar();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isTabletSidebarRange()) {
    closeTabletSidebar();
  }
});

window.addEventListener("resize", syncTabletSidebarState);

syncTabletSidebarState();


/* ===== SAFE ROLE-BASED ACCESS: SIDEBAR + BASIC UI ONLY ===== */
/* Small first step only:
   - Reads logged-in user from localStorage
   - Hides sidebar entries by role
   - Hides Add Order tab when role is view-only
   - Does not touch Orders/Production core logic files */
(function initSafeRoleBasedAccess() {
  const roleProfiles = {
    admin: {
      label: "Admin",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview", "orders", "production-status", "production", "deliveries", "materials", "reports", "settings"],
      canAddOrder: true
    },
    manager: {
      label: "Manager",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview", "orders", "production-status", "production", "deliveries", "materials", "reports"],
      canAddOrder: false
    },
    supervisor: {
      label: "Supervisor",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview", "production-status", "production", "reports"],
      canAddOrder: false
    },
    logistics: {
      label: "Logistic",
      defaultSelector: '[data-view-target="orders"]',
      views: ["overview", "orders", "deliveries", "materials"],
      canAddOrder: true
    },
    production_staff: {
      label: "Production Staff",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview", "production-status", "production"],
      canAddOrder: false
    },
    lockkey_production: {
      label: "Lockkey Production",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview", "production-status", "production"],
      canAddOrder: false
    },
    happy_production: {
      label: "Happy Production",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview", "production-status", "production"],
      canAddOrder: false
    },
    viewer: {
      label: "Viewer",
      defaultSelector: '[data-view-target="overview"]',
      views: ["overview"],
      canAddOrder: false
    }
  };

  const legacyRoleMap = {
    boss: "manager",
    order_staff: "logistics",
    delivery_staff: "logistics",
    logistic: "logistics",
    lockkey: "lockkey_production",
    happy: "happy_production"
  };

  function parseStoredUser(value) {
    if (!value) return null;

    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") return { username: parsed };
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      return { username: String(value) };
    }

    return null;
  }

  function getLoggedInUser() {
    const keys = ["currentUser", "loggedInUser", "activeUser", "user"];

    for (const key of keys) {
      const user = parseStoredUser(localStorage.getItem(key));
      if (user?.username || user?.name || user?.role) return user;
    }

    const username = localStorage.getItem("username");
    if (username) return { username };

    return null;
  }

  function normalizeRole(user) {
    const rawRole = String(user?.role || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
    const role = legacyRoleMap[rawRole] || rawRole;
    const username = String(user?.username || user?.name || "").trim().toLowerCase();

    if (roleProfiles[role]) return role;
    if (username === "admin") return "admin";
    if (username === "boss" || username === "manager") return "manager";
    if (username === "logistics" || username === "logistic" || username === "orders" || username === "order_staff" || username === "delivery" || username === "delivery_staff") return "logistics";
    if (username === "lockkey" || username === "lockkey_production") return "lockkey_production";
    if (username === "happy" || username === "happy_production") return "happy_production";
    if (username === "production" || username === "production_staff") return "production_staff";
    if (username === "supervisor") return "supervisor";
    if (username === "viewer") return "viewer";

    return "viewer";
  }

  function getCurrentProfile() {
    const user = getLoggedInUser();
    const role = normalizeRole(user);
    return {
      user,
      role,
      ...(roleProfiles[role] || roleProfiles.admin)
    };
  }

  function setElementVisible(element, isVisible) {
    if (!element) return;

    element.hidden = !isVisible;
    element.style.display = isVisible ? "" : "none";
    element.setAttribute("aria-hidden", isVisible ? "false" : "true");

    if (!isVisible) {
      element.classList.remove("active", "is-active", "is-open");
    }
  }

  function updateUserLabels(profile) {
    const usernameLabel = profile.user?.username || profile.user?.name || profile.label || "User";

    if (typeof replaceIconText === "function") {
      replaceIconText(getTopbarUserElement?.(), '[data-icon="user"]', usernameLabel);
    } else {
      const userElement = document.querySelector(".topbar-actions [data-icon='user']")?.parentElement;
      if (userElement) userElement.textContent = usernameLabel;
    }

    if (mobilePanelUser) {
      mobilePanelUser.textContent = usernameLabel;
    }
  }

  function applySidebarAccess(profile) {
    const allowed = new Set(profile.views || []);

    setElementVisible(document.querySelector('[data-view-target="overview"]'), allowed.has("overview"));
    setElementVisible(document.querySelector('[data-view-target="orders"]'), allowed.has("orders"));
    setElementVisible(document.querySelector('[data-view-target="deliveries"]'), allowed.has("deliveries"));
    setElementVisible(document.querySelector('[data-production-status-link]'), allowed.has("production-status"));
    setElementVisible(document.querySelector('[data-production-nav-group]'), allowed.has("production"));
    setElementVisible(document.querySelector('[data-view-target="reports"]'), allowed.has("reports"));
    setElementVisible(document.querySelector('[data-view-target="settings"]'), allowed.has("settings"));

    document.documentElement.dataset.userRole = profile.role;
    document.body.dataset.userRole = profile.role;
  }

  function applyOrdersBasicAccess(profile) {
    const addTab = document.querySelector('[data-orders-tab="add"]');
    const listTab = document.querySelector('[data-orders-tab="list"]');
    const addPanel = document.querySelector('[data-orders-panel="add"]');
    const listPanel = document.querySelector('[data-orders-panel="list"]');
    const addForm = document.getElementById("addOrderForm");

    const canAddOrder = Boolean(profile.canAddOrder);

    setElementVisible(addTab, canAddOrder);
    setElementVisible(addPanel, canAddOrder);

    if (!canAddOrder) {
      listTab?.classList.add("active");
      listTab?.setAttribute("aria-selected", "true");
      listPanel?.classList.add("active");
      addTab?.classList.remove("active");
      addTab?.setAttribute("aria-selected", "false");
      addPanel?.classList.remove("active");
      addForm?.setAttribute("aria-hidden", "true");
    }
  }

  function activateDefaultViewIfNeeded(profile) {
    const activeNav = document.querySelector(".side-nav .nav-item.active, .side-nav .production-nav-parent.active");
    const activeNavHidden = activeNav?.hidden || activeNav?.style.display === "none";

    if (!activeNavHidden && activeNav) return;

    const defaultControl = document.querySelector(profile.defaultSelector);
    if (!defaultControl) return;

    window.setTimeout(() => {
      defaultControl.click();
    }, 80);
  }

  function blockHiddenNavigationClicks() {
    document.addEventListener("click", (event) => {
      const hiddenNav = event.target.closest("[hidden]");
      if (!hiddenNav) return;

      event.preventDefault();
      event.stopPropagation();

      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function applyRoleAccess() {
    const profile = getCurrentProfile();

    updateUserLabels(profile);
    applySidebarAccess(profile);
    applyOrdersBasicAccess(profile);
    activateDefaultViewIfNeeded(profile);
  }

  blockHiddenNavigationClicks();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRoleAccess);
  } else {
    applyRoleAccess();
  }

  window.addEventListener("load", () => {
    window.setTimeout(applyRoleAccess, 120);
  });
})();

/* ===== LIVE POLLING + DEFAULT POSITION RESET + BROWSER TAB COUNTER ===== */
(function initDashboardLivePollingAndPositionReset() {
  const FAST_POLL_MS = 7000;
  const SLOW_POLL_MS = 14000;
  const baseTitle = document.title.replace(/^\(\d+\)\s*/, "") || "SwiftDash Dashboard";
  let lastTitleCount = -1;

  function isDashboardInteractionBlockingAutoRefresh() {
    if (document.hidden) return true;

    const blockingSelectors = [
      ".logout-confirm-backdrop.show",
      ".overview-modal-backdrop.show",
      ".orders-details-modal-backdrop.show",
      ".pr-modal-backdrop.show",
      "#productionTakeOrderModal.show",
      "#productionMoveStageModal.show",
      "#productionReceivingDateModal.show"
    ];

    if (blockingSelectors.some((selector) => document.querySelector(selector))) return true;

    const activeElement = document.activeElement;
    if (!activeElement) return false;

    return Boolean(activeElement.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function dispatchDashboardEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function runFastLivePoll() {
    checkDashboardActiveSession();

    if (isDashboardInteractionBlockingAutoRefresh()) return;

    dispatchDashboardEvent("system:notifications-refresh", { source: "live-poll", intervalMs: FAST_POLL_MS });
    dispatchDashboardEvent("system:orders-live-refresh", { source: "live-poll", intervalMs: FAST_POLL_MS });
    dispatchDashboardEvent("system:production-live-refresh", { source: "live-poll", intervalMs: FAST_POLL_MS });
  }

  function runSlowLivePoll() {
    if (isDashboardInteractionBlockingAutoRefresh()) return;

    dispatchDashboardEvent("system:overview-refresh", { source: "live-poll", intervalMs: SLOW_POLL_MS });
    dispatchDashboardEvent("system:reports-live-refresh", { source: "live-poll", intervalMs: SLOW_POLL_MS });
    dispatchDashboardEvent("system:settings-live-refresh", { source: "live-poll", intervalMs: SLOW_POLL_MS });
  }

  function resetScrollableArea(element) {
    if (!element) return;

    try {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    } catch (error) {
      // Non-scrollable elements are safe to ignore.
    }
  }

  function resetDashboardDefaultPosition() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const selectors = [
      ".main",
      ".view-section.active-view",
      ".table-wrap",
      ".orders-list",
      ".orders-data-list",
      "#ordersList",
      ".reports-log-list",
      "#reportsLogList",
      ".settings-user-list",
      "#settingsUserList",
      ".pr-list",
      "#productionReceivingList",
      ".overview-modal-body",
      ".pending-orders-list",
      ".delivery-alert-list",
      ".total-orders-modal-list"
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach(resetScrollableArea);
    });
  }

  function scheduleDefaultPositionReset() {
    window.requestAnimationFrame(() => {
      resetDashboardDefaultPosition();
      window.setTimeout(resetDashboardDefaultPosition, 80);
    });
  }

  function readBadgeCount(badge) {
    if (!badge || badge.hidden || badge.closest?.("[hidden]") || getComputedStyle(badge).display === "none") return 0;

    const text = String(badge.textContent || "").trim();
    if (!text) return 0;
    if (text.includes("99+")) return 99;

    const number = Number(text.replace(/[^\d]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function sumSidebarBadgeCounts() {
    const sidebarElement = document.querySelector(".sidebar");
    if (!sidebarElement) return 0;

    const badgeSelectors = [
      '[data-notification-badge]',
      '.production-status-sidebar-badge',
      '[data-production-status-notification]'
    ];
    const countedBadges = new Set();
    let totalCount = 0;

    badgeSelectors.forEach((selector) => {
      sidebarElement.querySelectorAll(selector).forEach((badge) => {
        if (countedBadges.has(badge)) return;
        countedBadges.add(badge);
        totalCount += readBadgeCount(badge);
      });
    });

    return totalCount;
  }

  function getCurrentNotificationCount() {
    return sumSidebarBadgeCounts();
  }

  function updateBrowserTitleCounter() {
    const count = getCurrentNotificationCount();
    if (count === lastTitleCount) return;

    lastTitleCount = count;
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${baseTitle}` : baseTitle;
  }

  const navigationResetSelector = [
    "[data-view-target]",
    "[data-production-status-link]",
    "[data-production-nav-toggle]",
    "[data-production-stage-link]",
    "[data-orders-tab]",
    "[data-pr-tab]"
  ].join(",");

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(navigationResetSelector)) return;
    scheduleDefaultPositionReset();
  }, true);

  document.addEventListener("system:reset-default-position", scheduleDefaultPositionReset);
  document.addEventListener("system:notifications-refresh", () => window.setTimeout(updateBrowserTitleCounter, 700));
  document.addEventListener("system:notifications-updated", updateBrowserTitleCounter);
  document.addEventListener("system:orders-list-rendered", updateBrowserTitleCounter);
  document.addEventListener("system:production-records-updated", updateBrowserTitleCounter);

  if ("MutationObserver" in window) {
    const titleObserver = new MutationObserver(() => updateBrowserTitleCounter());
    titleObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style"]
    });
  }

  window.addEventListener("load", () => {
    scheduleDefaultPositionReset();
    updateBrowserTitleCounter();
    window.setTimeout(checkDashboardActiveSession, 600);
    window.setTimeout(runFastLivePoll, 1200);
    window.setTimeout(runSlowLivePoll, 1800);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkDashboardActiveSession();
      runFastLivePoll();
      runSlowLivePoll();
      updateBrowserTitleCounter();
    }
  });

  window.setInterval(runFastLivePoll, FAST_POLL_MS);
  window.setInterval(runSlowLivePoll, SLOW_POLL_MS);
})();

