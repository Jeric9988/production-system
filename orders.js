/* ===== ORDERS TAB ONLY - SQLITE REAL DATA START ===== */

const viewLinks = document.querySelectorAll("[data-view-target]");
const viewSections = document.querySelectorAll("[data-view]");
const orderForm = document.getElementById("addOrderForm");
const orderClearButtons = document.querySelectorAll(".orders-clear-btn");
const selectedDeliveryDateInput = document.getElementById("selectedDeliveryDate");
const topbarPageTitle = document.querySelector(".topbar h1");
const ordersList = document.getElementById("ordersList");
const ordersFeedback = document.getElementById("ordersFeedback");
const ordersSearchInput = document.getElementById("ordersSearchInput");
const ordersRefreshBtn = document.getElementById("ordersRefreshBtn");
const ordersFolderShell = document.querySelector(".orders-folder-shell");
const ordersFolderTabs = document.querySelectorAll("[data-orders-tab]");
const ordersTabPanels = document.querySelectorAll("[data-orders-panel]");
const ordersListTab = document.querySelector('[data-orders-tab="list"]');

const ORDERS_API_BASE = "/api/orders";
const ORDERS_ASSIGNABLE_USERS_API_URL = "/api/users/production-assignees";
const ordersPhilippinesTimeZone = "Asia/Manila";

const ordersPhilippinesDateFormatter = {
  monthYear: new Intl.DateTimeFormat("en-US", {
    timeZone: ordersPhilippinesTimeZone,
    month: "long",
    year: "numeric"
  }),
  parts: new Intl.DateTimeFormat("en-US", {
    timeZone: ordersPhilippinesTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
};

function getOrdersPhilippinesDateParts(date = new Date()) {
  const parts = ordersPhilippinesDateFormatter.parts.formatToParts(date);
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

function formatOrdersDateValue(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function escapeOrdersHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatOrdersDateForDisplay(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatOrdersDateTimeForDisplay(value) {
  if (!value) return "—";

  const rawDate = String(value).trim();
  const dateMatch = rawDate.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return formatOrdersDateForDisplay(`${year}-${month}-${day}`);
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return rawDate;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

const todayPhilippinesDate = getOrdersPhilippinesDateParts();
let activeOrdersCalendarYear = todayPhilippinesDate.year;
let activeOrdersCalendarMonth = todayPhilippinesDate.month;
let selectedOrdersDeliveryDate = formatOrdersDateValue(
  todayPhilippinesDate.year,
  todayPhilippinesDate.month,
  todayPhilippinesDate.day
);
let ordersSearchDebounceTimer;
let latestOrdersData = [];
let activeOrderModalRecord = null;
let activeOrderModalMode = "view";
let ordersAssignableUsers = [];
let ordersAssignableUsersLoaded = false;
let latestOrdersListSignature = "";

function createOrdersListSignature(orders = []) {
  if (!Array.isArray(orders)) return "[]";

  return JSON.stringify(orders.map((order) => ({
    id: order?.id ?? "",
    joNumber: order?.joNumber ?? "",
    poNumber: order?.poNumber ?? "",
    orderStatus: order?.orderStatus ?? order?.status ?? "",
    assignTo: order?.assignTo ?? "",
    assignToRole: order?.assignToRole ?? order?.assign_to_role ?? "",
    updatedAt: order?.updatedAt ?? "",
    createdAt: order?.createdAt ?? ""
  })));
}

function preserveOrdersListScroll(callback) {
  if (!ordersList || typeof callback !== "function") return callback?.();

  const top = ordersList.scrollTop;
  const left = ordersList.scrollLeft;
  const result = callback();

  ordersList.scrollTop = top;
  ordersList.scrollLeft = left;

  return result;
}

function ensureOrdersListTabCounter() {
  if (!ordersListTab) return null;

  ordersListTab
    .querySelectorAll('[data-notification-tab-badge="orders"], .notification-tab-badge')
    .forEach((badge) => badge.remove());

  let counter = ordersListTab.querySelector('[data-orders-tab-count="list"]');
  if (counter) return counter;

  counter = document.createElement("span");
  counter.className = "orders-tab-count";
  counter.setAttribute("data-orders-tab-count", "list");
  counter.setAttribute("aria-label", "Order list count");
  counter.textContent = "0";
  ordersListTab.appendChild(counter);
  ordersListTab.classList.add("orders-folder-tab-has-count");

  return counter;
}

function updateOrdersListTabCounter(count = 0) {
  const counter = ensureOrdersListTabCounter();
  if (!counter) return;

  const safeCount = Math.max(0, Number(count || 0));
  counter.textContent = safeCount > 999 ? "999+" : String(safeCount);
  counter.title = `${safeCount} order${safeCount === 1 ? "" : "s"} in list`;
}

ensureOrdersListTabCounter();

const ordersRequiredFieldRules = [
  { name: "poNumber", label: "P.O. Number" },
  { name: "joNumber", label: "J.O. Number" },
  { name: "client", label: "Client" },
  { name: "item", label: "Item" },
  { name: "quantity", label: "Quantity" },
  { name: "unit", label: "Unit" },
  { name: "assignTo", label: "Assigned To" }
];

function getViewTitle(viewName) {
  const activeLink = document.querySelector(`[data-view-target="${viewName}"]`);
  const label = activeLink?.querySelector(":scope > span:not(.nav-icon):not(.notification-nav-badge)");
  const title = label?.textContent?.trim();

  return title || viewName.charAt(0).toUpperCase() + viewName.slice(1);
}

function updateTopbarTitle(viewName) {
  if (topbarPageTitle) topbarPageTitle.textContent = getViewTitle(viewName);
}

function showView(viewName) {
  viewSections.forEach((section) => {
    section.classList.toggle("active-view", section.dataset.view === viewName);
  });

  viewLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.viewTarget === viewName);
  });

  updateTopbarTitle(viewName);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.dispatchEvent(new CustomEvent("system:reset-default-position"));

  if (viewName === "orders") {
    ensureOrdersCalendarVisible();
    loadOrdersAssignableUsers({ force: true });
    loadOrdersFromDatabase();
  }
}

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const target = link.dataset.viewTarget;
    if (!target) return;

    showView(target);

    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById("sidebar");
      const sidebarBackdrop = document.getElementById("sidebarBackdrop");

      sidebar?.classList.remove("open");
      sidebarBackdrop?.classList.remove("show");
      document.body.classList.remove("mobile-menu-open");
      document.documentElement.classList.remove("mobile-menu-open");
    }
  });
});

function buildOrdersDeliveryCalendar() {
  const miniCalendar = document.querySelector(".orders-view .mini-calendar");
  if (!miniCalendar) return;

  const monthTitle = miniCalendar.querySelector(".mini-calendar-head strong");
  const datesGrid = miniCalendar.querySelector(".mini-dates");
  if (!monthTitle || !datesGrid) return;

  monthTitle.textContent = ordersPhilippinesDateFormatter.monthYear.format(
    new Date(activeOrdersCalendarYear, activeOrdersCalendarMonth, 1)
  );

  datesGrid.innerHTML = "";

  const firstDay = new Date(activeOrdersCalendarYear, activeOrdersCalendarMonth, 1);
  const startDay = firstDay.getDay();
  const lastDate = new Date(activeOrdersCalendarYear, activeOrdersCalendarMonth + 1, 0).getDate();
  const previousLastDate = new Date(activeOrdersCalendarYear, activeOrdersCalendarMonth, 0).getDate();

  for (let cellIndex = 0; cellIndex < 42; cellIndex++) {
    const dateCell = document.createElement("span");

    let dayNumber;
    let dateYear = activeOrdersCalendarYear;
    let dateMonth = activeOrdersCalendarMonth;
    let isMuted = false;

    if (cellIndex < startDay) {
      dayNumber = previousLastDate - startDay + cellIndex + 1;
      dateMonth -= 1;
      if (dateMonth < 0) {
        dateMonth = 11;
        dateYear -= 1;
      }
      isMuted = true;
    } else if (cellIndex >= startDay + lastDate) {
      dayNumber = cellIndex - (startDay + lastDate) + 1;
      dateMonth += 1;
      if (dateMonth > 11) {
        dateMonth = 0;
        dateYear += 1;
      }
      isMuted = true;
    } else {
      dayNumber = cellIndex - startDay + 1;
    }

    const dateValue = formatOrdersDateValue(dateYear, dateMonth, dayNumber);
    dateCell.textContent = dayNumber;
    dateCell.dataset.dateValue = dateValue;

    if (isMuted) dateCell.classList.add("muted");
    if (dateValue === selectedOrdersDeliveryDate) dateCell.classList.add("selected");

    dateCell.addEventListener("click", () => {
      selectedOrdersDeliveryDate = dateValue;
      if (selectedDeliveryDateInput) selectedDeliveryDateInput.value = selectedOrdersDeliveryDate;
      activeOrdersCalendarYear = dateYear;
      activeOrdersCalendarMonth = dateMonth;
      buildOrdersDeliveryCalendar();
    });

    datesGrid.appendChild(dateCell);
  }
}

function setupOrdersCalendarControls() {
  const miniCalendar = document.querySelector(".orders-view .mini-calendar");
  if (!miniCalendar) return;

  const prevButton = miniCalendar.querySelector(".mini-calendar-head button:first-child");
  const nextButton = miniCalendar.querySelector(".mini-calendar-head button:last-child");

  prevButton?.addEventListener("click", () => {
    activeOrdersCalendarMonth -= 1;
    if (activeOrdersCalendarMonth < 0) {
      activeOrdersCalendarMonth = 11;
      activeOrdersCalendarYear -= 1;
    }
    buildOrdersDeliveryCalendar();
  });

  nextButton?.addEventListener("click", () => {
    activeOrdersCalendarMonth += 1;
    if (activeOrdersCalendarMonth > 11) {
      activeOrdersCalendarMonth = 0;
      activeOrdersCalendarYear += 1;
    }
    buildOrdersDeliveryCalendar();
  });
}

function ensureOrdersCalendarVisible() {
  const datesGrid = document.querySelector(".orders-view .mini-dates");
  if (!datesGrid) return;

  if (!datesGrid.children.length) {
    buildOrdersDeliveryCalendar();
  }
}

function resetOrdersDeliveryDateToToday() {
  const today = getOrdersPhilippinesDateParts();

  activeOrdersCalendarYear = today.year;
  activeOrdersCalendarMonth = today.month;
  selectedOrdersDeliveryDate = formatOrdersDateValue(today.year, today.month, today.day);

  if (selectedDeliveryDateInput) selectedDeliveryDateInput.value = selectedOrdersDeliveryDate;

  buildOrdersDeliveryCalendar();
}

function scrollOrdersViewToTop() {
  const ordersView = document.querySelector(".orders-view");
  const topOffset = window.innerWidth <= 768 ? 76 : 0;
  const top = ordersView
    ? window.pageYOffset + ordersView.getBoundingClientRect().top - topOffset
    : 0;

  window.scrollTo({
    top: Math.max(top, 0),
    left: 0,
    behavior: "auto"
  });

  document.querySelectorAll("#ordersList, .orders-list, .orders-data-list, .table-wrap").forEach((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
}

function setOrdersActiveTab(tabName = "add", options = {}) {
  const safeTabName = tabName === "list" ? "list" : "add";
  const shouldScroll = options.scroll === true;

  ordersFolderTabs.forEach((tab) => {
    const isActive = tab.dataset.ordersTab === safeTabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  ordersTabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.ordersPanel === safeTabName);
  });

  ordersFolderShell?.classList.toggle("active-tab-first", safeTabName === "add");
  ordersFolderShell?.classList.toggle("active-tab-last", safeTabName === "list");

  if (safeTabName === "list") {
    loadOrdersFromDatabase();
  }

  if (shouldScroll) {
    window.requestAnimationFrame(scrollOrdersViewToTop);
  }
}

function setOrdersFeedback(message = "", type = "") {
  /* Global Orders List messages are intentionally hidden.
     Field-level validation alerts still appear beside the related textbox/select. */
  if (!ordersFeedback) return;

  ordersFeedback.textContent = "";
  ordersFeedback.className = "orders-feedback";
}

function getOrdersJoInput() {
  return getOrdersInput("joNumber");
}

function getOrdersJoField() {
  return getOrdersJoInput()?.closest?.(".form-field") || null;
}

function clearOrdersJoDuplicateError() {
  const joField = getOrdersJoField();
  const joInput = getOrdersJoInput();

  joField?.classList.remove("has-po-error");
  joField?.querySelectorAll(".orders-po-error").forEach((error) => error.remove());

  joInput?.removeAttribute("aria-invalid");
  joInput?.removeAttribute("aria-describedby");
}

function showOrdersJoDuplicateError(message = "J.O. Number already exists.") {
  const joField = getOrdersJoField();
  const joInput = getOrdersJoInput();

  if (!joField) return;

  clearOrdersJoDuplicateError();

  const errorId = "ordersJoDuplicateError";
  const errorBox = document.createElement("div");
  errorBox.className = "orders-po-error";
  errorBox.id = errorId;
  errorBox.setAttribute("role", "alert");
  errorBox.innerHTML = `
    <span class="orders-po-error-icon">!</span>
    <span>${escapeOrdersHTML(message)}</span>
  `;

  joField.classList.add("has-po-error");
  joField.appendChild(errorBox);

  joInput?.setAttribute("aria-invalid", "true");
  joInput?.setAttribute("aria-describedby", errorId);
}

async function checkOrdersJoDuplicateFromDatabase() {
  const joInput = getOrdersJoInput();
  const joNumber = String(joInput?.value || "").trim();

  clearOrdersJoDuplicateError();

  if (!joNumber) return false;

  const query = new URLSearchParams({ joNumber }).toString();
  const data = await requestOrdersApi(`${ORDERS_API_BASE}/check-jo?${query}`);

  if (data.exists) {
    showOrdersJoDuplicateError("J.O. Number already exists.");
    return true;
  }

  return false;
}

function getOrdersInput(fieldName) {
  const controls = orderForm?.elements;
  if (!controls) return null;

  const field = typeof controls.namedItem === "function"
    ? controls.namedItem(fieldName)
    : controls[fieldName];

  if (!field) return null;

  if (typeof field.removeAttribute === "function") {
    return field;
  }

  if (typeof field.item === "function") {
    return field.item(0);
  }

  if (field[0]) {
    return field[0];
  }

  return null;
}

function focusOrdersField(fieldName) {
  const input = getOrdersInput(fieldName);

  if (input && typeof input.focus === "function") {
    input.focus();
  }
}

function getOrdersField(fieldName) {
  return getOrdersInput(fieldName)?.closest?.(".form-field") || null;
}

function getOrdersRequiredFieldError(rule) {
  const input = getOrdersInput(rule.name);
  const value = String(input?.value ?? "").trim();

  if (!value) {
    return {
      ...rule,
      message: `${rule.label} is required.`
    };
  }

  if (rule.name === "quantity") {
    const quantityValue = Number(value);

    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      return {
        ...rule,
        message: "Quantity must be greater than zero."
      };
    }
  }

  return null;
}

function clearOrdersRequiredFieldError(fieldName) {
  const field = getOrdersField(fieldName);
  const input = getOrdersInput(fieldName);

  field?.classList.remove("has-field-error");
  field?.querySelectorAll(".orders-field-error").forEach((error) => error.remove());

  input?.removeAttribute("aria-invalid");
  input?.removeAttribute("aria-describedby");
}

function clearOrdersRequiredFieldErrors() {
  ordersRequiredFieldRules.forEach((rule) => clearOrdersRequiredFieldError(rule.name));
}

function clearOrdersAddOrderValidationState() {
  clearOrdersJoDuplicateError();
  clearOrdersRequiredFieldErrors();
  setOrdersFeedback();
}

function showOrdersRequiredFieldError(fieldName, message) {
  const field = getOrdersField(fieldName);
  const input = getOrdersInput(fieldName);

  if (!field) return;

  clearOrdersRequiredFieldError(fieldName);

  const errorId = `orders-${fieldName}-required-error`;
  const errorBox = document.createElement("div");
  errorBox.className = "orders-field-error";
  errorBox.id = errorId;
  errorBox.setAttribute("role", "alert");
  errorBox.innerHTML = `
    <span class="orders-field-error-icon">!</span>
    <span>${escapeOrdersHTML(message)}</span>
  `;

  field.classList.add("has-field-error");
  field.appendChild(errorBox);

  input?.setAttribute("aria-invalid", "true");
  input?.setAttribute("aria-describedby", errorId);
}

function validateOrdersRequiredField(rule) {
  const error = getOrdersRequiredFieldError(rule);

  if (!error) {
    clearOrdersRequiredFieldError(rule.name);
    return null;
  }

  showOrdersRequiredFieldError(error.name, error.message);
  return error;
}

function validateOrdersRequiredFields() {
  clearOrdersRequiredFieldErrors();

  const errors = ordersRequiredFieldRules
    .map((rule) => validateOrdersRequiredField(rule))
    .filter(Boolean);

  if (!errors.length) return true;

  const firstError = errors[0];
  setOrdersFeedback(`Check the ${firstError.label} field.`, "error");
  focusOrdersField(firstError.name);

  return false;
}

function setOrdersLoading(isLoading) {
  const submitButton = orderForm?.querySelector(".orders-primary-btn");
  if (!submitButton) return;

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Saving Order..." : "Save Order";
}

function getOrdersStoredUser() {
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

function getOrdersAuthHeaders() {
  const user = getOrdersStoredUser();
  const token = localStorage.getItem("dashboardAuthToken") || "";

  return {
    "Content-Type": "application/json",
    "X-User-Id": user?.username || "",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function renderOrdersAssignToOptions(selectedValue = "") {
  const selectedUsername = String(selectedValue || "").trim();
  const safeSelected = selectedUsername.toLowerCase();
  const hasSelectedInList = ordersAssignableUsers.some((user) => String(user.username || "").toLowerCase() === safeSelected);
  const options = ['<option value="">Select production user</option>'];

  if (selectedUsername && !hasSelectedInList) {
    options.push(`<option value="${escapeOrdersHTML(selectedUsername)}" selected>${escapeOrdersHTML(selectedUsername)}</option>`);
  }

  ordersAssignableUsers.forEach((user) => {
    const username = String(user.username || "").trim();
    if (!username) return;

    const isSelected = username.toLowerCase() === safeSelected;
    options.push(`<option value="${escapeOrdersHTML(username)}"${isSelected ? " selected" : ""}>${escapeOrdersHTML(username)}</option>`);
  });

  if (!ordersAssignableUsers.length && !selectedUsername) {
    options[0] = `<option value="">${ordersAssignableUsersLoaded ? "No production users found" : "Loading production users..."}</option>`;
  }

  return options.join("");
}

function applyOrdersAssignToOptions(select, selectedValue = "") {
  if (!select) return;

  const currentValue = String(selectedValue || select.value || "").trim();
  select.innerHTML = renderOrdersAssignToOptions(currentValue);
  if (currentValue) select.value = currentValue;
}

function refreshOrdersAssignToSelects() {
  document.querySelectorAll('select[name="assignTo"]').forEach((select) => {
    applyOrdersAssignToOptions(select, select.value);
  });
}

async function loadOrdersAssignableUsers({ force = false } = {}) {
  if (ordersAssignableUsersLoaded && !force) {
    refreshOrdersAssignToSelects();
    return ordersAssignableUsers;
  }

  try {
    const data = await requestOrdersApi(ORDERS_ASSIGNABLE_USERS_API_URL);
    ordersAssignableUsers = Array.isArray(data?.users) ? data.users : [];
    ordersAssignableUsersLoaded = true;
    refreshOrdersAssignToSelects();
    return ordersAssignableUsers;
  } catch (error) {
    ordersAssignableUsersLoaded = true;
    ordersAssignableUsers = [];
    refreshOrdersAssignToSelects();
    return [];
  }
}

async function requestOrdersApi(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      ...getOrdersAuthHeaders(),
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
    const message = data?.error || "Request failed.";
    const apiError = new Error(message);
    apiError.status = response.status;
    apiError.field = data?.field || "";
    apiError.code = data?.code || "";
    throw apiError;
  }

  return data;
}

function createOrderPayloadFromForm() {
  const formData = new FormData(orderForm);
  const values = Object.fromEntries(formData.entries());

  return {
    joNumber: values.joNumber?.trim(),
    poNumber: values.poNumber?.trim(),
    client: values.client?.trim(),
    item: values.item?.trim(),
    quantity: Number(values.quantity),
    unit: values.unit,
    printingMaterial: values.printingMaterial?.trim() || null,
    laminationMaterial: values.laminationMaterial?.trim() || null,
    assignTo: values.assignTo || null,
    deliveryDate: values.deliveryDate
  };
}

function renderOrdersEmptyState(title = "No orders found", description = "Saved orders will appear here.") {
  if (!ordersList) return;

  ordersList.innerHTML = `
    <div class="orders-empty-state">
      <strong>${escapeOrdersHTML(title)}</strong>
      <span>${escapeOrdersHTML(description)}</span>
    </div>
  `;
}

function parseOrdersRecentTimestamp(value) {
  if (!value) return 0;

  const rawValue = String(value).trim();
  if (!rawValue) return 0;

  const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
  const parsedValue = new Date(normalizedValue).getTime();

  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function getOrdersRecentTimestamp(order) {
  const candidateValues = [
    order?.updatedAt,
    order?.updated_at,
    order?.createdAt,
    order?.created_at,
    order?.takenAt,
    order?.taken_at,
    order?.deliveryDate,
    order?.delivery_date
  ];

  for (const value of candidateValues) {
    const timestamp = parseOrdersRecentTimestamp(value);
    if (timestamp > 0) return timestamp;
  }

  const numericId = Number(order?.id || 0);
  return Number.isFinite(numericId) ? numericId : 0;
}

function sortOrdersRecentFirst(orders) {
  return [...orders].sort((firstOrder, secondOrder) => {
    const secondTimestamp = getOrdersRecentTimestamp(secondOrder);
    const firstTimestamp = getOrdersRecentTimestamp(firstOrder);

    if (secondTimestamp !== firstTimestamp) {
      return secondTimestamp - firstTimestamp;
    }

    return Number(secondOrder?.id || 0) - Number(firstOrder?.id || 0);
  });
}

function getOrdersTodayDateOnly() {
  const today = getOrdersPhilippinesDateParts();
  return new Date(today.year, today.month, today.day);
}

function parseOrdersDateOnly(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function getOrdersDeliveryAlert(order) {
  const deliveryDate = parseOrdersDateOnly(order.deliveryDate);
  if (!deliveryDate) {
    return {
      className: "",
      label: ""
    };
  }

  const today = getOrdersTodayDateOnly();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((deliveryDate - today) / millisecondsPerDay);

  if (daysLeft <= 0) {
    return {
      className: "delivery-danger",
      label: daysLeft === 0 ? "Due today" : "Overdue"
    };
  }

  if (daysLeft <= 5) {
    return {
      className: "delivery-warning",
      label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
    };
  }

  return {
    className: "",
    label: ""
  };
}


function formatOrdersStatusLabel(status) {
  const normalizedStatus = String(status || "pending").trim().toLowerCase();
  const labels = {
    pending: "Pending",
    production: "Production",
    delivery: "Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };

  return labels[normalizedStatus] || normalizedStatus.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderOrdersDetailsField(label, value, extraClass = "") {
  const safeValue = value === undefined || value === null || String(value).trim() === "" ? "—" : value;
  return `
    <div class="orders-details-field ${escapeOrdersHTML(extraClass)}"${extraClass.includes("wide") ? "" : ""}>
      <span>${escapeOrdersHTML(label)}</span>
      <strong>${escapeOrdersHTML(safeValue)}</strong>
    </div>
  `;
}

function getOrdersQuantityText(order) {
  return `${order?.quantity ?? "—"} ${order?.unit ?? ""}`.trim();
}

function isOrderLockedForEdit(order) {
  const status = String(order?.orderStatus || "pending").trim().toLowerCase();
  return status !== "pending";
}

function getOrderEditLockedMessage(order) {
  if (!isOrderLockedForEdit(order)) return "";

  const status = String(order?.orderStatus || "production").trim().toLowerCase();
  if (status === "production") {
    return "This order is already in Production and can no longer be edited.";
  }

  if (status === "delivery" || status === "delivered") {
    return "This order is already in the delivery process and can no longer be edited.";
  }

  return "This order can no longer be edited.";
}

function renderOrderCard(order) {
  const quantity = getOrdersQuantityText(order);
  const status = String(order.orderStatus || "pending").trim().toLowerCase();
  const statusLabel = formatOrdersStatusLabel(status);
  const deliveryAlert = getOrdersDeliveryAlert(order);

  return `
    <article class="orders-data-card ${escapeOrdersHTML(deliveryAlert.className)}" data-order-id="${escapeOrdersHTML(order.id)}">
      <div class="orders-data-card-head">
        <div>
          <h3>${escapeOrdersHTML(order.item || "Untitled Order")}</h3>
        </div>
        <span class="orders-status-pill status-${escapeOrdersHTML(status)}">${escapeOrdersHTML(statusLabel)}</span>
      </div>

      <div class="orders-data-grid">
        <div class="orders-data-field">
          <span>P.O. Number</span>
          <strong>${escapeOrdersHTML(order.poNumber || "—")}</strong>
        </div>
        <div class="orders-data-field">
          <span>J.O. Number</span>
          <strong>${escapeOrdersHTML(order.joNumber || "—")}</strong>
        </div>
        <div class="orders-data-field">
          <span>Client</span>
          <strong>${escapeOrdersHTML(order.client || "—")}</strong>
        </div>
        <div class="orders-data-field">
          <span>Quantity</span>
          <strong>${escapeOrdersHTML(quantity || "—")}</strong>
        </div>
        <div class="orders-data-field delivery-date-field">
          <span>Delivery Date</span>
          <strong>
            ${escapeOrdersHTML(formatOrdersDateForDisplay(order.deliveryDate))}
            ${deliveryAlert.label ? `<em class="orders-delivery-alert-label">${escapeOrdersHTML(deliveryAlert.label)}</em>` : ""}
          </strong>
        </div>
        <div class="orders-data-field">
          <span>Assigned To</span>
          <strong>${escapeOrdersHTML(order.assignTo || "—")}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderOrdersList(orders) {
  if (!ordersList) return;

  latestOrdersData = sortOrdersRecentFirst(Array.isArray(orders) ? orders : []);
  updateOrdersListTabCounter(latestOrdersData.length);

  if (!latestOrdersData.length) {
    if (ordersSearchInput?.value?.trim()) {
      renderOrdersEmptyState("No orders found", "Try a different P.O., J.O., client, or item keyword.");
    } else {
      renderOrdersEmptyState("No orders yet", "Saved orders will appear here.");
    }
    document.dispatchEvent(new CustomEvent("system:orders-list-rendered"));
    return;
  }

  ordersList.innerHTML = latestOrdersData.map(renderOrderCard).join("");

  document.dispatchEvent(new CustomEvent("system:orders-list-rendered"));
}

function getOrderById(orderId) {
  return latestOrdersData.find((order) => String(order.id) === String(orderId)) || null;
}

function createOrdersDetailsModal() {
  let modal = document.getElementById("ordersDetailsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "orders-details-modal-backdrop";
  modal.id = "ordersDetailsModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <section class="orders-details-modal" role="dialog" aria-modal="true" aria-labelledby="ordersDetailsModalTitle">
      <header class="orders-details-modal-head">
        <div>
          <span class="orders-details-eyebrow">Order Details</span>
          <h2 id="ordersDetailsModalTitle">Order Record</h2>
        </div>
        <button class="orders-details-close" type="button" aria-label="Close order details">
          <span>×</span>
        </button>
      </header>

      <div class="orders-details-modal-body" id="ordersDetailsModalBody"></div>

      <footer class="orders-details-modal-footer" id="ordersDetailsModalFooter"></footer>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".orders-details-close")?.addEventListener("click", closeOrdersDetailsModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) return;
  });

  return modal;
}

function openOrdersDetailsModal(orderId) {
  const record = getOrderById(orderId);
  if (!record) return;

  activeOrderModalRecord = record;
  activeOrderModalMode = "view";

  const modal = createOrdersDetailsModal();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("orders-details-modal-open");

  renderOrdersDetailsModal();
}

function closeOrdersDetailsModal() {
  const modal = document.getElementById("ordersDetailsModal");
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("orders-details-modal-open");

  activeOrderModalRecord = null;
  activeOrderModalMode = "view";
}

function renderOrdersDetailsModal() {
  if (!activeOrderModalRecord) return;

  if (activeOrderModalMode === "edit") {
    renderOrdersEditModal();
    return;
  }

  renderOrdersViewModal();
}

function renderOrdersViewModal() {
  const modal = createOrdersDetailsModal();
  const title = modal.querySelector("#ordersDetailsModalTitle");
  const body = modal.querySelector("#ordersDetailsModalBody");
  const footer = modal.querySelector("#ordersDetailsModalFooter");
  const order = activeOrderModalRecord;
  const quantity = getOrdersQuantityText(order);
  const deliveryAlert = getOrdersDeliveryAlert(order);
  const status = String(order.orderStatus || "pending").trim().toLowerCase();
  const statusLabel = formatOrdersStatusLabel(status);
  const isLockedForEdit = isOrderLockedForEdit(order);
  const lockedMessage = getOrderEditLockedMessage(order);

  if (title) title.textContent = "Order Details";

  if (body) {
    body.innerHTML = `
      <div class="orders-details-summary-card ${escapeOrdersHTML(deliveryAlert.className)}">
        <div class="orders-details-summary-main">
          <span class="orders-details-summary-label">J.O. Number</span>
          <strong>${escapeOrdersHTML(order.joNumber || "—")}</strong>
          <p>${escapeOrdersHTML(order.item || "—")}</p>
        </div>

        <div class="orders-details-summary-side">
          <span class="orders-status-pill status-${escapeOrdersHTML(status)}">${escapeOrdersHTML(statusLabel)}</span>
          ${deliveryAlert.label ? `<em class="orders-delivery-alert-label">${escapeOrdersHTML(deliveryAlert.label)}</em>` : ""}
        </div>
      </div>

      ${isLockedForEdit ? `<div class="orders-edit-form-alert">${escapeOrdersHTML(lockedMessage)}</div>` : ""}

      <section class="orders-details-section">
        <h3>Order Details</h3>
        <div class="orders-details-grid">
          ${renderOrdersDetailsField("Status", statusLabel)}
          ${renderOrdersDetailsField("P.O. Number", order.poNumber)}
          ${renderOrdersDetailsField("J.O. Number", order.joNumber)}
          ${renderOrdersDetailsField("Client", order.client)}
          ${renderOrdersDetailsField("Item", order.item, "wide")}
          ${renderOrdersDetailsField("Quantity", order.quantity)}
          ${renderOrdersDetailsField("Unit", order.unit)}
          ${renderOrdersDetailsField("Assigned To", order.assignTo)}
          ${renderOrdersDetailsField("Delivery Date", formatOrdersDateForDisplay(order.deliveryDate))}
          ${renderOrdersDetailsField("Date Created", formatOrdersDateTimeForDisplay(order.createdAt))}
        </div>
      </section>

      <section class="orders-details-section">
        <h3>Materials</h3>
        <div class="orders-details-grid">
          ${renderOrdersDetailsField("Printing Material", order.printingMaterial)}
          ${renderOrdersDetailsField("Lamination Material", order.laminationMaterial)}
        </div>
      </section>
    `;
  }

  if (footer) {
    footer.innerHTML = isLockedForEdit
      ? `<button class="orders-modal-secondary" type="button" data-orders-modal-action="cancel">Close</button>`
      : `
        <button class="orders-modal-secondary" type="button" data-orders-modal-action="cancel">Close</button>
        <button class="orders-modal-primary" type="button" data-orders-modal-action="edit">Edit Order</button>
      `;

    footer.querySelector('[data-orders-modal-action="cancel"]')?.addEventListener("click", closeOrdersDetailsModal);
    footer.querySelector('[data-orders-modal-action="edit"]')?.addEventListener("click", () => {
      if (isOrderLockedForEdit(activeOrderModalRecord)) {
        activeOrderModalMode = "view";
        renderOrdersDetailsModal();
        return;
      }

      activeOrderModalMode = "edit";
      renderOrdersDetailsModal();
    });
  }
}

function renderOrdersEditModal() {
  const modal = createOrdersDetailsModal();
  const title = modal.querySelector("#ordersDetailsModalTitle");
  const body = modal.querySelector("#ordersDetailsModalBody");
  const footer = modal.querySelector("#ordersDetailsModalFooter");
  const order = activeOrderModalRecord;

  if (isOrderLockedForEdit(order)) {
    activeOrderModalMode = "view";
    renderOrdersViewModal();
    return;
  }

  if (title) title.textContent = `Edit Order`;

  if (body) {
    body.innerHTML = `
      <form class="orders-edit-form" id="ordersEditForm" novalidate>
        <section class="orders-edit-section">
          <h3>Order Details</h3>
          <div class="orders-edit-grid">
            <label class="orders-edit-field">
              <span>P.O. Number</span>
              <input type="text" name="poNumber" value="${escapeOrdersHTML(order.poNumber || "")}">
            </label>

            <label class="orders-edit-field">
              <span>J.O. Number</span>
              <input type="text" name="joNumber" value="${escapeOrdersHTML(order.joNumber || "")}">
            </label>

            <label class="orders-edit-field wide">
              <span>Client</span>
              <input type="text" name="client" value="${escapeOrdersHTML(order.client || "")}">
            </label>

            <label class="orders-edit-field">
              <span>Quantity</span>
              <input type="number" name="quantity" min="1" value="${escapeOrdersHTML(order.quantity ?? "")}">
            </label>

            <label class="orders-edit-field">
              <span>Unit</span>
              <select name="unit">
                <option value="">Select unit</option>
                <option value="pcs" ${order.unit === "pcs" ? "selected" : ""}>pcs</option>
                <option value="kgs" ${order.unit === "kgs" ? "selected" : ""}>kgs</option>
                <option value="mts" ${order.unit === "mts" ? "selected" : ""}>mts</option>
              </select>
            </label>
          </div>
        </section>

        <section class="orders-edit-section">
          <h3>Materials</h3>
          <div class="orders-edit-grid">
            <label class="orders-edit-field wide">
              <span>Item</span>
              <input type="text" name="item" value="${escapeOrdersHTML(order.item || "")}">
            </label>

            <label class="orders-edit-field">
              <span>Printing Material</span>
              <input type="text" name="printingMaterial" value="${escapeOrdersHTML(order.printingMaterial || "")}">
            </label>

            <label class="orders-edit-field">
              <span>Lamination Material</span>
              <input type="text" name="laminationMaterial" value="${escapeOrdersHTML(order.laminationMaterial || "")}">
            </label>
          </div>
        </section>

        <section class="orders-edit-section">
          <h3>Schedule & Assignment</h3>
          <div class="orders-edit-grid">
            <label class="orders-edit-field">
              <span>Delivery Date</span>
              <input type="date" name="deliveryDate" value="${escapeOrdersHTML(order.deliveryDate || "")}">
            </label>

            <label class="orders-edit-field">
              <span>Assigned To</span>
              <select name="assignTo">
                ${renderOrdersAssignToOptions(order.assignTo)}
              </select>
            </label>
          </div>
        </section>
      </form>
    `;

    refreshOrdersAssignToSelects();

    body.querySelectorAll(".orders-edit-field input, .orders-edit-field select").forEach((input) => {
      input.addEventListener("input", () => clearOrdersEditFieldError(input.name));
      input.addEventListener("change", () => clearOrdersEditFieldError(input.name));
      input.addEventListener("blur", () => validateOrdersEditField(input.name));
    });
  }

  if (footer) {
    footer.innerHTML = `
      <button class="orders-modal-secondary" type="button" data-orders-modal-action="back">Cancel</button>
      <button class="orders-modal-primary" type="button" data-orders-modal-action="save">Save Changes</button>
    `;

    footer.querySelector('[data-orders-modal-action="back"]')?.addEventListener("click", () => {
      activeOrderModalMode = "view";
      renderOrdersDetailsModal();
    });

    footer.querySelector('[data-orders-modal-action="save"]')?.addEventListener("click", saveOrdersEditModal);
  }
}

function getOrdersEditForm() {
  return document.getElementById("ordersEditForm");
}

function getOrdersEditInput(fieldName) {
  const form = getOrdersEditForm();
  if (!form) return null;

  const field = typeof form.elements.namedItem === "function"
    ? form.elements.namedItem(fieldName)
    : form.elements[fieldName];

  if (!field) return null;
  if (typeof field.removeAttribute === "function") return field;
  if (typeof field.item === "function") return field.item(0);
  return field[0] || null;
}

function getOrdersEditField(fieldName) {
  return getOrdersEditInput(fieldName)?.closest?.(".orders-edit-field") || null;
}

function clearOrdersEditFieldError(fieldName) {
  const field = getOrdersEditField(fieldName);
  const input = getOrdersEditInput(fieldName);

  field?.classList.remove("has-edit-error");
  field?.querySelectorAll(".orders-edit-error").forEach((error) => error.remove());

  input?.removeAttribute("aria-invalid");
  input?.removeAttribute("aria-describedby");
}

function showOrdersEditFieldError(fieldName, message) {
  const field = getOrdersEditField(fieldName);
  const input = getOrdersEditInput(fieldName);

  if (!field) return;

  clearOrdersEditFieldError(fieldName);

  const errorId = `orders-edit-${fieldName}-error`;
  const errorBox = document.createElement("div");
  errorBox.className = "orders-edit-error";
  errorBox.id = errorId;
  errorBox.setAttribute("role", "alert");
  errorBox.innerHTML = `
    <span class="orders-edit-error-icon">!</span>
    <span>${escapeOrdersHTML(message)}</span>
  `;

  field.classList.add("has-edit-error");
  field.appendChild(errorBox);

  input?.setAttribute("aria-invalid", "true");
  input?.setAttribute("aria-describedby", errorId);
}

const ordersEditRequiredFieldRules = [
  { name: "poNumber", label: "P.O. Number" },
  { name: "joNumber", label: "J.O. Number" },
  { name: "client", label: "Client" },
  { name: "item", label: "Item" },
  { name: "quantity", label: "Quantity" },
  { name: "unit", label: "Unit" },
  { name: "deliveryDate", label: "Delivery Date" },
  { name: "assignTo", label: "Assigned To" }
];

function validateOrdersEditField(fieldName) {
  const rule = ordersEditRequiredFieldRules.find((item) => item.name === fieldName);
  if (!rule) return null;

  const input = getOrdersEditInput(fieldName);
  const value = String(input?.value ?? "").trim();

  if (!value) {
    const error = {
      ...rule,
      message: `${rule.label} is required.`
    };
    showOrdersEditFieldError(error.name, error.message);
    return error;
  }

  if (fieldName === "quantity") {
    const quantityValue = Number(value);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      const error = {
        ...rule,
        message: "Quantity must be greater than zero."
      };
      showOrdersEditFieldError(error.name, error.message);
      return error;
    }
  }

  clearOrdersEditFieldError(fieldName);
  return null;
}

function validateOrdersEditForm() {
  const errors = ordersEditRequiredFieldRules
    .map((rule) => validateOrdersEditField(rule.name))
    .filter(Boolean);

  if (!errors.length) return true;

  getOrdersEditInput(errors[0].name)?.focus();
  return false;
}

function createOrdersEditPayload() {
  const form = getOrdersEditForm();
  const formData = new FormData(form);
  const values = Object.fromEntries(formData.entries());

  return {
    joNumber: values.joNumber?.trim(),
    poNumber: values.poNumber?.trim(),
    client: values.client?.trim(),
    item: values.item?.trim(),
    quantity: Number(values.quantity),
    unit: values.unit,
    printingMaterial: values.printingMaterial?.trim() || null,
    laminationMaterial: values.laminationMaterial?.trim() || null,
    assignTo: values.assignTo || null,
    deliveryDate: values.deliveryDate
  };
}

async function checkOrdersJoDuplicateForEdit(joNumber) {
  const cleanJoNumber = String(joNumber || "").trim();
  if (!cleanJoNumber) return false;

  if (
    activeOrderModalRecord?.joNumber &&
    cleanJoNumber.toLowerCase() === String(activeOrderModalRecord.joNumber).trim().toLowerCase()
  ) {
    return false;
  }

  const query = new URLSearchParams({ joNumber: cleanJoNumber }).toString();
  const data = await requestOrdersApi(`${ORDERS_API_BASE}/check-jo?${query}`);
  return Boolean(data.exists);
}

async function saveOrdersEditModal() {
  if (!activeOrderModalRecord) return;

  if (isOrderLockedForEdit(activeOrderModalRecord)) {
    activeOrderModalMode = "view";
    renderOrdersDetailsModal();
    return;
  }

  if (!validateOrdersEditForm()) return;

  const saveButton = document.querySelector('[data-orders-modal-action="save"]');

  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving Changes...";
    }

    const payload = createOrdersEditPayload();
    const isDuplicateJo = await checkOrdersJoDuplicateForEdit(payload.joNumber);

    if (isDuplicateJo) {
      showOrdersEditFieldError("joNumber", "J.O. Number already exists.");
      getOrdersEditInput("joNumber")?.focus();
      return;
    }

    const data = await requestOrdersApi(`${ORDERS_API_BASE}/${activeOrderModalRecord.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    activeOrderModalRecord = data.order || {
      ...activeOrderModalRecord,
      ...payload
    };

    await loadOrdersFromDatabase();
    document.dispatchEvent(new CustomEvent("system:notifications-refresh"));

    activeOrderModalMode = "view";
    renderOrdersDetailsModal();
  } catch (error) {
    const message = error?.message || "Hindi na-save ang changes.";

    if (
      error?.field === "joNumber" ||
      error?.code === "DUPLICATE_JO_NUMBER" ||
      /J\.O\. Number already exists/i.test(message)
    ) {
      showOrdersEditFieldError("joNumber", "J.O. Number already exists.");
      getOrdersEditInput("joNumber")?.focus();
      return;
    }

    if (error?.code === "ORDER_LOCKED_IN_PRODUCTION" || error?.status === 409) {
      await loadOrdersFromDatabase();
      activeOrderModalRecord = getOrderById(activeOrderModalRecord.id) || {
        ...activeOrderModalRecord,
        orderStatus: "production"
      };
      activeOrderModalMode = "view";
      renderOrdersDetailsModal();
      return;
    }

    const body = document.getElementById("ordersDetailsModalBody");
    body?.insertAdjacentHTML(
      "afterbegin",
      `<div class="orders-edit-form-alert">${escapeOrdersHTML(message)}</div>`
    );
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Changes";
    }
  }
}

async function loadOrdersFromDatabase(options = {}) {
  if (!ordersList) return;

  const isSilent = options.silent === true;
  const forceRender = options.forceRender === true;

  try {
    const search = ordersSearchInput?.value?.trim() || "";
    const query = search ? `?search=${encodeURIComponent(search)}` : "";

    if (!isSilent) {
      ordersList.innerHTML = `<div class="orders-loading-state">Loading orders...</div>`;
    }

    const data = await requestOrdersApi(`${ORDERS_API_BASE}${query}`);
    const nextOrders = data.orders || [];
    const nextSignature = createOrdersListSignature(nextOrders);

    if (isSilent && !forceRender && nextSignature === latestOrdersListSignature) {
      setOrdersFeedback("", "");
      return;
    }

    latestOrdersListSignature = nextSignature;

    if (isSilent) {
      preserveOrdersListScroll(() => renderOrdersList(nextOrders));
    } else {
      renderOrdersList(nextOrders);
    }

    setOrdersFeedback("", "");
  } catch (error) {
    if (isSilent) {
      console.warn("Orders live refresh failed:", error.message);
      return;
    }

    updateOrdersListTabCounter(0);
    renderOrdersEmptyState("Unable to load orders", "Check if the backend server is running, then try again.");
    setOrdersFeedback(`${error.message} Check if the backend server is running.`, "error");
  }
}

orderClearButtons.forEach((button) => {
  button.addEventListener("click", () => {
    orderForm?.reset();
    resetOrdersDeliveryDateToToday();
    setOrdersFeedback("", "");
  });
});

orderForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setOrdersLoading(true);
    setOrdersFeedback("Saving order...", "");

    if (!validateOrdersRequiredFields()) {
      return;
    }

    const isDuplicateJo = await checkOrdersJoDuplicateFromDatabase();
    if (isDuplicateJo) {
      setOrdersFeedback("J.O. Number already exists.", "error");
      getOrdersJoInput()?.focus();
      return;
    }

    const payload = createOrderPayloadFromForm();
    await requestOrdersApi(ORDERS_API_BASE, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    orderForm.reset();
    clearOrdersJoDuplicateError();
    clearOrdersRequiredFieldErrors();
    resetOrdersDeliveryDateToToday();
    setOrdersFeedback("Order saved.", "success");
    await loadOrdersFromDatabase();
    document.dispatchEvent(new CustomEvent("system:notifications-refresh"));
    setOrdersActiveTab("add");
    scrollOrdersViewToTop();
  } catch (error) {
    const message = error?.message || "Hindi na-save ang order.";

    if (
      error?.field === "joNumber" ||
      error?.code === "DUPLICATE_JO_NUMBER" ||
      /J\.O\. Number already exists/i.test(message)
    ) {
      showOrdersJoDuplicateError("J.O. Number already exists.");
      setOrdersFeedback("J.O. Number already exists.", "error");
      getOrdersJoInput()?.focus();
      return;
    }

    setOrdersFeedback(message, "error");
  } finally {
    setOrdersLoading(false);
  }
});

getOrdersJoInput()?.addEventListener("input", () => {
  clearOrdersJoDuplicateError();
});

getOrdersJoInput()?.addEventListener("blur", async () => {
  try {
    await checkOrdersJoDuplicateFromDatabase();
  } catch (error) {
    setOrdersFeedback(error.message || "Unable to check J.O. Number.", "error");
  }
});

ordersRequiredFieldRules.forEach((rule) => {
  const input = getOrdersInput(rule.name);
  if (!input) return;

  input.addEventListener("blur", () => {
    validateOrdersRequiredField(rule);
  });

  input.addEventListener("input", () => {
    clearOrdersRequiredFieldError(rule.name);
  });

  input.addEventListener("change", () => {
    clearOrdersRequiredFieldError(rule.name);
  });
});

ordersFolderTabs.forEach((tab) => {
  tab.addEventListener("click", (event) => {
    event.preventDefault();
    clearOrdersAddOrderValidationState();
    setOrdersActiveTab(tab.dataset.ordersTab, { scroll: true });
    document.dispatchEvent(new CustomEvent("system:reset-default-position"));
  });
});

// Kapag lumipat sa ibang main page/sidebar tab, alisin ang red validation marks
// ng Add Order para pagbalik sa Orders malinis ulit ang form state.
document.addEventListener("click", (event) => {
  const navigationTarget = event.target.closest?.("[data-view-target], [data-production-status-link], [data-production-stage-link]");
  if (!navigationTarget) return;

  const targetView = navigationTarget.dataset?.viewTarget || "";
  if (targetView && targetView !== "orders") {
    clearOrdersAddOrderValidationState();
  }
}, true);

function isOrdersViewActiveForLiveRefresh() {
  return document.querySelector('.orders-view')?.classList.contains('active-view');
}

function isOrdersAutoRefreshBlocked() {
  if (!isOrdersViewActiveForLiveRefresh()) return true;
  if (document.querySelector('.orders-details-modal-backdrop.show')) return true;

  const activeElement = document.activeElement;
  if (!activeElement) return false;

  return Boolean(activeElement.closest?.('#addOrderForm, .orders-details-modal, input, textarea, select'));
}

function refreshOrdersForLivePolling() {
  loadOrdersAssignableUsers({ force: true });

  const activeOrdersPanel = document.querySelector('[data-orders-panel].active');
  const activePanelName = activeOrdersPanel?.dataset.ordersPanel || '';

  if (activePanelName === 'list' && !isOrdersAutoRefreshBlocked()) {
    loadOrdersFromDatabase({ silent: true });
  }
}

document.addEventListener('system:orders-live-refresh', refreshOrdersForLivePolling);

ordersList?.addEventListener("click", (event) => {
  const card = event.target.closest(".orders-data-card");
  if (!card) return;

  openOrdersDetailsModal(card.dataset.orderId);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeOrdersDetailsModal();
});

ordersSearchInput?.addEventListener("input", () => {
  clearTimeout(ordersSearchDebounceTimer);
  ordersSearchDebounceTimer = setTimeout(loadOrdersFromDatabase, 250);
});

ordersRefreshBtn?.addEventListener("click", loadOrdersFromDatabase);

setOrdersActiveTab("add");
updateTopbarTitle("overview");
resetOrdersDeliveryDateToToday();
setupOrdersCalendarControls();
ensureOrdersCalendarVisible();
loadOrdersAssignableUsers();
loadOrdersFromDatabase();

window.addEventListener("load", ensureOrdersCalendarVisible);
