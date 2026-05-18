/* ===== OVERVIEW ORDER DETAILS REFINEMENT V25: summary order, no subtitle/code/tabs, no production summary box ===== */
/* ===== OVERVIEW UPDATE V22: uniform modal details + responsive card fields ===== */
/* ===== OVERVIEW CALENDAR + GLOBAL HISTORY V19: paste this whole content to overview.js ===== */
/* ===== OVERVIEW TOTAL ORDER QUANTITIES + NOTICE/CALENDAR V17: paste to overview.js ===== */
/* ===== DELIVERY UPDATE V3: paste this whole content to overview.js ===== */
/* ===== HISTORY UPDATE V21: keep one Finishing Completed only + keep delivery timeline order ===== */
/* ===== OVERVIEW TAB ONLY ===== */
/* Pending Orders modal behavior. */

const overviewModalTriggers = document.querySelectorAll("[data-overview-modal]");
const overviewModalBackdrops = document.querySelectorAll(".overview-modal-backdrop");

function openOverviewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("overview-modal-open");

  const searchInput = modal.querySelector("#overviewPendingOrdersSearch");
  const closeButton = modal.querySelector(".overview-modal-close");

  if (modalId === "pendingOrdersModal") {
    if (typeof overviewPendingOrdersState !== "undefined") {
      overviewPendingOrdersState.alertFilter = "all";
    }

    if (typeof overviewUpdatePendingCounterFilterUI === "function") {
      overviewUpdatePendingCounterFilterUI();
    }

    if (typeof overviewRenderPendingOrdersList === "function") {
      overviewRenderPendingOrdersList(overviewPendingOrdersState.records);
    }

    modal.querySelector("#overviewPendingOrdersSearch")?.focus();
  } else {
    closeButton?.focus();
  }
}

function closeOverviewModal(modal) {
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overview-modal-open");
}

overviewModalTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openOverviewModal(trigger.dataset.overviewModal);
  });
});

overviewModalBackdrops.forEach((modal) => {
  modal.querySelector(".overview-modal-close")?.addEventListener("click", () => {
    closeOverviewModal(modal);
  });

  modal.querySelector(".overview-modal-secondary")?.addEventListener("click", () => {
    closeOverviewModal(modal);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  document.querySelectorAll(".overview-modal-backdrop.show").forEach((modal) => {
    closeOverviewModal(modal);
  });
});

/* Calendar starts empty and is filled only from real orders loaded from the API. */

const overviewCalendarActivityData = {};

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatReadableDateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function getOverviewCalendarMonthDate() {
  const title = document.querySelector(".overview-view .calendar-panel .calendar h3")?.textContent.trim();
  const parsed = title ? new Date(`${title} 1`) : new Date();

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function createCalendarActivityModal() {
  if (document.getElementById("overviewCalendarDateModal")) return;

  const modal = document.createElement("div");
  modal.className = "overview-modal-backdrop calendar-date-modal";
  modal.id = "overviewCalendarDateModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <section class="overview-modal" role="dialog" aria-modal="true" aria-labelledby="overviewCalendarDateModalTitle">
      <header class="overview-modal-head">
        <div class="overview-modal-title-wrap">
          <h2 id="overviewCalendarDateModalTitle">Calendar Activity</h2>
          <div class="calendar-date-summary" id="overviewCalendarDateSummary"></div>
        </div>

        <div class="overview-modal-head-right">
          <button class="overview-modal-close" type="button" aria-label="Close calendar activity modal">
            <span>×</span>
          </button>
        </div>
      </header>

      <div class="overview-modal-body" id="overviewCalendarDateModalBody"></div>

      <footer class="overview-modal-footer">
        <button class="overview-modal-secondary" type="button">Close</button>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".overview-modal-close")?.addEventListener("click", () => closeOverviewModal(modal));
  modal.querySelector(".overview-modal-secondary")?.addEventListener("click", () => closeOverviewModal(modal));
}

function getCalendarActivity(dateKey) {
  const activity = overviewCalendarActivityData[dateKey] || {};
  return {
    forDelivery: activity.forDelivery || [],
    delivered: activity.delivered || []
  };
}

function createCalendarField(label, value, isWide = false) {
  return `
    <div class="calendar-date-field${isWide ? " wide-field" : ""}">
      <span>${label}</span>
      <strong>${value || "—"}</strong>
    </div>
  `;
}

function createForDeliveryRecord(record) {
  return `
    <article class="calendar-date-record">
      ${createCalendarField("Delivery Date", record.deliveryDate)}
      ${createCalendarField("P.O. Number", record.poNumber)}
      ${createCalendarField("J.O. Number", record.joNumber)}
      ${createCalendarField("Client", record.client)}
      ${createCalendarField("Item", record.item, true)}
      ${createCalendarField("Quantity", record.quantity)}
    </article>
  `;
}

function createDeliveredRecord(record) {
  return `
    <article class="calendar-date-record">
      ${createCalendarField("Date Delivered", record.dateDelivered)}
      ${createCalendarField("Delivery Date", record.deliveryDate)}
      ${createCalendarField("P.O. Number", record.poNumber)}
      ${createCalendarField("J.O. Number", record.joNumber)}
      ${createCalendarField("Client", record.client)}
      ${createCalendarField("Item", record.item, true)}
      ${createCalendarField("Quantity", record.quantity)}
    </article>
  `;
}

function openOverviewCalendarDateModal(dateKey) {
  createCalendarActivityModal();

  const modal = document.getElementById("overviewCalendarDateModal");
  const title = document.getElementById("overviewCalendarDateModalTitle");
  const summary = document.getElementById("overviewCalendarDateSummary");
  const body = document.getElementById("overviewCalendarDateModalBody");

  if (!modal || !title || !summary || !body) return;

  const activity = getCalendarActivity(dateKey);
  const forDeliveryCount = activity.forDelivery.length;
  const deliveredCount = activity.delivered.length;
  const totalActivity = forDeliveryCount + deliveredCount;

  title.textContent = formatReadableDateFromKey(dateKey);

  summary.innerHTML = `
    <span class="calendar-date-pill for-delivery">${forDeliveryCount} For Delivery</span>
    <span class="calendar-date-pill delivered">${deliveredCount} Delivered</span>
  `;

  if (!totalActivity) {
    body.innerHTML = `
      <div class="calendar-empty-state">
        <div>
          <strong>No delivery activity</strong>
          <p>There are no scheduled deliveries or delivered orders on this date.</p>
        </div>
      </div>
    `;
  } else {
    const forDeliverySection = forDeliveryCount
      ? `
        <section class="calendar-date-section">
          <h3 class="calendar-date-section-title for-delivery">For Delivery</h3>
          <div class="calendar-date-list">
            ${activity.forDelivery.map(createForDeliveryRecord).join("")}
          </div>
        </section>
      `
      : "";

    const deliveredSection = deliveredCount
      ? `
        <section class="calendar-date-section">
          <h3 class="calendar-date-section-title delivered">Delivered</h3>
          <div class="calendar-date-list">
            ${activity.delivered.map(createDeliveredRecord).join("")}
          </div>
        </section>
      `
      : "";

    body.innerHTML = forDeliverySection + deliveredSection;
  }

  openOverviewModal("overviewCalendarDateModal");
}

function addCalendarMarkers(dateCell, activity) {
  const markers = document.createElement("span");
  markers.className = "calendar-date-markers";

  if (activity.forDelivery.length) {
    const marker = document.createElement("span");
    marker.className = "calendar-marker for-delivery";
    marker.title = "For Delivery";
    markers.appendChild(marker);
  }

  if (activity.delivered.length) {
    const marker = document.createElement("span");
    marker.className = "calendar-marker delivered";
    marker.title = "Delivered";
    markers.appendChild(marker);
  }

  return markers;
}

function enhanceOverviewCalendarActivity() {
  const datesGrid = document.querySelector(".overview-view .calendar-panel .dates");
  if (!datesGrid) return;

  const monthDate = getOverviewCalendarMonthDate();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const previousLastDate = new Date(year, month, 0).getDate();

  Array.from(datesGrid.querySelectorAll("span")).forEach((dateCell, cellIndex) => {
    const originalText = dateCell.textContent.trim();
    const displayedDay = Number(originalText);

    if (!displayedDay) return;

    let dateYear = year;
    let dateMonth = month;
    let dayNumber = displayedDay;

    if (cellIndex < startDay) {
      dateMonth = month - 1;
      dayNumber = previousLastDate - startDay + cellIndex + 1;

      if (dateMonth < 0) {
        dateMonth = 11;
        dateYear -= 1;
      }
    } else if (displayedDay < cellIndex - startDay + 1) {
      dateMonth = month + 1;

      if (dateMonth > 11) {
        dateMonth = 0;
        dateYear += 1;
      }
    }

    const dateKey = formatDateKey(new Date(dateYear, dateMonth, dayNumber));
    const activity = getCalendarActivity(dateKey);
    const hasActivity = activity.forDelivery.length || activity.delivered.length;

    dateCell.dataset.dateValue = dateKey;
    dateCell.classList.toggle("has-calendar-activity", Boolean(hasActivity));

    dateCell.innerHTML = "";

    const number = document.createElement("span");
    number.className = "calendar-date-number";
    number.textContent = originalText;

    dateCell.appendChild(number);
    dateCell.appendChild(addCalendarMarkers(dateCell, activity));

    dateCell.addEventListener("click", () => {
      openOverviewCalendarDateModal(dateKey);
    });
  });
}

createCalendarActivityModal();
enhanceOverviewCalendarActivity();

/* Notice Board starts empty and is filled only from real orders loaded from the API. */

function formatNoticeDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getNoticeTodayDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const [year, month, day] = formatter.format(new Date()).split("-").map(Number);
  return new Date(year, month - 1, day);
}

const noticeBoardDeliveryRecords = [];

function parseNoticeDate(dateValue) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatNoticeDate(dateValue) {
  const date = parseNoticeDate(dateValue);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getDeliveryAlertStatus(deliveryDateValue) {
  const today = getNoticeTodayDate();
  const deliveryDate = parseNoticeDate(deliveryDateValue);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.round((deliveryDate - today) / msPerDay);

  if (daysDiff < 0) {
    return {
      className: "alert-overdue",
      label: "Overdue",
      daysDiff
    };
  }

  if (daysDiff === 0) {
    return {
      className: "alert-due",
      label: "Due Today",
      daysDiff
    };
  }

  if (daysDiff <= 5) {
    return {
      className: "alert-critical",
      label: `${daysDiff} day${daysDiff === 1 ? "" : "s"} left`,
      daysDiff
    };
  }

  return null;
}

function createDeliveryAlertItem(record, alertStatus) {
  const alertItem = document.createElement("article");
  alertItem.className = `delivery-alert-item ${alertStatus.className}`;

  alertItem.innerHTML = `
    <div class="delivery-alert-content">
      <p class="delivery-alert-title">${record.item}</p>
      <div class="delivery-alert-meta">
        <span>${formatNoticeDate(record.deliveryDate)}</span>
        <span>${record.poNumber}</span>
        <span>${record.joNumber}</span>
      </div>
    </div>
    <span class="delivery-alert-badge ${alertStatus.className}">${alertStatus.label}</span>
  `;

  return alertItem;
}

function renderDeliveryAlertsNoticeBoard() {
  const noticeList = document.getElementById("deliveryAlertList");

  if (!noticeList) {
    console.warn("Notice Board container #deliveryAlertList not found. Check index.html replacement.");
    return;
  }

  const alerts = noticeBoardDeliveryRecords
    .map((record) => ({
      record,
      alertStatus: getDeliveryAlertStatus(record.deliveryDate)
    }))
    .filter((item) => item.alertStatus)
    .sort((a, b) => a.alertStatus.daysDiff - b.alertStatus.daysDiff);

  noticeList.innerHTML = "";

  if (!alerts.length) {
    noticeList.innerHTML = `
      <div class="notice-empty-state">
        <div>
          <strong>No delivery alerts</strong>
          <p>No due, overdue, or critical delivery dates right now.</p>
        </div>
      </div>
    `;
    return;
  }

  alerts.forEach(({ record, alertStatus }) => {
    noticeList.appendChild(createDeliveryAlertItem(record, alertStatus));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderDeliveryAlertsNoticeBoard);
} else {
  renderDeliveryAlertsNoticeBoard();
}

/* Clicking any item in the Notice Board opens a full details modal. */

function createNoticeDetailModal() {
  if (document.getElementById("noticeBoardDetailModal")) return;

  const modal = document.createElement("div");
  modal.className = "overview-modal-backdrop notice-detail-modal";
  modal.id = "noticeBoardDetailModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <section class="overview-modal" role="dialog" aria-modal="true" aria-labelledby="noticeBoardDetailModalTitle">
      <header class="overview-modal-head">
        <div class="overview-modal-title-wrap">
          <h2 id="noticeBoardDetailModalTitle">Notice Details</h2>
        </div>

        <div class="overview-modal-head-right">
          <button class="overview-modal-close" type="button" aria-label="Close notice detail modal">
            <span>×</span>
          </button>
        </div>
      </header>

      <div class="overview-modal-body" id="noticeBoardDetailModalBody"></div>

      <footer class="overview-modal-footer">
        <button class="overview-modal-secondary" type="button">Close</button>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".overview-modal-close")?.addEventListener("click", () => closeOverviewModal(modal));
  modal.querySelector(".overview-modal-secondary")?.addEventListener("click", () => closeOverviewModal(modal));
}

function createNoticeDetailField(label, value, isWide = false) {
  return `
    <div class="notice-detail-field${isWide ? " wide-field" : ""}">
      <span>${label}</span>
      <strong>${value || "—"}</strong>
    </div>
  `;
}

function openNoticeBoardDetail(record, alertStatus) {
  createNoticeDetailModal();

  const modal = document.getElementById("noticeBoardDetailModal");
  const title = document.getElementById("noticeBoardDetailModalTitle");
  const body = document.getElementById("noticeBoardDetailModalBody");

  if (!modal || !title || !body) return;

  title.textContent = record.item || "Notice Details";

  body.innerHTML = `
    <div class="notice-detail-card">
      <div class="notice-detail-status-row">
        <span class="notice-detail-status-badge ${alertStatus.className}">${alertStatus.label}</span>
      </div>

      <div class="notice-detail-grid">
        ${createNoticeDetailField("Delivery Date", formatNoticeDate(record.deliveryDate))}
        ${createNoticeDetailField("P.O. Number", record.poNumber)}
        ${createNoticeDetailField("J.O. Number", record.joNumber)}
        ${createNoticeDetailField("Client", record.client)}
        ${createNoticeDetailField("Item", record.item, true)}
      </div>
    </div>
  `;

  openOverviewModal("noticeBoardDetailModal");
}

/* Redefine Notice Board alert item so each item is clickable. */
function createDeliveryAlertItem(record, alertStatus) {
  const alertItem = document.createElement("article");
  alertItem.className = `delivery-alert-item ${alertStatus.className}`;
  alertItem.tabIndex = 0;
  alertItem.setAttribute("role", "button");
  alertItem.setAttribute("aria-label", `Open full details for ${record.item}`);

  alertItem.innerHTML = `
    <div class="delivery-alert-content">
      <p class="delivery-alert-title">${record.item}</p>
      <div class="delivery-alert-meta">
        <span>${formatNoticeDate(record.deliveryDate)}</span>
        <span>${record.poNumber}</span>
        <span>${record.joNumber}</span>
      </div>
    </div>
    <span class="delivery-alert-badge ${alertStatus.className}">${alertStatus.label}</span>
  `;

  alertItem.addEventListener("click", () => {
    openNoticeBoardDetail(record, alertStatus);
  });

  alertItem.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openNoticeBoardDetail(record, alertStatus);
    }
  });

  return alertItem;
}

/* Re-render Notice Board using clickable items. */
renderDeliveryAlertsNoticeBoard();

/* Metric buttons update the graph color, line data, tooltip, and summary cards. */

const yearlyGraphData = {
  2026: {
    total: Array(12).fill(0),
    pending: Array(12).fill(0),
    active: Array(12).fill(0),
    delivery: Array(12).fill(0),
    delivered: Array(12).fill(0)
  },
  2025: {
    total: Array(12).fill(0),
    pending: Array(12).fill(0),
    active: Array(12).fill(0),
    delivery: Array(12).fill(0),
    delivered: Array(12).fill(0)
  },
  2024: {
    total: Array(12).fill(0),
    pending: Array(12).fill(0),
    active: Array(12).fill(0),
    delivery: Array(12).fill(0),
    delivered: Array(12).fill(0)
  }
};

const yearlyGraphMetricLabels = {
  total: "Total Orders",
  pending: "Pending Orders",
  active: "Active Orders",
  delivery: "For Delivery",
  delivered: "Delivered Orders"
};

const yearlyGraphMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let activeYearlyMetric = "total";

function createSmoothPath(points) {
  if (!points.length) return "";

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index++) {
    const current = points[index];
    const previous = points[index - 1];
    const controlX = (previous.x + current.x) / 2;

    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }

  return path;
}

function updateYearlySummary(values) {
  const summaryCards = Array.from(document.querySelectorAll("#yearlySummaryGrid .yearly-summary-card"));
  if (!summaryCards.length) return;

  const total = values.reduce((sum, value) => sum + value, 0);
  const highestValue = Math.max(...values);
  const lowestValue = Math.min(...values);
  const highestIndex = values.indexOf(highestValue);
  const lowestIndex = values.indexOf(lowestValue);
  const average = total / values.length;

  const summaryValues = [
    total.toLocaleString(),
    `${yearlyGraphMonths[highestIndex]} (${highestValue})`,
    `${yearlyGraphMonths[lowestIndex]} (${lowestValue})`,
    average.toFixed(1)
  ];

  summaryCards.forEach((card, index) => {
    const strong = card.querySelector("strong");
    if (strong) strong.textContent = summaryValues[index] || "—";
  });
}

function updateYearlyGraph() {
  const yearlyPanel = document.querySelector(".yearly-panel");
  const selectedYear = document.getElementById("yearlyGraphYear")?.value || "2026";
  const values = yearlyGraphData[selectedYear]?.[activeYearlyMetric] || yearlyGraphData["2026"].total;
  const maxValue = Math.max(...values, 100);
  const graphWidth = 720;
  const graphHeight = 184;
  const topPadding = 30;
  const chartBaseY = 224;

  // One coordinate system only:
  // Dots and month labels are both placed inside the SVG.
  // This removes breakpoint mismatch from external HTML x-labels.
  const monthColumnWidth = graphWidth / 12;

  const points = values.map((value, index) => {
    const x = Math.round(monthColumnWidth * index + monthColumnWidth / 2);
    const y = Math.round(topPadding + (1 - value / maxValue) * graphHeight);

    return { x, y, value, month: yearlyGraphMonths[index] };
  });

  const linePath = createSmoothPath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x} ${chartBaseY} L ${firstPoint.x} ${chartBaseY} Z`;

  const line = document.getElementById("yearlyGraphLine");
  const area = document.getElementById("yearlyGraphArea");
  const pointsGroup = document.getElementById("yearlyGraphPoints");
  const yLabels = document.getElementById("yearlyGraphYLabels");
  const tooltip = document.getElementById("lineTooltip");

  yearlyPanel?.setAttribute("data-yearly-metric", activeYearlyMetric);

  if (line) line.setAttribute("d", linePath);
  if (area) area.setAttribute("d", areaPath);

  if (yLabels) {
    yLabels.innerHTML = `
      <span>${maxValue}</span>
      <span>${Math.round(maxValue * .75)}</span>
      <span>${Math.round(maxValue * .5)}</span>
      <span>${Math.round(maxValue * .25)}</span>
    `;
  }

  if (pointsGroup) {
    pointsGroup.innerHTML = "";

    const svgElement = document.querySelector(".yearly-panel .line-chart.enhanced-line-chart svg");
    let monthLabelsGroup = document.getElementById("yearlyGraphSvgMonthLabels");

    if (!monthLabelsGroup && svgElement) {
      monthLabelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      monthLabelsGroup.setAttribute("id", "yearlyGraphSvgMonthLabels");
      monthLabelsGroup.setAttribute("class", "svg-month-labels");
      svgElement.appendChild(monthLabelsGroup);
    }

    if (monthLabelsGroup) {
      monthLabelsGroup.innerHTML = "";

      points.forEach((point) => {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", point.x);
        label.setAttribute("y", "252");
        label.setAttribute("text-anchor", "middle");
        label.textContent = point.month;
        monthLabelsGroup.appendChild(label);
      });
    }

    points.forEach((point) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", point.x);
      circle.setAttribute("cy", point.y);
      circle.setAttribute("r", "6");
      circle.dataset.month = point.month;
      circle.dataset.value = point.value;

      circle.addEventListener("mouseenter", () => {
        pointsGroup.querySelectorAll("circle").forEach((item) => item.classList.remove("active"));
        circle.classList.add("active");

        if (tooltip) {
          tooltip.innerHTML = `${point.month} ${selectedYear}<br><b>${point.value.toLocaleString()}</b><small>${yearlyGraphMetricLabels[activeYearlyMetric]}</small>`;
          const tooltipLeft = Math.max(2, Math.min((point.x / graphWidth) * 100, 92));
          tooltip.style.left = `calc(${tooltipLeft}% - 26px)`;
          tooltip.style.top = `calc(${(point.y / 260) * 100}% - 58px)`;
          tooltip.classList.add("show");
        }
      });

      circle.addEventListener("mouseleave", () => {
        tooltip?.classList.remove("show");
        circle.classList.remove("active");
      });

      pointsGroup.appendChild(circle);
    });
  }

  updateYearlySummary(values);
}

document.querySelectorAll(".yearly-metric-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".yearly-metric-btn").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeYearlyMetric = button.dataset.yearlyMetric || "total";
    updateYearlyGraph();
  });
});

document.getElementById("yearlyGraphYear")?.addEventListener("change", updateYearlyGraph);

updateYearlyGraph();

/* Needed because tablet/mobile breakpoints change the actual graph and label widths. */

let yearlyGraphResizeTimer;

window.addEventListener("resize", () => {
  clearTimeout(yearlyGraphResizeTimer);
  yearlyGraphResizeTimer = setTimeout(() => {
    if (typeof updateYearlyGraph === "function") {
      updateYearlyGraph();
    }
  }, 120);
});


/* ===== OVERVIEW PENDING ORDERS - REAL DATA ===== */

const overviewPendingOrdersState = {
  records: [],
  search: "",
  alertFilter: "all",
  refreshTimer: null,
  requestId: 0,
  signature: ""
};


function overviewCreateOrdersSignature(orders = []) {
  if (!Array.isArray(orders)) return "[]";

  return JSON.stringify(orders.map((order) => ({
    id: order?.id ?? "",
    joNumber: order?.joNumber ?? "",
    poNumber: order?.poNumber ?? "",
    orderStatus: order?.orderStatus ?? order?.status ?? "",
    assignToRole: order?.assignToRole ?? order?.assign_to_role ?? "",
    updatedAt: order?.updatedAt ?? "",
    createdAt: order?.createdAt ?? ""
  })));
}

function overviewPreservePendingOrdersScroll(callback) {
  const list = document.querySelector("#pendingOrdersModal .pending-orders-list");
  if (!list || typeof callback !== "function") return callback?.();

  const top = list.scrollTop;
  const left = list.scrollLeft;
  const result = callback();

  list.scrollTop = top;
  list.scrollLeft = left;

  return result;
}

function overviewEscapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function overviewFormatDate(value) {
  if (!value) return "—";

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function overviewFormatCreatedDate(value) {
  if (!value) return "—";

  const rawDate = String(value).trim();
  const dateMatch = rawDate.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return overviewFormatDate(`${year}-${month}-${day}`);
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return rawDate;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function overviewParseRecentTimestamp(value) {
  if (!value) return 0;

  const rawValue = String(value).trim();
  if (!rawValue) return 0;

  const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
  const parsedValue = new Date(normalizedValue).getTime();

  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function overviewGetOrderRecentTimestamp(order) {
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
    const timestamp = overviewParseRecentTimestamp(value);
    if (timestamp > 0) return timestamp;
  }

  const numericId = Number(order?.id || 0);
  return Number.isFinite(numericId) ? numericId : 0;
}

function overviewSortOrdersRecentFirst(orders) {
  return [...orders].sort((firstOrder, secondOrder) => {
    const secondTimestamp = overviewGetOrderRecentTimestamp(secondOrder);
    const firstTimestamp = overviewGetOrderRecentTimestamp(firstOrder);

    if (secondTimestamp !== firstTimestamp) {
      return secondTimestamp - firstTimestamp;
    }

    return Number(secondOrder?.id || 0) - Number(firstOrder?.id || 0);
  });
}

function overviewGetTodayDateOnly() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function overviewParseDateOnly(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function overviewGetDeliveryAlert(order) {
  const deliveryDate = overviewParseDateOnly(order.deliveryDate);
  if (!deliveryDate) return { className: "", label: "" };

  const today = overviewGetTodayDateOnly();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((deliveryDate - today) / msPerDay);

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

  return { className: "", label: "" };
}

function overviewGetPendingAlertFilterType(order) {
  const alert = overviewGetDeliveryAlert(order);

  if (alert.className === "delivery-warning") return "critical";
  if (alert.className === "delivery-danger") return "due";

  return "normal";
}

function overviewGetPendingFilterLabel(filter = overviewPendingOrdersState.alertFilter) {
  if (filter === "critical") return "Critical";
  if (filter === "due") return "Due/Overdue";
  return "Pending";
}

function getOverviewStoredUser() {
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

function normalizeOverviewUserRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getOverviewAuthHeaders() {
  const user = getOverviewStoredUser();
  const token = localStorage.getItem("dashboardAuthToken") || "";

  return {
    "Content-Type": "application/json",
    "X-User-Id": user?.username || "",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function overviewCanSeeAllProductionAssignments() {
  const role = normalizeOverviewUserRole(getOverviewStoredUser()?.role);
  return ["admin", "manager", "supervisor", "logistics", "production_staff"].includes(role);
}

function getOverviewScopedProductionRole() {
  const role = normalizeOverviewUserRole(getOverviewStoredUser()?.role);
  return ["lockkey_production", "happy_production"].includes(role) ? role : "";
}

function getOverviewRecordAssignmentRole(record = {}) {
  return normalizeOverviewUserRole(
    record.assignToRole
      || record.assign_to_role
      || record.assignedUserRole
      || record.assigned_user_role
      || record.orderAssignToRole
      || record.order_assign_to_role
      || ""
  );
}

function overviewFilterByAssignmentScope(records = []) {
  if (!Array.isArray(records)) return [];
  if (overviewCanSeeAllProductionAssignments()) return records;

  const scopedRole = getOverviewScopedProductionRole();
  if (!scopedRole) return records;

  return records.filter((record) => getOverviewRecordAssignmentRole(record) === scopedRole);
}

async function overviewRequestOrders(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      ...getOverviewAuthHeaders(),
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
    throw new Error(data?.error || "Unable to load overview orders.");
  }

  return data;
}

function overviewGetPendingOrdersCountElements() {
  const pendingTrigger = document.querySelector('[data-overview-modal="pendingOrdersModal"]');
  const pendingCardCount = pendingTrigger?.closest(".stat-card")?.querySelector("strong");

  return [pendingCardCount].filter(Boolean);
}

function overviewEnsurePendingOrdersCounterGroup() {
  const modal = document.getElementById("pendingOrdersModal");
  const footer = modal?.querySelector(".overview-modal-footer");
  if (!modal || !footer) return null;

  let group = modal.querySelector(".overview-pending-counter-group");
  if (group) return group;

  group = document.createElement("div");
  group.className = "overview-pending-counter-group";

  const existingPendingCounter = modal.querySelector(".overview-modal-head-right > .overview-modal-counter");
  existingPendingCounter?.remove();

  group.innerHTML = `
    <button class="overview-modal-counter overview-pending-counter pending-counter" type="button" data-overview-pending-filter="all" aria-pressed="true">
      <strong>0</strong>
      <small>Pending</small>
    </button>
    <button class="overview-modal-counter overview-pending-counter critical-counter" type="button" data-overview-pending-filter="critical" aria-pressed="false">
      <strong>0</strong>
      <small>Critical</small>
    </button>
    <button class="overview-modal-counter overview-pending-counter due-counter" type="button" data-overview-pending-filter="due" aria-pressed="false">
      <strong>0</strong>
      <small>Due/Overdue</small>
    </button>
  `;

  group.addEventListener("click", (event) => {
    const counter = event.target.closest("[data-overview-pending-filter]");
    if (!counter || counter.hidden) return;

    const selectedFilter = counter.dataset.overviewPendingFilter || "all";
    const currentFilter = overviewPendingOrdersState.alertFilter || "all";

    overviewPendingOrdersState.alertFilter = selectedFilter === currentFilter && selectedFilter !== "all"
      ? "all"
      : selectedFilter;

    overviewUpdatePendingCounterFilterUI();
    overviewRenderPendingOrdersList(overviewPendingOrdersState.records);
  });

  footer.prepend(group);

  return group;
}

function overviewGetPendingOrderCounterValues(orders = overviewPendingOrdersState.records) {
  const pendingOrders = Array.isArray(orders) ? orders : [];
  let critical = 0;
  let due = 0;

  pendingOrders.forEach((order) => {
    const alert = overviewGetDeliveryAlert(order);

    if (alert.className === "delivery-warning") {
      critical += 1;
    }

    if (alert.className === "delivery-danger") {
      due += 1;
    }
  });

  return {
    pending: pendingOrders.length,
    critical,
    due
  };
}

function overviewUpdatePendingCounterFilterUI() {
  const group = document.querySelector("#pendingOrdersModal .overview-pending-counter-group");
  if (!group) return;

  group.querySelectorAll("[data-overview-pending-filter]").forEach((counter) => {
    const isActive = (counter.dataset.overviewPendingFilter || "all") === overviewPendingOrdersState.alertFilter;
    counter.classList.toggle("is-active", isActive);
    counter.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function overviewUpdatePendingOrdersCount(count, orders = overviewPendingOrdersState.records) {
  overviewGetPendingOrdersCountElements().forEach((element) => {
    element.textContent = String(count);
  });

  const group = overviewEnsurePendingOrdersCounterGroup();
  const values = overviewGetPendingOrderCounterValues(orders);

  if (!group) return;

  const modal = document.getElementById("pendingOrdersModal");
  const pendingValue = group.querySelector(".pending-counter strong");
  const criticalCounter = group.querySelector(".critical-counter");
  const criticalValue = criticalCounter?.querySelector("strong");
  const dueCounter = group.querySelector(".due-counter");
  const dueValue = dueCounter?.querySelector("strong");

  if (pendingValue) pendingValue.textContent = String(values.pending);
  if (criticalValue) criticalValue.textContent = String(values.critical);
  if (dueValue) dueValue.textContent = String(values.due);

  if (criticalCounter) criticalCounter.hidden = values.critical <= 0;
  if (dueCounter) dueCounter.hidden = values.due <= 0;

  const hasAlertCounters = values.critical > 0 || values.due > 0;
  modal?.classList.toggle("pending-alert-counters-empty", !hasAlertCounters);

  if (overviewPendingOrdersState.alertFilter === "critical" && values.critical <= 0) {
    overviewPendingOrdersState.alertFilter = "all";
  }

  if (overviewPendingOrdersState.alertFilter === "due" && values.due <= 0) {
    overviewPendingOrdersState.alertFilter = "all";
  }

  overviewUpdatePendingCounterFilterUI();
}

function overviewEnsurePendingOrdersSearch() {
  const modal = document.getElementById("pendingOrdersModal");
  const modalHead = modal?.querySelector(".overview-modal-head");
  const headRight = modal?.querySelector(".overview-modal-head-right");

  if (!modalHead) return null;

  let searchWrap = modal.querySelector(".overview-pending-search-wrap");

  if (searchWrap && searchWrap.parentElement !== modalHead) {
    searchWrap.remove();
    searchWrap = null;
  }

  if (!searchWrap) {
    searchWrap = document.createElement("div");
    searchWrap.className = "overview-pending-search-wrap";
    searchWrap.innerHTML = `
      <input
        id="overviewPendingOrdersSearch"
        class="overview-pending-search"
        type="search"
        placeholder="Search JO, PO, client, item..."
        autocomplete="off"
      >
    `;

    if (headRight) {
      modalHead.insertBefore(searchWrap, headRight);
    } else {
      modalHead.appendChild(searchWrap);
    }

    const searchInput = searchWrap.querySelector("#overviewPendingOrdersSearch");
    searchInput?.addEventListener("input", () => {
      overviewPendingOrdersState.search = searchInput.value.trim().toLowerCase();
      overviewRenderPendingOrdersList(overviewPendingOrdersState.records);
    });
  }

  return searchWrap.querySelector("#overviewPendingOrdersSearch");
}

function overviewFilterPendingOrders(orders) {
  const keyword = overviewPendingOrdersState.search.trim().toLowerCase();
  const activeFilter = overviewPendingOrdersState.alertFilter || "all";
  let filteredOrders = Array.isArray(orders) ? orders : [];

  if (activeFilter !== "all") {
    filteredOrders = filteredOrders.filter((order) => overviewGetPendingAlertFilterType(order) === activeFilter);
  }

  if (!keyword) return overviewSortOrdersRecentFirst(filteredOrders);

  return overviewSortOrdersRecentFirst(filteredOrders.filter((order) => {
    return [
      order.joNumber,
      order.poNumber,
      order.client,
      order.item,
      order.quantity,
      order.unit,
      order.assignTo,
      order.deliveryDate
    ]
      .map((value) => String(value ?? "").toLowerCase())
      .some((value) => value.includes(keyword));
  }));
}

function overviewRenderPendingOrdersList(orders) {
  const list = document.querySelector("#pendingOrdersModal .pending-orders-list");
  if (!list) return;

  const searchInput = overviewEnsurePendingOrdersSearch();
  if (searchInput && searchInput.value !== overviewPendingOrdersState.search) {
    searchInput.value = overviewPendingOrdersState.search;
  }

  const filteredOrders = overviewFilterPendingOrders(orders);

  if (!filteredOrders.length) {
    const activeFilter = overviewPendingOrdersState.alertFilter || "all";
    const filterLabel = overviewGetPendingFilterLabel(activeFilter);
    const hasFilter = activeFilter !== "all";
    const hasSearch = Boolean(overviewPendingOrdersState.search);

    list.innerHTML = `
      <div class="overview-pending-empty">
        <strong>${hasSearch ? `No matching ${hasFilter ? filterLabel.toLowerCase() + " " : ""}pending orders` : hasFilter ? `No ${filterLabel} pending orders` : "No pending orders"}</strong>
        <span>${hasSearch ? "Try another JO, PO, client, or item." : hasFilter ? `Walang ${filterLabel.toLowerCase()} sa pending orders ngayon.` : "Pending orders from Orders will appear here."}</span>
      </div>
    `;
    return;
  }

  list.innerHTML = filteredOrders.map((order) => {
    const quantity = `${order.quantity ?? "—"} ${order.unit ?? ""}`.trim();
    const deliveryAlert = overviewGetDeliveryAlert(order);

    return `
      <article class="pending-order-card overview-pending-order-card ${overviewEscapeHTML(deliveryAlert.className)}" data-overview-order-id="${overviewEscapeHTML(order.id)}">
        <div class="overview-pending-order-head">
          <div>
            <h3>${overviewEscapeHTML(order.item || "—")}</h3>
          </div>
          ${deliveryAlert.label ? `<em class="orders-delivery-alert-label">${overviewEscapeHTML(deliveryAlert.label)}</em>` : ""}
        </div>

        <div class="pending-order-field">
          <span>J.O. Number</span>
          <strong>${overviewEscapeHTML(order.joNumber || "—")}</strong>
        </div>
        <div class="pending-order-field">
          <span>P.O. Number</span>
          <strong>${overviewEscapeHTML(order.poNumber || "—")}</strong>
        </div>
        <div class="pending-order-field">
          <span>Client</span>
          <strong>${overviewEscapeHTML(order.client || "—")}</strong>
        </div>
        <div class="pending-order-field">
          <span>Quantity</span>
          <strong>${overviewEscapeHTML(quantity || "—")}</strong>
        </div>
        <div class="pending-order-field">
          <span>Delivery Date</span>
          <strong>${overviewEscapeHTML(overviewFormatDate(order.deliveryDate))}</strong>
        </div>
        <div class="pending-order-field">
          <span>Assign To</span>
          <strong>${overviewEscapeHTML(order.assignTo || "—")}</strong>
        </div>
      </article>
    `;
  }).join("");
}

function overviewGetPendingOrderById(orderId) {
  return overviewPendingOrdersState.records.find((order) => String(order.id) === String(orderId)) || null;
}

function overviewCreatePendingDetailsModal() {
  let modal = document.getElementById("overviewPendingOrderDetailsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "overview-order-details-backdrop";
  modal.id = "overviewPendingOrderDetailsModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <section class="overview-order-details-modal" role="dialog" aria-modal="true" aria-labelledby="overviewPendingOrderDetailsTitle">
      <header class="overview-order-details-head">
        <div>
          <h2 id="overviewPendingOrderDetailsTitle">Order Details</h2>
        </div>
        <button class="overview-order-details-close" type="button" aria-label="Close order details">
          <span>×</span>
        </button>
      </header>

      <div class="overview-order-details-body" id="overviewPendingOrderDetailsBody"></div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".overview-order-details-close")?.addEventListener("click", overviewClosePendingDetailsModal);

  return modal;
}

function overviewOpenPendingDetailsModal(orderId) {
  const order = overviewGetPendingOrderById(orderId);
  if (!order) return;

  const modal = overviewCreatePendingDetailsModal();
  const title = modal.querySelector("#overviewPendingOrderDetailsTitle");
  const body = modal.querySelector("#overviewPendingOrderDetailsBody");
  const quantity = `${order.quantity ?? "—"} ${order.unit ?? ""}`.trim();
  const deliveryAlert = overviewGetDeliveryAlert(order);
  const status = order.orderStatus || "pending";
  const alertLabel = deliveryAlert.label || "Normal";

  function pendingField(label, value, wide = false) {
    return `
      <div class="overview-order-field${wide ? " wide" : ""}">
        <span>${overviewEscapeHTML(label)}</span>
        <strong>${overviewEscapeHTML(value || "—")}</strong>
      </div>
    `;
  }

  if (title) title.textContent = order.item || "Order Details";

  if (body) {
    body.innerHTML = `
      <section class="overview-detail-hero ${overviewEscapeHTML(deliveryAlert.className)}">
        <div>
          <span class="overview-detail-eyebrow">${overviewEscapeHTML(status)}</span>
          <h3>${overviewEscapeHTML(order.item || "—")}</h3>
          <p>${overviewEscapeHTML(order.client || "—")}</p>
          <small>${overviewEscapeHTML(order.poNumber || "—")} • ${overviewEscapeHTML(order.joNumber || "—")}</small>
        </div>
        <div class="overview-detail-status-stack">
          <span class="orders-status-pill status-${overviewEscapeHTML(status)}">${overviewEscapeHTML(status)}</span>
          ${deliveryAlert.label ? `<em class="orders-delivery-alert-label">${overviewEscapeHTML(deliveryAlert.label)}</em>` : `<em class="orders-delivery-alert-label alert-clear">Normal</em>`}
        </div>
      </section>

      <section class="overview-detail-summary-grid">
        <div class="overview-detail-summary-card">
          <span>Original Quantity</span>
          <strong>${overviewEscapeHTML(quantity || "—")}</strong>
        </div>
        <div class="overview-detail-summary-card">
          <span>Delivery Date</span>
          <strong>${overviewEscapeHTML(overviewFormatDate(order.deliveryDate))}</strong>
        </div>
        <div class="overview-detail-summary-card">
          <span>Alert Status</span>
          <strong>${overviewEscapeHTML(alertLabel)}</strong>
        </div>
        <div class="overview-detail-summary-card">
          <span>Current Status</span>
          <strong>${overviewEscapeHTML(status)}</strong>
        </div>
      </section>

      <section class="overview-order-section overview-detail-section">
        <h3>Order Information</h3>
        <div class="overview-order-grid overview-detail-grid">
          ${pendingField("P.O. Number", order.poNumber)}
          ${pendingField("J.O. Number", order.joNumber)}
          ${pendingField("Client", order.client)}
          ${pendingField("Item", order.item, true)}
          ${pendingField("Original Quantity", quantity)}
          ${pendingField("Unit", order.unit)}
        </div>
      </section>

      <section class="overview-order-section overview-detail-section">
        <h3>Materials & Assignment</h3>
        <div class="overview-order-grid overview-detail-grid">
          ${pendingField("Printing Material", order.printingMaterial)}
          ${pendingField("Lamination Material", order.laminationMaterial)}
          ${pendingField("Assigned To", order.assignTo)}
          ${pendingField("Date Created", overviewFormatCreatedDate(order.createdAt))}
        </div>
      </section>

      <section class="overview-order-section overview-detail-section">
        <h3>Schedule</h3>
        <div class="overview-order-grid overview-detail-grid">
          ${pendingField("Delivery Date", overviewFormatDate(order.deliveryDate))}
          ${pendingField("Alert Status", alertLabel)}
          ${pendingField("Status", status)}
        </div>
      </section>
    `;

    body.scrollTop = 0;
  }

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("overview-order-details-open");
}

function overviewClosePendingDetailsModal() {
  const modal = document.getElementById("overviewPendingOrderDetailsModal");
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overview-order-details-open");
}

async function overviewLoadPendingOrders(options = {}) {
  const requestId = ++overviewPendingOrdersState.requestId;
  const isSilent = options.silent === true;
  const forceRender = options.forceRender === true;

  try {
    const data = await overviewRequestOrders("/api/orders?status=pending");
    if (requestId !== overviewPendingOrdersState.requestId) return;

    const orders = overviewSortOrdersRecentFirst(overviewFilterByAssignmentScope(Array.isArray(data.orders) ? data.orders : []));
    const nextSignature = overviewCreateOrdersSignature(orders);

    if (isSilent && !forceRender && nextSignature === overviewPendingOrdersState.signature) {
      overviewUpdatePendingOrdersCount(orders.length, orders);
      return;
    }

    overviewPendingOrdersState.records = orders;
    overviewPendingOrdersState.signature = nextSignature;
    overviewUpdatePendingOrdersCount(orders.length, orders);

    if (isSilent) {
      overviewPreservePendingOrdersScroll(() => overviewRenderPendingOrdersList(orders));
    } else {
      overviewRenderPendingOrdersList(orders);
    }
  } catch (error) {
    if (requestId !== overviewPendingOrdersState.requestId) return;

    if (isSilent) {
      console.warn("Overview pending orders live refresh failed:", error.message);
      return;
    }

    overviewPendingOrdersState.records = [];
    overviewPendingOrdersState.signature = "";
    overviewUpdatePendingOrdersCount(0, []);

    overviewEnsurePendingOrdersSearch();

    const list = document.querySelector("#pendingOrdersModal .pending-orders-list");
    if (list) {
      list.innerHTML = `
        <div class="overview-pending-empty error">
          <strong>Unable to load pending orders</strong>
          <span>${overviewEscapeHTML(error.message)}</span>
        </div>
      `;
    }
  }
}

function scheduleOverviewPendingOrdersRefresh(delay = 80, options = {}) {
  clearTimeout(overviewPendingOrdersState.refreshTimer);
  overviewPendingOrdersState.refreshTimer = setTimeout(() => overviewLoadPendingOrders(options), delay);
}

document.querySelector("#pendingOrdersModal .pending-orders-list")?.addEventListener("click", (event) => {
  const card = event.target.closest(".overview-pending-order-card");
  if (!card) return;

  overviewOpenPendingDetailsModal(card.dataset.overviewOrderId);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  overviewClosePendingDetailsModal();
});

document.addEventListener("system:notifications-refresh", (event) => scheduleOverviewPendingOrdersRefresh(80, { silent: event.detail?.source === "live-poll" }));
document.addEventListener("system:orders-list-rendered", () => scheduleOverviewPendingOrdersRefresh(80, { silent: true }));
document.addEventListener("system:production-records-updated", () => scheduleOverviewPendingOrdersRefresh(80, { silent: true }));
document.addEventListener("system:overview-refresh", (event) => scheduleOverviewPendingOrdersRefresh(80, { silent: event.detail?.source === "live-poll" }));

window.addEventListener("focus", () => scheduleOverviewPendingOrdersRefresh(0));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleOverviewPendingOrdersRefresh(0);
});

overviewModalTriggers.forEach((trigger) => {
  if (trigger.dataset.overviewModal !== "pendingOrdersModal") return;

  trigger.addEventListener("click", () => {
    overviewLoadPendingOrders();
  });
});

overviewLoadPendingOrders();


/* ===== OVERVIEW REAL DATA DASHBOARD ===== */

(function initOverviewRealDataDashboard() {
  const OVERVIEW_ORDERS_API = "/api/orders";
  const OVERVIEW_ACTIVITY_API = "/api/activity/recent";
  const OVERVIEW_PRODUCTION_RECORDS_API = "/api/production/records";
  const OVERVIEW_PRODUCTION_HISTORY_API = "/api/production/history";
  const REFRESH_DELAY = 250;

  const state = {
    orders: [],
    productionRecords: [],
    productionHistory: [],
    activities: [],
    calendarDate: new Date(),
    yearlyMetric: "total",
    refreshTimer: null,
    isLoading: false,
    dataSignature: ""
  };

  function createOverviewDashboardSignature(orders = [], productionRecords = [], productionHistory = [], activities = []) {
    return JSON.stringify({
      orders: (Array.isArray(orders) ? orders : []).map((order) => ({
        id: order?.id ?? "",
        joNumber: order?.joNumber ?? "",
        poNumber: order?.poNumber ?? "",
        status: order?.orderStatus ?? order?.status ?? "",
        assignToRole: order?.assignToRole ?? order?.assign_to_role ?? "",
        updatedAt: order?.updatedAt ?? "",
        createdAt: order?.createdAt ?? ""
      })),
      productionRecords: (Array.isArray(productionRecords) ? productionRecords : []).map((record) => ({
        id: record?.id ?? "",
        orderId: record?.orderId ?? "",
        stage: record?.stage ?? "",
        status: record?.stageStatus ?? record?.status ?? "",
        assignToRole: record?.assignToRole ?? record?.assign_to_role ?? "",
        updatedAt: record?.updatedAt ?? ""
      })),
      productionHistory: (Array.isArray(productionHistory) ? productionHistory : []).map((history) => ({
        id: history?.id ?? "",
        historyKey: history?.historyKey ?? history?.history_key ?? "",
        orderId: history?.orderId ?? history?.order_id ?? "",
        productionRecordId: history?.productionRecordId ?? history?.production_record_id ?? "",
        eventType: history?.eventType ?? history?.event_type ?? "",
        title: history?.title ?? "",
        createdAt: history?.createdAt ?? history?.created_at ?? history?.meta ?? ""
      })),
      activities: (Array.isArray(activities) ? activities : []).map((activity) => ({
        id: activity?.id ?? "",
        title: activity?.title ?? "",
        eventType: activity?.eventType ?? "",
        joNumber: activity?.joNumber ?? "",
        poNumber: activity?.poNumber ?? "",
        createdAt: activity?.createdAt ?? activity?.time ?? ""
      }))
    });
  }

  function preserveOverviewScroll(callback) {
    const selectors = [
      ".recent-activity-list",
      "#recentActivityList",
      ".pending-orders-list",
      "#overviewPendingOrdersList",
      ".overview-modal-body",
      ".delivery-alert-list",
      ".total-orders-modal-list"
    ];

    const positions = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft
    })));

    const result = typeof callback === "function" ? callback() : undefined;

    positions.forEach(({ element, top, left }) => {
      element.scrollTop = top;
      element.scrollLeft = left;
    });

    return result;
  }

  const activeOrdersModalState = {
    search: "",
    startDate: "",
    endDate: ""
  };

  const totalOrdersModalState = {
    search: "",
    filter: "all"
  };

  const recentActivityModalState = {
    search: ""
  };

  const statusLabels = {
    pending: "Pending",
    production: "Active",
    delivery: "For Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    hold: "Hold"
  };

  const statusClasses = {
    pending: "pending",
    production: "active",
    delivery: "delivery",
    delivered: "delivered",
    cancelled: "cancelled",
    hold: "hold"
  };

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeStatus(status) {
    return String(status || "pending").trim().toLowerCase();
  }

  function isOverviewDeliveredOrder(order = {}) {
    const status = normalizeStatus(order.orderStatus || order.order_status || order.status || "");
    const deliveredAt = String(order.deliveredAt || order.delivered_at || "").trim();
    return status === "delivered" || Boolean(deliveredAt);
  }

  function getStatusLabel(status) {
    return statusLabels[normalizeStatus(status)] || String(status || "Pending");
  }

  function getStatusClass(status) {
    return statusClasses[normalizeStatus(status)] || "pending";
  }

  function getOrderDate(order) {
    const rawValue = order.createdAt || order.created_at || order.deliveryDate || order.delivery_date;
    const parsed = new Date(rawValue);

    if (!Number.isNaN(parsed.getTime())) return parsed;

    const fallback = parseDateOnly(order.deliveryDate || order.delivery_date);
    return fallback || new Date();
  }


  function parseRecentTimestamp(value) {
    if (!value) return 0;

    const rawValue = String(value).trim();
    if (!rawValue) return 0;

    const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
    const parsedValue = new Date(normalizedValue).getTime();

    return Number.isNaN(parsedValue) ? 0 : parsedValue;
  }

  function getOrderRecentTimestamp(order) {
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
      const timestamp = parseRecentTimestamp(value);
      if (timestamp > 0) return timestamp;
    }

    const numericId = Number(order?.id || 0);
    return Number.isFinite(numericId) ? numericId : 0;
  }

  function sortOrdersRecentFirst(orders) {
    return [...orders].sort((firstOrder, secondOrder) => {
      const secondTimestamp = getOrderRecentTimestamp(secondOrder);
      const firstTimestamp = getOrderRecentTimestamp(firstOrder);

      if (secondTimestamp !== firstTimestamp) {
        return secondTimestamp - firstTimestamp;
      }

      return Number(secondOrder?.id || 0) - Number(firstOrder?.id || 0);
    });
  }

  function getProductionRecordRecentTimestamp(record) {
    const candidateValues = [
      record?.takenAtRaw,
      record?.updatedAtRaw,
      record?.orderCreatedRaw,
      record?.takenAt,
      record?.taken_at,
      record?.updatedAt,
      record?.updated_at,
      record?.createdAt,
      record?.created_at,
      record?.orderDate,
      record?.deliveryDateRaw
    ];

    for (const value of candidateValues) {
      const timestamp = parseRecentTimestamp(value);
      if (timestamp > 0) return timestamp;
    }

    const numericId = Number(String(record?.productionRecordId || record?.orderId || record?.id || "").match(/\d+/g)?.pop() || 0);
    return Number.isFinite(numericId) ? numericId : 0;
  }

  function sortProductionRecordsRecentFirst(records) {
    return [...records].sort((firstRecord, secondRecord) => {
      const secondTimestamp = getProductionRecordRecentTimestamp(secondRecord);
      const firstTimestamp = getProductionRecordRecentTimestamp(firstRecord);

      if (secondTimestamp !== firstTimestamp) {
        return secondTimestamp - firstTimestamp;
      }

      return String(secondRecord?.id || "").localeCompare(String(firstRecord?.id || ""));
    });
  }

  function parseDateOnly(value) {
    if (!value) return null;

    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
  }

  function formatDate(value) {
    const dateOnly = parseDateOnly(value);
    if (!dateOnly) return "—";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(dateOnly);
  }

  function formatDateTime(value) {
    if (!value) return "—";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return formatDate(value);

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(parsed);
  }

  function formatQuantity(order) {
    return `${order.quantity ?? "—"} ${order.unit ?? ""}`.trim();
  }

  function parseOverviewQuantityNumber(value) {
    const normalizedValue = String(value ?? "")
      .replace(/,/g, "")
      .replace(/[^0-9.-]/g, "")
      .trim();
    const number = Number(normalizedValue);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeOverviewUnit(value = "") {
    const unit = String(value || "").trim().toLowerCase();
    if (["pc", "pcs", "piece", "pieces"].includes(unit)) return "pcs";
    if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(unit)) return "kgs";
    if (["mt", "mts", "m", "meter", "meters", "metre", "metres"].includes(unit)) return "mts";
    return unit;
  }

  function formatOverviewQuantityValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function getOverviewOriginalQuantityText(order = {}) {
    const quantity = formatQuantity(order);
    return quantity && quantity !== "—" ? quantity : "—";
  }

  function getOverviewDeliveredQuantityData(order = {}) {
    const processType = String(order.deliveryProcessType || order.delivery_process_type || "").trim().toLowerCase();

    if (processType === "bagging") {
      const bags = parseOverviewQuantityNumber(order.deliveryBags ?? order.delivery_bags);
      const pcsPerBag = parseOverviewQuantityNumber(order.deliveryPcsPerBag ?? order.delivery_pcs_per_bag);

      if (bags !== null && pcsPerBag !== null) {
        const totalPcs = bags * pcsPerBag;
        return {
          value: totalPcs,
          unit: "pcs",
          text: `${formatOverviewQuantityValue(totalPcs)} pcs (${formatOverviewQuantityValue(bags)} bags × ${formatOverviewQuantityValue(pcsPerBag)} pcs/bag)`
        };
      }

      if (bags !== null) {
        return {
          value: null,
          unit: "pcs",
          text: `${formatOverviewQuantityValue(bags)} bags`
        };
      }
    }

    if (processType === "weighing") {
      const totalKgs = parseOverviewQuantityNumber(order.deliveryTotalKgs ?? order.delivery_total_kgs);
      const rolls = parseOverviewQuantityNumber(order.deliveryRolls ?? order.delivery_rolls);

      if (totalKgs !== null && rolls !== null) {
        return {
          value: totalKgs,
          unit: "kgs",
          text: `${formatOverviewQuantityValue(totalKgs)} kgs • ${formatOverviewQuantityValue(rolls)} rolls`
        };
      }

      if (totalKgs !== null) {
        return {
          value: totalKgs,
          unit: "kgs",
          text: `${formatOverviewQuantityValue(totalKgs)} kgs`
        };
      }
    }

    const fallbackQuantity = String(order.finalQuantity || order.final_quantity || "").trim();
    if (fallbackQuantity) {
      return {
        value: parseOverviewQuantityNumber(fallbackQuantity),
        unit: normalizeOverviewUnit(order.unit),
        text: fallbackQuantity
      };
    }

    return { value: null, unit: "", text: "—" };
  }

  function getOverviewDeliveredQuantityText(order = {}) {
    return getOverviewDeliveredQuantityData(order).text || "—";
  }

  function getOverviewDeliveredDifferenceText(order = {}) {
    const originalValue = parseOverviewQuantityNumber(order.quantity);
    const originalUnit = normalizeOverviewUnit(order.unit);
    const deliveredData = getOverviewDeliveredQuantityData(order);
    const deliveredValue = deliveredData.value;
    const deliveredUnit = normalizeOverviewUnit(deliveredData.unit);

    if (originalValue === null || deliveredValue === null || !originalUnit || !deliveredUnit) return "—";
    if (originalUnit !== deliveredUnit) return "—";

    const difference = originalValue - deliveredValue;
    const absoluteDifference = Math.abs(difference);

    if (absoluteDifference < 0.0001) return "Matched";
    if (difference > 0) return `${formatOverviewQuantityValue(absoluteDifference)} ${originalUnit} short`;
    return `${formatOverviewQuantityValue(absoluteDifference)} ${originalUnit} over`;
  }

  function formatOverviewCompactNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "—";
    return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function getOverviewDeliveryProcessLabel(order = {}) {
    const type = String(order.deliveryProcessType || order.delivery_process_type || "").toLowerCase();
    if (type === "bagging") return "Bagging";
    if (type === "weighing") return "Weighing";
    return "—";
  }

  function getOverviewDeliverySpecificFields(order = {}) {
    const type = String(order.deliveryProcessType || order.delivery_process_type || "").toLowerCase();

    if (type === "bagging") {
      return [
        ["No. of Bags", formatOverviewCompactNumber(order.deliveryBags ?? order.delivery_bags)],
        ["Pcs per Bag", formatOverviewCompactNumber(order.deliveryPcsPerBag ?? order.delivery_pcs_per_bag)]
      ];
    }

    if (type === "weighing") {
      return [
        ["No. of Rolls", formatOverviewCompactNumber(order.deliveryRolls ?? order.delivery_rolls)],
        ["Total Kgs", formatOverviewCompactNumber(order.deliveryTotalKgs ?? order.delivery_total_kgs)]
      ];
    }

    return [];
  }

  function createOverviewDeliveryField(label, value, className = "") {
    return `
      <div class="pr-field${className ? ` ${className}` : ""}">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value || "—")}</strong>
      </div>
    `;
  }

  function createOverviewForDeliveryCard(order = {}) {
    const deliveryFields = getOverviewDeliverySpecificFields(order);
    const orderId = order.id ?? order.orderId ?? order.order_id ?? "";

    return `
      <article class="pr-record-card delivery-record-card overview-delivery-record-card" data-delivery-order-id="${escapeHTML(orderId)}">
        <div class="pr-record-top">
          <div class="pr-record-title">
            <div class="pr-record-title-line">
              <strong>${escapeHTML(order.item || "—")}</strong>
              <em class="delivery-status-pill for-delivery">For Delivery</em>
            </div>
          </div>

          <div class="pr-due-date">
            <span>Delivery Date</span>
            <strong>${escapeHTML(formatDate(order.deliveryDate || order.delivery_date))}</strong>
          </div>
        </div>

        <div class="pr-record-grid pr-stage-input-grid overview-delivery-card-grid">
          ${createOverviewDeliveryField("P.O. Number", order.poNumber || order.po_number)}
          ${createOverviewDeliveryField("J.O. Number", order.joNumber || order.jo_number)}
          ${createOverviewDeliveryField("Client", order.client)}
          ${createOverviewDeliveryField("Quantity", formatQuantity(order))}
          ${createOverviewDeliveryField("Process", getOverviewDeliveryProcessLabel(order))}
          ${deliveryFields.map(([label, value]) => createOverviewDeliveryField(label, value)).join("")}
          ${createOverviewDeliveryField("Moved To Delivery", formatDateTime(order.movedToDeliveryAt || order.moved_to_delivery_at || order.updatedAt || order.updated_at))}
        </div>
      </article>
    `;
  }

  function todayDateOnly() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getDeliveryAlert(order = {}) {
    const status = normalizeStatus(order.orderStatus || order.order_status || order.status || "");

    /*
      Delivered/cancelled orders should no longer show red/yellow due-date
      calendar markers or notice alerts. Keep their calendar activity as normal
      green only.
    */
    if (status === "delivered" || status === "cancelled") {
      return { type: "", label: "", daysLeft: null };
    }

    const deliveryDate = parseDateOnly(order.deliveryDate || order.delivery_date);
    if (!deliveryDate) return { type: "", label: "", daysLeft: null };

    const daysLeft = Math.ceil((deliveryDate - todayDateOnly()) / (24 * 60 * 60 * 1000));

    if (daysLeft <= 0) {
      return {
        type: "due",
        label: daysLeft === 0 ? "Due today" : "Overdue",
        daysLeft
      };
    }

    if (daysLeft <= 5) {
      return {
        type: "critical",
        label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
        daysLeft
      };
    }

    return { type: "", label: "", daysLeft };
  }


  const productionStageLabels = {
    production: "Production",
    printing: "Printing",
    rewinding: "Rewinding",
    lamination: "Lamination",
    slitting: "Slitting",
    finishing: "Finishing"
  };

  const productionStageStatusLabels = {
    pending: "Pending",
    ongoing: "Ongoing",
    hold: "On Hold",
    completed: "Completed"
  };

  function normalizeProductionStage(stage) {
    return String(stage || "production").trim().toLowerCase();
  }

  function normalizeProductionStageStatus(status) {
    return String(status || "ongoing").trim().toLowerCase();
  }

  const overviewProductionStageOrder = ["printing", "rewinding", "lamination", "slitting", "finishing"];

  function getOverviewProductionStageOrder(stage = "") {
    const normalizedStage = normalizeProductionStage(stage);
    return overviewProductionStageOrder.indexOf(normalizedStage);
  }

  function inferOverviewStageFromText(value = "") {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "";

    return overviewProductionStageOrder.find((stage) => text.includes(stage)) || "";
  }

  function shouldKeepOverviewCompletedStageForCurrentRecord(stageName = "", recordStage = "", recordStatus = "") {
    const completedStage = inferOverviewStageFromText(stageName) || normalizeProductionStage(stageName);
    const currentStage = normalizeProductionStage(recordStage);
    const normalizedStatus = normalizeProductionStageStatus(recordStatus);

    if (!productionStageLabels[completedStage]) return true;
    if (!["pending", "ongoing", "hold"].includes(normalizedStatus)) return true;

    const completedStageOrder = getOverviewProductionStageOrder(completedStage);
    const currentStageOrder = getOverviewProductionStageOrder(currentStage);

    if (completedStageOrder < 0 || currentStageOrder < 0) return true;

    /* Hide stale/future completed-stage messages while an item is still active. */
    return completedStageOrder < currentStageOrder;
  }

  function shouldHideOverviewStaleCompletedHistory(record = {}, history = {}) {
    const recordStatus = normalizeProductionStageStatus(record.status || "");
    if (!["pending", "ongoing", "hold"].includes(recordStatus)) return false;

    const title = String(history.title || "").trim();
    const eventType = String(history.eventType || history.event_type || "").trim().toLowerCase();
    const isCompletedHistory = eventType === "stage-completed" || /completed/i.test(title);
    if (!isCompletedHistory) return false;

    const historyStage = normalizeProductionStage(history.stage || inferOverviewStageFromText(`${title} ${history.description || ""}`));
    if (!productionStageLabels[historyStage]) return false;

    const historyStageOrder = getOverviewProductionStageOrder(historyStage);
    const currentStageOrder = getOverviewProductionStageOrder(record.stage);

    if (historyStageOrder < 0 || currentStageOrder < 0) return false;
    return historyStageOrder >= currentStageOrder;
  }

  function shouldHideOverviewAutoDeliveryFinishingCompletedHistory(item = {}) {
    /* V21: keep Finishing Completed visible, but only once.
       Duplicate removal is handled by getOverviewHistoryItemDedupeKey(). */
    return false;
  }

  function getOverviewHistoryItemDedupeKey(item = {}) {
    const title = String(item.title || "").trim().toLowerCase();
    const description = String(item.description || "").trim().toLowerCase();
    const stage = normalizeProductionStage(item.stage || inferOverviewStageFromText(`${title} ${description}`));

    /* Finishing Completed can come from local history, server history, and synthetic
       completed-stage logic. Keep one global entry only. */
    if (title === "finishing completed" && (stage === "finishing" || description.includes("finishing"))) {
      return "finishing-completed";
    }

    return [
      item.title,
      item.description,
      item.meta,
      item.eventType || item.event_type,
      item.batchLabel || item.batch_label
    ].map((part) => String(part || "").trim().toLowerCase()).join("|");
  }

  function getProductionStageLabel(stage) {
    const normalizedStage = normalizeProductionStage(stage);
    return productionStageLabels[normalizedStage] || normalizedStage.charAt(0).toUpperCase() + normalizedStage.slice(1);
  }

  function getProductionStageStatusLabel(status) {
    const normalizedStatus = normalizeProductionStageStatus(status);
    return productionStageStatusLabels[normalizedStatus] || normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
  }

  function formatOverviewProductionMeters(value) {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return "—";

    return `${numberValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} mts`;
  }

  function getOverviewProductionUserId() {
    const possibleKeys = ["currentUser", "loggedInUser", "activeUser", "username", "user"];

    for (const key of possibleKeys) {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) continue;

      try {
        const parsedValue = JSON.parse(rawValue);
        if (typeof parsedValue === "string" && parsedValue.trim()) return parsedValue.trim();
        if (parsedValue?.username) return String(parsedValue.username).trim();
        if (parsedValue?.name) return String(parsedValue.name).trim();
        if (parsedValue?.id) return String(parsedValue.id).trim();
      } catch (error) {
        if (String(rawValue).trim()) return String(rawValue).trim();
      }
    }

    return "local-user";
  }

  function getOverviewProductionActionHistory(record) {
    const historyKey = String(record?.orderId || record?.productionRecordId || "").trim();
    if (!historyKey) return [];

    try {
      const storageKey = `production-action-history:${getOverviewProductionUserId()}`;
      const parsedValue = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const historyItems = parsedValue?.[historyKey];
      return Array.isArray(historyItems) ? historyItems : [];
    } catch (error) {
      return [];
    }
  }

  function formatOverviewProductionDateTime(value) {
    if (!value) return "—";

    const rawValue = String(value).trim();
    if (!rawValue) return "—";

    if (/[A-Za-z]{3,}/.test(rawValue) && /\d{1,2}:\d{2}/.test(rawValue)) return rawValue;

    const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
    const parsed = new Date(normalizedValue);

    if (Number.isNaN(parsed.getTime())) return rawValue;

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(parsed);
  }

  function normalizeOverviewProductionRecord(record) {
    if (!record) return null;

    const productionRecordId = record.productionRecordId || record.id || record.production_id || "";
    const orderId = record.orderId || record.order_id || "";
    const stage = normalizeProductionStage(record.stage || "production");
    const status = normalizeProductionStageStatus(record.stageStatus || record.stage_status || record.status || "ongoing");
    const unit = record.unit ? ` ${record.unit}` : "";
    const quantityText = `${record.quantity ?? "—"}${unit}`.trim();
    const deliveryDateRaw = record.deliveryDate || record.delivery_date || "";
    const orderCreatedRaw = record.orderCreatedAt || record.order_created_at || record.createdAt || record.created_at || "";
    const updatedAtRaw = record.updatedAt || record.updated_at || record.orderUpdatedAt || record.order_updated_at || "";
    const takenAtRaw = record.takenAt || record.taken_at || "";
    const completedStages = Array.isArray(record.completedStages)
      ? record.completedStages
      : Array.isArray(record.completed_stages)
        ? record.completed_stages
        : [];

    return {
      id: `production:${productionRecordId || orderId}`,
      productionRecordId,
      orderId,
      stage,
      status,
      poNumber: record.poNumber || record.po_number || "—",
      joNumber: record.joNumber || record.jo_number || "—",
      client: record.client || "—",
      item: record.item || "—",
      quantity: quantityText || "—",
      convertedMeters: record.convertedMeters || record.converted_meters || "",
      convertedMetersDisplay: formatOverviewProductionMeters(record.convertedMeters || record.converted_meters),
      printingMaterial: record.printingMaterial || record.printing_material || "—",
      laminationMaterial: record.laminationMaterial || record.lamination_material || "—",
      assignedTo: record.assignedTo || record.assigned_to || "Unassigned",
      assignToRole: normalizeOverviewUserRole(
        record.assignToRole
          || record.assign_to_role
          || record.assignedUserRole
          || record.assigned_user_role
          || record.orderAssignToRole
          || record.order_assign_to_role
          || ""
      ),
      remarks: record.remarks || "—",
      holdReason: record.holdReason || record.hold_reason || "",
      completedStages,
      deliveryDateRaw,
      orderCreatedRaw,
      updatedAtRaw,
      takenAtRaw,
      deliveryDate: formatDate(deliveryDateRaw),
      orderDate: formatDate(orderCreatedRaw),
      dateEntered: formatOverviewProductionDateTime(takenAtRaw || updatedAtRaw || orderCreatedRaw)
    };
  }

  function normalizeOverviewActiveOrderRecord(order) {
    if (!order) return null;

    const unit = order.unit ? ` ${order.unit}` : "";
    const quantityText = `${order.quantity ?? "—"}${unit}`.trim();
    const orderId = order.id || order.orderId || order.order_id || "";
    const deliveryDateRaw = order.deliveryDate || order.delivery_date || "";
    const createdRaw = order.createdAt || order.created_at || "";

    return {
      id: `order:${orderId}`,
      productionRecordId: "",
      orderId,
      stage: "production",
      status: "ongoing",
      poNumber: order.poNumber || order.po_number || "—",
      joNumber: order.joNumber || order.jo_number || "—",
      client: order.client || "—",
      item: order.item || "—",
      quantity: quantityText || "—",
      convertedMeters: "",
      convertedMetersDisplay: "—",
      printingMaterial: order.printingMaterial || order.printing_material || "—",
      laminationMaterial: order.laminationMaterial || order.lamination_material || "—",
      assignedTo: order.assignTo || order.assign_to || "Unassigned",
      assignToRole: normalizeOverviewUserRole(order.assignToRole || order.assign_to_role || ""),
      remarks: "Order is currently active in production.",
      holdReason: "",
      completedStages: ["Issue Order"],
      deliveryDateRaw,
      orderCreatedRaw: createdRaw,
      updatedAtRaw: order.updatedAt || order.updated_at || createdRaw,
      takenAtRaw: "",
      deliveryDate: formatDate(deliveryDateRaw),
      orderDate: formatDate(createdRaw),
      dateEntered: formatOverviewProductionDateTime(order.updatedAt || order.updated_at || createdRaw)
    };
  }

  function getOverviewProductionBatchLabel(record) {
    const providedLabel = String(
      record?.overviewBatchLabel
      || record?.batchLabel
      || record?.displayBatchLabel
      || ""
    ).trim();

    if (providedLabel) return providedLabel;

    const batchNumber = Number(record?.batchNumber || record?.partialBatchNumber || record?.productionBatchNumber || 0);
    return Number.isFinite(batchNumber) && batchNumber > 0 ? `Batch ${Math.floor(batchNumber)}` : "";
  }

  function normalizeOverviewProductionStatusModuleRecord(record) {
    if (!record) return null;

    const stage = normalizeProductionStage(record.stage || "production");
    const status = normalizeProductionStageStatus(record.status || record.stageStatus || "pending");
    const productionRecordId = record.productionRecordId || record.partialRecordId || record.id || "";
    const orderId = record.orderId || "";
    const deliveryDateRaw = record.deliveryDateValue || record.deliveryDateRaw || record.deliveryDate || "";
    const orderCreatedRaw = record.orderCreatedAtValue || record.orderCreatedRaw || record.orderDate || "";
    const updatedAtRaw = record.productionUpdatedAtValue || record.updatedAtRaw || record.updatedAtDisplay || record.updatedAt || "";
    const rawTakenAtValue = record.takenAtValue || record.takenAtRaw || "";
    const takenAtRaw = status === "pending" ? "" : rawTakenAtValue;
    const metersValue = record.convertedMeters || record.balanceMeters || record.startingMeters || record.lastProducedMeters || "";
    const convertedMetersDisplay = record.convertedMetersDisplay || record.balanceMetersDisplay || record.startingMetersDisplay || record.lastProducedMetersDisplay || formatOverviewProductionMeters(metersValue);
    const overviewBatchLabel = getOverviewProductionBatchLabel(record);

    return {
      id: `production-status:${record.id || productionRecordId || orderId}:${stage}:${status}:${overviewBatchLabel || "main"}`,
      sourceRecordId: record.id || productionRecordId || orderId,
      overviewSourceType: "production-status",
      productionRecordId,
      orderId,
      stage,
      status,
      poNumber: record.poNumber || "—",
      joNumber: record.joNumber || "—",
      client: record.client || "—",
      item: record.item || "—",
      quantity: record.quantity || "—",
      convertedMeters: metersValue,
      convertedMetersDisplay: convertedMetersDisplay || "—",
      printingMaterial: record.printingMaterial || "—",
      laminationMaterial: record.laminationMaterial || "—",
      assignedTo: record.assignedTo || "Unassigned",
      assignToRole: normalizeOverviewUserRole(
        record.assignToRole
          || record.assign_to_role
          || record.assignedUserRole
          || record.assigned_user_role
          || record.orderAssignToRole
          || record.order_assign_to_role
          || ""
      ),
      remarks: record.remarks || "Current production status.",
      holdReason: record.holdReason || "",
      completedStages: Array.isArray(record.completedStages) ? record.completedStages : [],
      actionHistory: Array.isArray(record.actionHistory) ? record.actionHistory : [],
      batchLabel: overviewBatchLabel,
      overviewBatchLabel,
      sourceBatchSummary: record.sourceBatchSummary || "",
      sourceBatchDetailsText: record.sourceBatchDetailsText || "",
      sourceBatchDetails: Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [],
      groupedSourceLabel: record.groupedSourceLabel || record.partialSourceLabel || "",
      displayBatchLabel: record.displayBatchLabel || record.batchLabel || overviewBatchLabel || "",
      partialKind: record.partialKind || "",
      sourceType: record.sourceType || "",
      startingMeters: record.startingMeters || "",
      startingMetersDisplay: record.startingMetersDisplay || "",
      balanceMeters: record.balanceMeters || "",
      balanceMetersDisplay: record.balanceMetersDisplay || "",
      originalStageMeters: record.originalStageMeters || "",
      originalStageMetersDisplay: record.originalStageMetersDisplay || "",
      lastProducedMeters: record.lastProducedMeters || "",
      lastWasteMeters: record.lastWasteMeters || "",
      deliveryDateRaw,
      orderCreatedRaw,
      updatedAtRaw,
      takenAtRaw,
      deliveryDate: record.deliveryDate || formatDate(deliveryDateRaw),
      orderDate: record.orderDate || formatOverviewProductionDateTime(orderCreatedRaw),
      dateEntered: record.dateEntered || formatOverviewProductionDateTime(takenAtRaw || updatedAtRaw || orderCreatedRaw)
    };
  }

  function getOverviewProductionStatusListSourceRecords() {
    const statusListProvider = window.getProductionStatusListRecords;
    const legacyProvider = window.getProductionStatusOverviewRecords;

    const sourceRecords = typeof statusListProvider === "function"
      ? statusListProvider({ status: "all" })
      : Array.isArray(window.productionStatusListRecords)
        ? window.productionStatusListRecords
        : typeof legacyProvider === "function"
          ? legacyProvider({ status: "all" })
          : Array.isArray(window.productionStatusOverviewRecords)
            ? window.productionStatusOverviewRecords
            : [];

    return Array.isArray(sourceRecords) ? sourceRecords : [];
  }

  function getOverviewUnifiedProductionSourceRecords() {
    const sourceRecords = getOverviewProductionStatusListSourceRecords();

    if (!Array.isArray(sourceRecords) || !sourceRecords.length) return [];

    return sourceRecords
      .map(normalizeOverviewProductionStatusModuleRecord)
      .filter(Boolean);
  }

  function hasOverviewUnifiedProductionSource() {
    return typeof window.getProductionStatusListRecords === "function"
      || Array.isArray(window.productionStatusListRecords)
      || typeof window.getProductionStatusOverviewRecords === "function"
      || Array.isArray(window.productionStatusOverviewRecords);
  }

  function getOverviewProductionStatusModuleRecords() {
    return getOverviewUnifiedProductionSourceRecords();
  }


  function shouldShowOverviewActiveRecord(record) {
    if (!record) return false;

    const status = normalizeProductionStageStatus(record.status || record.stageStatus || record.stage_status);
    const sourceType = String(record.sourceType || record.overviewSourceType || "").trim().toLowerCase();

    /* Special rule: Active Orders mirrors Production.
       Exclude only raw Orders pending items that have not been taken by Production yet.
       Keep Production-stage pending items because they are already inside the production workflow. */
    if (status === "completed") return false;
    if (sourceType === "orders-pending" || sourceType === "order-pending" || sourceType === "orders_pending") return false;

    return true;
  }

  function getActiveOverviewProductionRecords() {
    const hasUnifiedSource = hasOverviewUnifiedProductionSource();
    const unifiedRecords = getOverviewUnifiedProductionSourceRecords()
      .filter(shouldShowOverviewActiveRecord);

    /* Use the Production Status source once it has real records.
       If that source is registered but still empty while Production is loading,
       fall back to the database snapshot so Active Orders does not disappear. */
    if (hasUnifiedSource && unifiedRecords.length > 0) {
      return sortProductionRecordsRecentFirst(unifiedRecords);
    }

    const records = state.productionRecords
      .map(normalizeOverviewProductionRecord)
      .filter(shouldShowOverviewActiveRecord);

    const recordOrderIds = new Set(records.map((record) => String(record.orderId || "")).filter(Boolean));
    const fallbackOrders = getOrdersByStatus("production")
      .filter((order) => !recordOrderIds.has(String(order.id || order.orderId || order.order_id || "")))
      .map(normalizeOverviewActiveOrderRecord)
      .filter(shouldShowOverviewActiveRecord);

    return sortProductionRecordsRecentFirst([...records, ...fallbackOrders]);
  }

  function getOverviewProductionDeliveryAlert(record) {
    const alert = getDeliveryAlert({ deliveryDate: record.deliveryDateRaw });

    if (alert.type === "due") {
      return {
        type: alert.daysLeft < 0 ? "overdue" : "due-today",
        label: alert.label,
        cardClass: "pr-alert-due",
        boxClass: "pr-due-alert",
        pillClass: "due"
      };
    }

    if (alert.type === "critical") {
      return {
        type: "critical",
        label: alert.label,
        cardClass: "pr-alert-critical",
        boxClass: "pr-critical-alert",
        pillClass: "critical"
      };
    }

    return { type: "", label: "", cardClass: "", boxClass: "", pillClass: "" };
  }

  function createOverviewProductionStatusPill(record) {
    const stage = normalizeProductionStage(record.stage);
    const status = normalizeProductionStageStatus(record.status);
    const stageClass = productionStageLabels[stage]
      ? `pr-stage-status-${stage}`
      : `pr-status-${status}`;

    return `<em class="pr-status-pill ${escapeHTML(stageClass)}">${escapeHTML(getProductionStageLabel(stage))} • ${escapeHTML(getProductionStageStatusLabel(status))}</em>`;
  }

  function getOverviewActiveCardMeters(record) {
    const metersText = String(record?.convertedMetersDisplay || "").trim();
    if (metersText && metersText !== "—") return metersText;

    const quantityText = String(record?.quantity || "").trim();
    return quantityText || "—";
  }

  function createOverviewActiveOrderCard(record) {
    const deliveryAlert = getOverviewProductionDeliveryAlert(record);
    const alertCardClass = deliveryAlert.cardClass ? ` ${deliveryAlert.cardClass}` : "";
    const alertBoxClass = deliveryAlert.boxClass ? ` ${deliveryAlert.boxClass}` : "";

    return `
      <article class="pr-record-card pr-production-status-card overview-active-production-card${alertCardClass}" data-overview-active-record-id="${escapeHTML(record.id)}" data-pr-alert="${escapeHTML(deliveryAlert.type)}" role="button" tabindex="0" aria-label="View details for ${escapeHTML(record.item)}">
        <div class="pr-record-top">
          <div class="pr-record-title">
            <div class="pr-record-title-line">
              <strong>${escapeHTML(record.item)}</strong>
            </div>
          </div>

          <div class="pr-due-date${alertBoxClass}">
            <span>Delivery Date</span>
            <strong>${escapeHTML(record.deliveryDate)}</strong>
            ${deliveryAlert.label ? `<em class="pr-delivery-alert-pill ${escapeHTML(deliveryAlert.pillClass)}">${escapeHTML(deliveryAlert.label)}</em>` : ""}
          </div>
        </div>

        <div class="pr-record-grid pr-production-status-grid overview-active-card-grid">
          <div class="pr-field pr-current-status-field">
            <span>Status</span>
            <strong>${createOverviewProductionStatusPill(record)}</strong>
          </div>
          <div class="pr-field">
            <span>PO Number</span>
            <strong>${escapeHTML(record.poNumber)}</strong>
          </div>
          <div class="pr-field">
            <span>JO Number</span>
            <strong>${escapeHTML(record.joNumber)}</strong>
          </div>
          <div class="pr-field">
            <span>Client</span>
            <strong>${escapeHTML(record.client)}</strong>
          </div>
          <div class="pr-field">
            <span>Assigned To</span>
            <strong>${escapeHTML(record.assignedTo)}</strong>
          </div>
          <div class="pr-field">
            <span>Meters</span>
            <strong>${escapeHTML(getOverviewActiveCardMeters(record))}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function getOverviewActiveRecordById(recordId) {
    return getActiveOverviewProductionRecords().find((record) => record.id === recordId) || null;
  }

  function parseOverviewProductionHistorySortTime(value = "") {
    const rawValue = String(value || "").trim();
    if (!rawValue) return 0;

    const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function normalizeOverviewHistorySourceBatchDetails(sourceBatches = []) {
    if (!Array.isArray(sourceBatches)) return [];

    return sourceBatches
      .filter((source) => source && typeof source === "object")
      .map((source, index) => {
        const rawLabel = String(source.label || source.batchLabel || `Batch ${index + 1}`).trim();
        const labelMatch = rawLabel.match(/Batch\s*(\d+)/i);
        const label = labelMatch ? `Batch ${Number(labelMatch[1]) || labelMatch[1]}` : rawLabel;
        const meters = Number(source.meters || 0) || 0;
        const metersDisplay = String(source.metersDisplay || "").trim()
          || (meters > 0 ? formatOverviewProductionMeters(meters) : "");

        return {
          ...source,
          label,
          meters,
          metersDisplay
        };
      })
      .filter((source) => String(source.label || "").trim())
      .sort((left, right) => {
        const leftBatch = getOverviewBatchSortNumberFromText(left.label);
        const rightBatch = getOverviewBatchSortNumberFromText(right.label);

        if (leftBatch > 0 && rightBatch > 0 && leftBatch !== rightBatch) return leftBatch - rightBatch;
        if (leftBatch > 0 && rightBatch <= 0) return -1;
        if (rightBatch > 0 && leftBatch <= 0) return 1;

        return String(left.label || "").localeCompare(String(right.label || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        });
      });
  }

  function extractOverviewHistoryOperators(description = "") {
    const match = String(description || "").match(/Operator\/s:\s*([^.]*)/i);
    return match?.[1]?.trim() || "";
  }

  function extractOverviewBatchLabelFromText(value = "") {
    const match = String(value || "").match(/\bBatch\s*(\d+)\b/i);
    return match ? `Batch ${Number(match[1]) || match[1]}` : "";
  }

  function cleanOverviewProductionHistoryDescription(description = "", item = {}) {
    let text = String(description || "")
      .replace(/^\s*Batch\s*\d+\s*[.•:-]?\s*/i, "")
      .replace(/\s*Operator\/s:\s*[^.]*\.?/gi, "")
      .replace(/\s*Printing Material:\s*[^.]*\.?/gi, "")
      .replace(/\s*Lamination Material:\s*[^.]*\.?/gi, "")
      .replace(/\s*Materials?:\s*[^.]*\.?/gi, "")
      .replace(/\s*Original meters:\s*[^.]*\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const groupedMatch = text.match(/Grouped from\s+([^:]+):.*?Total available(?: meters)?:\s*([^.]+)\.?/i);
    if (groupedMatch) {
      const sourceStageLabel = groupedMatch[1]?.trim() || "previous stage";
      const totalMetersText = groupedMatch[2]?.trim() || "";
      const targetStageLabel = item?.stage ? getProductionStageLabel(item.stage) : "this stage";

      text = `Multiple ${sourceStageLabel} outputs were combined and are ready for ${targetStageLabel}.`;
      if (totalMetersText) text += ` Total available: ${totalMetersText}.`;
    }

    return text;
  }

  function getOverviewHistoryDisplayTitle(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = String(item.title || "").trim();
    const description = String(item.description || "").trim();

    if (
      eventType === "batches-combined"
      || /container/i.test(title)
      || /^Grouped from/i.test(description)
    ) {
      return "Batches Combined";
    }

    return title;
  }

  function getOverviewHistoryBatchLabel(item = {}) {
    const storedBatchLabel = String(item.batchLabel || item.batch_label || "").trim();
    if (storedBatchLabel) {
      const match = storedBatchLabel.match(/Batch\s*(\d+)/i);
      return match ? `Batch ${Number(match[1]) || match[1]}` : storedBatchLabel;
    }

    return extractOverviewBatchLabelFromText(`${item.title || ""} ${item.description || ""}`);
  }

  function getOverviewBatchSortNumberFromText(value = "") {
    const match = String(value || "").match(/\bBatch\s*#?\s*(\d+)\b|(?:^|[\s._-])B\s*0*(\d+)\b/i);
    const number = match ? Number(match[1] || match[2] || 0) : 0;
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function getOverviewHistoryBatchSortNumber(item = {}) {
    const directNumber = getOverviewBatchSortNumberFromText(getOverviewHistoryBatchLabel(item));
    if (directNumber > 0) return directNumber;

    return getOverviewBatchSortNumberFromText(`${item.title || ""} ${item.description || ""}`);
  }

  function getOverviewHistoryBatchOrderGroup(item = {}) {
    const displayTitle = getOverviewHistoryDisplayTitle(item).trim().toLowerCase();
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const stage = normalizeProductionStage(item.stage || "");
    return [stage, eventType || displayTitle].join("|");
  }

  function getOverviewHistoryStageSortOffset(stage = "") {
    const index = getOverviewProductionStageOrder(stage);
    return index >= 0 ? (index + 1) * 100 : 0;
  }

  function getOverviewCombinedHistorySourceStageIdForSort(item = {}) {
    const sourceBatches = normalizeOverviewHistorySourceBatchDetails(item.sourceBatches);

    for (const source of sourceBatches) {
      const directStage = normalizeProductionStage(source?.sourceStageId || source?.sourceStage || "");
      if (overviewProductionStageOrder.includes(directStage)) return directStage;
    }

    const targetStage = normalizeProductionStage(item.stage || "");
    const targetIndex = overviewProductionStageOrder.indexOf(targetStage);
    if (targetIndex > 0) return overviewProductionStageOrder[targetIndex - 1];

    const textStage = inferOverviewStageFromText(`${item.title || ""} ${item.description || ""}`);
    return textStage || targetStage;
  }

  function getOverviewHistoryStageIdForSort(item = {}) {
    const stage = normalizeProductionStage(item.stage || "");
    if (overviewProductionStageOrder.includes(stage)) return stage;

    return inferOverviewStageFromText(`${item.title || ""} ${item.description || ""}`) || stage;
  }

  function getOverviewHistoryOrderRank(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = getOverviewHistoryDisplayTitle(item).trim().toLowerCase();
    const description = String(item.description || "").trim().toLowerCase();
    const isCombinedHistory = eventType === "batches-combined" || title === "batches combined" || description.includes("combined");
    const stageId = isCombinedHistory
      ? getOverviewCombinedHistorySourceStageIdForSort(item)
      : getOverviewHistoryStageIdForSort(item);
    const stageOffset = getOverviewHistoryStageSortOffset(stageId);

    if (title === "issue order") return 10;
    if (title === "waiting for take order") return 20;
    if (eventType === "take-order" || title === "take order") return getOverviewHistoryStageSortOffset("printing") + 20;
    if (eventType === "balance-created" || title.includes("balance")) return stageOffset + 15;
    if (eventType === "stage-started" || title.startsWith("start ")) return stageOffset + 20;
    if (title.includes("on-going") || title.includes("ongoing") || description.includes("in progress") || description.includes("currently ongoing")) return stageOffset + 25;
    if (eventType === "stage-hold" || title.startsWith("hold ")) return stageOffset + 30;
    if (eventType === "stage-resumed" || title.startsWith("resume ")) return stageOffset + 35;
    if (eventType === "moved-to-delivery" || title.includes("moved to delivery") || title.includes("move to delivery")) return getOverviewHistoryStageSortOffset("finishing") + 80;
    if (eventType === "delivered" || eventType === "item-delivered" || title.includes("item delivered") || title === "delivered order") return getOverviewHistoryStageSortOffset("finishing") + 90;
    if (eventType === "stage-completed" || title.includes(" completed")) return stageOffset + 60;
    if (isCombinedHistory) return stageOffset + 70;
    if (title.includes("pending") || description.includes("waiting to start")) return stageOffset + 90;
    if (title === "production completed") return 9990;

    return stageOffset + 50;
  }


  function formatOverviewCombinedBatchLineDetail(source = {}) {
    const label = String(source.label || source.batchLabel || "").trim();
    const metersDisplay = String(source.metersDisplay || "").trim()
      || (Number(source.meters || 0) > 0 ? formatOverviewProductionMeters(source.meters) : "");

    if (!label && !metersDisplay) return "";
    if (label && metersDisplay) return `${label} (${metersDisplay})`;
    return label || metersDisplay;
  }

  function normalizeOverviewHistoryItem(item = {}, fallbackRecord = {}) {
    const title = String(item.title || "").trim();
    if (!title) return null;

    const stage = normalizeProductionStage(item.stage || fallbackRecord.stage || "production");
    const metaRaw = String(item.meta || item.createdAt || item.created_at || "").trim();
    const description = String(item.description || "").trim();

    return {
      id: item.id || "",
      title,
      description,
      meta: formatOverviewProductionDateTime(metaRaw),
      _sortTime: parseOverviewProductionHistorySortTime(metaRaw),
      stage,
      status: String(item.status || item.stageStatus || item.stage_status || "").trim(),
      eventType: String(item.eventType || item.event_type || "").trim(),
      operators: String(item.operators || extractOverviewHistoryOperators(description) || "").trim(),
      meters: Number(item.meters || 0) || "",
      wasteMeters: Number(item.wasteMeters || item.waste_meters || 0) || "",
      batchLabel: String(item.batchLabel || item.batch_label || "").trim(),
      sourceBatches: normalizeOverviewHistorySourceBatchDetails(item.sourceBatches)
    };
  }

  function getOverviewProductionHistoryItems(record) {
    const historyItems = [];
    const addHistory = (title, description, meta = "", details = {}) => {
      const cleanTitle = String(title || "").trim();
      const cleanDescription = String(description || "").trim();
      const cleanMeta = String(meta || "").trim();

      if (!cleanTitle) return;
      if (shouldHideOverviewAutoDeliveryFinishingCompletedHistory({
        title: cleanTitle,
        description: cleanDescription,
        meta: cleanMeta,
        stage: details.stage || record.stage,
        eventType: details.eventType || ""
      })) return;

      const rawItem = {
        ...details,
        title: cleanTitle,
        description: cleanDescription,
        meta: cleanMeta,
        stage: details.stage || record.stage,
        operators: details.operators || extractOverviewHistoryOperators(cleanDescription)
      };
      const normalizedItem = normalizeOverviewHistoryItem(rawItem, record);
      if (!normalizedItem) return;

      const dedupeKey = getOverviewHistoryItemDedupeKey(normalizedItem);

      if (historyItems.some((item) => item._dedupeKey === dedupeKey)) return;
      historyItems.push({ ...normalizedItem, _dedupeKey: dedupeKey, _index: historyItems.length });
    };

    addHistory(
      "Issue Order",
      "Order was issued and entered the production queue.",
      record.orderCreatedRaw,
      { stage: record.stage }
    );

    const actionHistory = Array.isArray(record.actionHistory) && record.actionHistory.length
      ? record.actionHistory
      : getOverviewProductionActionHistory(record);

    const actionHistoryItems = actionHistory
      .map((history) => normalizeOverviewHistoryItem(history, record))
      .filter(Boolean)
      .filter((history) => !shouldHideOverviewAutoDeliveryFinishingCompletedHistory(history))
      .filter((history) => !shouldHideOverviewStaleCompletedHistory(record, history));

    const actionHistoryTitles = new Set(
      actionHistoryItems
        .map((history) => String(history.title || "").trim().toLowerCase())
        .filter(Boolean)
    );

    const recordStage = normalizeProductionStage(record.stage || "production");
    const recordStatus = normalizeProductionStageStatus(record.status || "");
    const shouldAddSyntheticTakeOrder = Boolean(
      record.takenAtRaw
      && recordStage === "printing"
      && recordStatus !== "pending"
      && !actionHistoryTitles.has("take order")
    );

    if (shouldAddSyntheticTakeOrder) {
      addHistory(
        "Take Order",
        "Order was taken for Printing.",
        record.takenAtRaw,
        { stage: "printing", status: "ongoing" }
      );
    }

    actionHistoryItems.forEach((history) => {
      const dedupeKey = getOverviewHistoryItemDedupeKey(history);
      if (historyItems.some((item) => item._dedupeKey === dedupeKey)) return;
      historyItems.push({ ...history, _dedupeKey: dedupeKey, _index: historyItems.length });
    });

    const completedStages = Array.isArray(record.completedStages) ? record.completedStages : [];
    completedStages
      .filter((stageName) => String(stageName || "").trim() && String(stageName).trim().toLowerCase() !== "issue order")
      .filter((stageName) => normalizeProductionStage(stageName) !== "finishing")
      .filter((stageName) => shouldKeepOverviewCompletedStageForCurrentRecord(stageName, record.stage, record.status))
      .forEach((stageName) => {
        const cleanStageName = String(stageName).trim();
        const completedTitle = `${cleanStageName} Completed`;
        if (actionHistoryTitles.has(completedTitle.toLowerCase())) return;

        addHistory(
          completedTitle,
          `${cleanStageName} stage was completed.`,
          record.updatedAtRaw || record.takenAtRaw,
          { stage: normalizeProductionStage(cleanStageName) }
        );
      });

    addHistory(
      `${getProductionStageLabel(record.stage)} ${getProductionStageStatusLabel(record.status)}`,
      record.status === "hold"
        ? `${getProductionStageLabel(record.stage)} is currently on hold.`
        : record.status === "pending"
          ? `${getProductionStageLabel(record.stage)} is waiting to start.`
          : `${getProductionStageLabel(record.stage)} is currently ongoing.`,
      record.updatedAtRaw || record.takenAtRaw || record.orderCreatedRaw,
      { stage: record.stage, status: record.status }
    );

    return historyItems
      .filter((historyItem) => !shouldHideOverviewAutoDeliveryFinishingCompletedHistory(historyItem))
      .sort((a, b) => {
        const rankA = getOverviewHistoryOrderRank(a);
        const rankB = getOverviewHistoryOrderRank(b);
        const batchA = getOverviewHistoryBatchSortNumber(a);
        const batchB = getOverviewHistoryBatchSortNumber(b);
        const batchOrderGroupA = getOverviewHistoryBatchOrderGroup(a);
        const batchOrderGroupB = getOverviewHistoryBatchOrderGroup(b);

        if (rankA !== rankB) return rankA - rankB;

        if (batchA > 0 && batchB > 0 && batchOrderGroupA === batchOrderGroupB && batchA !== batchB) {
          return batchA - batchB;
        }

        if (a._sortTime !== b._sortTime) return a._sortTime - b._sortTime;
        return (a._index || 0) - (b._index || 0);
      })
      .map(({ _dedupeKey, _index, _sortTime, ...historyItem }) => historyItem);
  }

  function isOverviewCombinedHistoryItem(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = getOverviewHistoryDisplayTitle(item).trim().toLowerCase();
    return eventType === "batches-combined" || title === "batches combined";
  }

  function areOverviewNestedBatchLabelsSame(leftLabel = "", rightLabel = "") {
    const leftNumber = getOverviewBatchSortNumberFromText(leftLabel);
    const rightNumber = getOverviewBatchSortNumberFromText(rightLabel);

    if (leftNumber > 0 && rightNumber > 0) return leftNumber === rightNumber;

    const leftText = String(leftLabel || "").trim().toLowerCase();
    const rightText = String(rightLabel || "").trim().toLowerCase();

    return Boolean(leftText && rightText && leftText === rightText);
  }

  function getOverviewCombinedSourceLabel(source = {}, index = 0) {
    const rawLabel = String(source.label || source.batchLabel || `Batch ${index + 1}`).trim();
    const labelMatch = rawLabel.match(/Batch\s*(\d+)/i);
    return labelMatch ? `Batch ${Number(labelMatch[1]) || labelMatch[1]}` : rawLabel;
  }

  function getOverviewCombinedSourceStageId(combinedItem = {}, source = {}) {
    const directStage = normalizeProductionStage(source.sourceStageId || source.sourceStage || "");
    if (overviewProductionStageOrder.includes(directStage)) return directStage;

    const combinedStage = normalizeProductionStage(combinedItem.stage || "");
    const combinedIndex = overviewProductionStageOrder.indexOf(combinedStage);
    if (combinedIndex > 0) return overviewProductionStageOrder[combinedIndex - 1];

    return normalizeProductionStage(combinedItem.stage || "");
  }

  function getOverviewCombinedSplitTitle(combinedItem = {}, sources = []) {
    const firstSource = Array.isArray(sources) && sources.length ? sources[0] : {};
    const sourceStageId = getOverviewCombinedSourceStageId(combinedItem, firstSource);
    const sourceStageLabel = getProductionStageLabel(sourceStageId || getOverviewHistoryStageIdForSort(combinedItem));

    return `Split during ${sourceStageLabel || "Stage"}`;
  }

  function getOverviewCombinedBatchNestedItems(combinedItem = {}, source = {}, sourceIndex = 0, allHistoryItems = []) {
    const expectedLabel = getOverviewCombinedSourceLabel(source, sourceIndex);
    const sourceStageId = getOverviewCombinedSourceStageId(combinedItem, source);

    const exactStageItems = allHistoryItems.filter((historyItem) => {
      if (!historyItem || isOverviewCombinedHistoryItem(historyItem)) return false;

      const batchLabel = getOverviewHistoryBatchLabel(historyItem);
      if (!batchLabel || !areOverviewNestedBatchLabelsSame(batchLabel, expectedLabel)) return false;

      const itemStageId = normalizeProductionStage(historyItem.stage || "");
      return sourceStageId ? itemStageId === sourceStageId : true;
    });

    const fallbackItems = exactStageItems.length ? exactStageItems : allHistoryItems.filter((historyItem) => {
      if (!historyItem || isOverviewCombinedHistoryItem(historyItem)) return false;

      const batchLabel = getOverviewHistoryBatchLabel(historyItem);
      return Boolean(batchLabel && areOverviewNestedBatchLabelsSame(batchLabel, expectedLabel));
    });

    const seen = new Set();
    return fallbackItems.filter((historyItem) => {
      const key = [
        getOverviewHistoryDisplayTitle(historyItem),
        historyItem.description || "",
        historyItem.meta || "",
        historyItem.stage || "",
        historyItem.eventType || ""
      ].join("|").toLowerCase();

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function shouldHideOverviewHistoryItemInsideCombinedBatches(item = {}, combinedItems = []) {
    if (!combinedItems.length || !item || isOverviewCombinedHistoryItem(item)) return false;

    const itemBatchLabel = getOverviewHistoryBatchLabel(item);
    if (!itemBatchLabel) return false;

    const itemStageId = normalizeProductionStage(item.stage || "");

    return combinedItems.some((combinedItem) => {
      const sources = normalizeOverviewHistorySourceBatchDetails(
        Array.isArray(combinedItem.sourceBatches) && combinedItem.sourceBatches.length
          ? combinedItem.sourceBatches
          : []
      );

      return sources.some((source, index) => {
        const expectedLabel = getOverviewCombinedSourceLabel(source, index);
        if (!areOverviewNestedBatchLabelsSame(itemBatchLabel, expectedLabel)) return false;

        const sourceStageId = getOverviewCombinedSourceStageId(combinedItem, source);
        return sourceStageId ? itemStageId === sourceStageId : true;
      });
    });
  }

  function createOverviewCompactNestedHistoryItemHTML(item = {}) {
    const operators = String(item.operators || extractOverviewHistoryOperators(item.description) || "").trim();
    const cleanDescription = cleanOverviewProductionHistoryDescription(item.description, item);
    const displayTitle = getOverviewHistoryDisplayTitle(item);
    const meters = Number(item.meters || 0);
    const wasteMeters = Number(item.wasteMeters || 0);
    const historyTags = [
      operators ? `<small class="operator-tag">Operator/s · ${escapeHTML(operators)}</small>` : "",
      meters > 0 ? `<small class="meters-tag">Meters · ${escapeHTML(formatOverviewProductionMeters(meters))}</small>` : "",
      wasteMeters > 0 ? `<small class="waste-tag">Waste · ${escapeHTML(formatOverviewProductionMeters(wasteMeters))}</small>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="pr-combined-batch-nested-item">
        <strong>${escapeHTML(displayTitle)}</strong>
        ${cleanDescription ? `<span>${escapeHTML(cleanDescription)}</span>` : ""}
        ${historyTags ? `<div class="pr-history-tags">${historyTags}</div>` : ""}
        ${item.meta ? `<time>${escapeHTML(item.meta)}</time>` : ""}
      </article>
    `;
  }

  function createOverviewCombinedBatchNestedHistoryHTML(record, combinedItem = {}, allHistoryItems = []) {
    const sources = normalizeOverviewHistorySourceBatchDetails(
      Array.isArray(combinedItem.sourceBatches) && combinedItem.sourceBatches.length
        ? combinedItem.sourceBatches
        : (Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [])
    );

    if (sources.length < 2) return "";

    const batchSections = sources.map((source, index) => {
      const label = getOverviewCombinedSourceLabel(source, index);
      const items = getOverviewCombinedBatchNestedItems(combinedItem, source, index, allHistoryItems);
      const metersDisplay = String(source.metersDisplay || "").trim()
        || (Number(source.meters || 0) > 0 ? formatOverviewProductionMeters(source.meters) : "");

      if (!items.length) return "";

      return `
        <section class="pr-combined-batch-group">
          <header>
            <strong>${escapeHTML(label)}</strong>
            ${metersDisplay ? `<span>${escapeHTML(metersDisplay)}</span>` : ""}
          </header>
          <div class="pr-combined-batch-group-list">
            ${items.map(createOverviewCompactNestedHistoryItemHTML).join("")}
          </div>
        </section>
      `;
    }).filter(Boolean).join("");

    if (!batchSections) return "";

    const cleanDescription = cleanOverviewProductionHistoryDescription(combinedItem.description, combinedItem);
    const combinedBatchDetails = sources
      .map((source) => formatOverviewCombinedBatchLineDetail(source))
      .filter(Boolean);
    const combinedBatchLine = combinedBatchDetails.length
      ? `Combined · ${combinedBatchDetails.join(" + ")}`
      : "";
    const meters = Number(combinedItem.meters || 0);
    const combinedTags = [
      combinedBatchLine ? `<small class="combined-tag">${escapeHTML(combinedBatchLine)}</small>` : "",
      meters > 0 ? `<small class="meters-tag">Meters · ${escapeHTML(formatOverviewProductionMeters(meters))}</small>` : ""
    ].filter(Boolean).join("");

    return `
      <div class="pr-combined-batch-history">
        ${batchSections}
        <article class="pr-combined-batch-final-item">
          <strong>Batches Combined</strong>
          ${cleanDescription ? `<span>${escapeHTML(cleanDescription)}</span>` : ""}
          ${combinedTags ? `<div class="pr-history-tags">${combinedTags}</div>` : ""}
          ${combinedItem.meta ? `<time>${escapeHTML(combinedItem.meta)}</time>` : ""}
        </article>
      </div>
    `;
  }

  function createOverviewProductionHistoryTimelineItemHTML(record, item = {}, allHistoryItems = []) {
    const operators = String(item.operators || extractOverviewHistoryOperators(item.description) || "").trim();
    const cleanDescription = cleanOverviewProductionHistoryDescription(item.description, item);
    const displayTitle = getOverviewHistoryDisplayTitle(item);
    const meters = Number(item.meters || 0);
    const wasteMeters = Number(item.wasteMeters || 0);
    const batchLabel = getOverviewHistoryBatchLabel(item);
    const isCombinedHistory = isOverviewCombinedHistoryItem(item);
    const combinedSourceBatches = normalizeOverviewHistorySourceBatchDetails(
      Array.isArray(item.sourceBatches) && item.sourceBatches.length
        ? item.sourceBatches
        : (isCombinedHistory && Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [])
    );
    const combinedBatchDetails = isCombinedHistory
      ? combinedSourceBatches
          .map((source) => formatOverviewCombinedBatchLineDetail(source))
          .filter(Boolean)
      : [];
    const combinedBatchLine = combinedBatchDetails.length
      ? `Combined · ${combinedBatchDetails.join(" + ")}`
      : "";
    const batchHistoryClass = batchLabel ? " is-batch-history" : "";
    const nestedBatchHistory = isCombinedHistory
      ? createOverviewCombinedBatchNestedHistoryHTML(record, item, allHistoryItems)
      : "";
    const cardTitle = isCombinedHistory ? getOverviewCombinedSplitTitle(item, combinedSourceBatches) : displayTitle;
    const cardDescription = isCombinedHistory ? "" : cleanDescription;
    const cardMeta = isCombinedHistory ? "" : item.meta;

    return `
      <article class="pr-history-item${isCombinedHistory ? " is-combined-history" : ""}${batchHistoryClass}">
        <i></i>
        <div class="pr-history-card">
          <div class="pr-history-title-row">
            <strong>${escapeHTML(cardTitle)}</strong>
          </div>
          ${cardDescription ? `<span>${escapeHTML(cardDescription)}</span>` : ""}
          ${(() => {
            const historyTags = [
              !isCombinedHistory && operators ? `<small class="operator-tag">Operator/s · ${escapeHTML(operators)}</small>` : "",
              !isCombinedHistory && combinedBatchLine ? `<small class="combined-tag">${escapeHTML(combinedBatchLine)}</small>` : "",
              !isCombinedHistory && meters > 0 ? `<small class="meters-tag">Meters · ${escapeHTML(formatOverviewProductionMeters(meters))}</small>` : "",
              !isCombinedHistory && wasteMeters > 0 ? `<small class="waste-tag">Waste · ${escapeHTML(formatOverviewProductionMeters(wasteMeters))}</small>` : "",
              !isCombinedHistory && batchLabel ? `<small class="batch-tag">${escapeHTML(batchLabel)}</small>` : ""
            ].filter(Boolean).join("");

            return historyTags ? `<div class="pr-history-tags">${historyTags}</div>` : "";
          })()}
          ${nestedBatchHistory}
          ${cardMeta ? `<time>${escapeHTML(cardMeta)}</time>` : ""}
        </div>
      </article>
    `;
  }

  function createOverviewProductionHistoryHTML(record) {
    const rawHistoryItems = getOverviewProductionHistoryItems(record);
    if (!rawHistoryItems.length) return "";

    const combinedHistoryItems = rawHistoryItems.filter(isOverviewCombinedHistoryItem);
    const historyItems = combinedHistoryItems.length
      ? rawHistoryItems.filter((item) => !shouldHideOverviewHistoryItemInsideCombinedBatches(item, combinedHistoryItems))
      : rawHistoryItems;

    return `
      <div class="pr-production-history overview-active-history wide">
        <div class="pr-history-head">
          <div>
            <span>Production History</span>
          </div>
        </div>
        <div class="pr-history-list">
          ${historyItems
            .map((item) => createOverviewProductionHistoryTimelineItemHTML(record, item, rawHistoryItems))
            .join("")}
        </div>
      </div>
    `;
  }

  function getOverviewActiveOrderDetailsModal() {
    let modal = document.getElementById("overviewActiveOrderDetailsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "pr-modal-backdrop overview-active-order-details-backdrop";
    modal.id = "overviewActiveOrderDetailsModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <section class="pr-modal overview-active-order-details-modal" role="dialog" aria-modal="true" aria-labelledby="overviewActiveOrderDetailsTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="overviewActiveOrderDetailsTitle">Production Details</h3>
            <p id="overviewActiveOrderDetailsSubTitle">Order details</p>
          </div>
        </header>

        <div class="pr-modal-body" id="overviewActiveOrderDetailsBody"></div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary" type="button">Close</button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);
    modal.querySelector(".pr-modal-secondary")?.addEventListener("click", closeOverviewActiveOrderDetailsModal);

    return modal;
  }

  function openOverviewActiveOrderDetailsModal(recordId) {
    const record = getOverviewActiveRecordById(recordId);
    if (!record) return;

    const modal = getOverviewActiveOrderDetailsModal();
    const title = modal.querySelector("#overviewActiveOrderDetailsTitle");
    const subtitle = modal.querySelector("#overviewActiveOrderDetailsSubTitle");
    const body = modal.querySelector("#overviewActiveOrderDetailsBody");
    const modalDeliveryAlert = getOverviewProductionDeliveryAlert(record);
    const modalDeliveryAlertClass = modalDeliveryAlert.boxClass ? ` ${modalDeliveryAlert.boxClass}` : "";
    const hasMultipleSourceBatches = Array.isArray(record.sourceBatchDetails) && record.sourceBatchDetails.length > 1;

    function activeField(label, value, options = {}) {
      const wide = options.wide ? " wide" : "";
      return `
        <div class="overview-detail-field${wide}">
          <span>${escapeHTML(label)}</span>
          <strong>${value || "—"}</strong>
        </div>
      `;
    }

    if (title) title.textContent = record.item || "Production Details";
    if (subtitle) subtitle.textContent = `${record.poNumber || "—"} • ${record.joNumber || "—"}`;

    if (body) {
      body.innerHTML = `
        <section class="overview-detail-hero${modalDeliveryAlertClass}">
          <div>
            <span class="overview-detail-eyebrow">${escapeHTML(getProductionStageLabel(record.stage))} • ${escapeHTML(getProductionStageStatusLabel(record.status))}</span>
            <h3>${escapeHTML(record.item || "—")}</h3>
            <p>${escapeHTML(record.client || "—")}</p>
            <small>${escapeHTML(record.poNumber || "—")} • ${escapeHTML(record.joNumber || "—")}</small>
          </div>
          <div class="overview-detail-status-stack">
            ${createOverviewProductionStatusPill(record)}
            ${modalDeliveryAlert.label ? `<em class="pr-delivery-alert-pill ${escapeHTML(modalDeliveryAlert.pillClass)}">${escapeHTML(modalDeliveryAlert.label)}</em>` : ""}
          </div>
        </section>

        <section class="overview-detail-summary-grid">
          <div class="overview-detail-summary-card">
            <span>Current Stage</span>
            <strong>${escapeHTML(getProductionStageLabel(record.stage))}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Current Status</span>
            <strong>${escapeHTML(getProductionStageStatusLabel(record.status))}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Meters</span>
            <strong>${escapeHTML(record.convertedMetersDisplay || "—")}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Delivery Date</span>
            <strong>${escapeHTML(record.deliveryDate || "—")}</strong>
          </div>
        </section>

        <section class="overview-detail-section">
          <h3>Order Information</h3>
          <div class="overview-detail-grid">
            ${activeField("P.O. Number", escapeHTML(record.poNumber))}
            ${activeField("J.O. Number", escapeHTML(record.joNumber))}
            ${activeField("Client", escapeHTML(record.client))}
            ${activeField("Item", escapeHTML(record.item), { wide: true })}
            ${activeField("Original Quantity", escapeHTML(record.quantity))}
            ${record.batchLabel ? activeField("Batch", escapeHTML(record.batchLabel)) : ""}
          </div>
        </section>

        <section class="overview-detail-section">
          <h3>Production Details</h3>
          <div class="overview-detail-grid">
            ${activeField("Assigned To", escapeHTML(record.assignedTo))}
            ${activeField("Printing Material", escapeHTML(record.printingMaterial))}
            ${activeField("Lamination Material", escapeHTML(record.laminationMaterial))}
            ${hasMultipleSourceBatches && record.sourceBatchSummary ? activeField("Source Batches", escapeHTML(record.sourceBatchDetailsText || record.sourceBatchSummary), { wide: true }) : ""}
            ${record.holdReason ? activeField("Hold Reason", escapeHTML(record.holdReason), { wide: true }) : ""}
            ${record.remarks && record.remarks !== "—" ? activeField("Remarks", escapeHTML(record.remarks), { wide: true }) : ""}
          </div>
        </section>

        ${createOverviewProductionHistoryHTML(record)}
      `;

      body.scrollTop = 0;
    }
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("pr-modal-open");
  }

  function closeOverviewActiveOrderDetailsModal() {
    const modal = document.getElementById("overviewActiveOrderDetailsModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    if (!document.querySelector(".pr-modal-backdrop.show")) {
      document.body.classList.remove("pr-modal-open");
    }
  }

  function getOverviewActiveDateRangeLabel() {
    const startDate = activeOrdersModalState.startDate;
    const endDate = activeOrdersModalState.endDate;

    if (startDate || endDate) return "Date Set";
    return "Date Range";
  }

  function closeOverviewActiveOrdersDateModal() {
    const modal = document.getElementById("overviewActiveOrdersDateModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    if (!document.querySelector(".pr-modal-backdrop.show")) {
      document.body.classList.remove("pr-modal-open");
    }
  }

  function ensureOverviewActiveOrdersDateModal() {
    let modal = document.getElementById("overviewActiveOrdersDateModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "pr-modal-backdrop pr-date-modal-backdrop overview-active-date-modal-backdrop";
    modal.id = "overviewActiveOrdersDateModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <section class="pr-modal pr-date-modal overview-active-date-modal" role="dialog" aria-modal="true" aria-labelledby="overviewActiveOrdersDateModalTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="overviewActiveOrdersDateModalTitle">Date Range</h3>
            <p>Filter active orders by delivery date.</p>
          </div>

          <button class="pr-modal-close pr-date-modal-close" type="button" aria-label="Close date range modal">
            <span>×</span>
          </button>
        </header>

        <div class="pr-modal-body">
          <div class="pr-date-modal-grid">
            <label class="pr-date-filter">
              <span>From</span>
              <input id="overviewActiveOrdersDateFrom" type="date" aria-label="Filter active orders from delivery date">
            </label>

            <label class="pr-date-filter">
              <span>To</span>
              <input id="overviewActiveOrdersDateTo" type="date" aria-label="Filter active orders to delivery date">
            </label>
          </div>
        </div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary" id="overviewActiveOrdersDateClear" type="button">Clear Dates</button>
          <button class="pr-action-btn primary" id="overviewActiveOrdersDateApply" type="button">Apply Date Range</button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);

    const fromInput = modal.querySelector("#overviewActiveOrdersDateFrom");
    const toInput = modal.querySelector("#overviewActiveOrdersDateTo");

    modal.querySelector(".pr-modal-close")?.addEventListener("click", closeOverviewActiveOrdersDateModal);

    modal.querySelector("#overviewActiveOrdersDateClear")?.addEventListener("click", () => {
      activeOrdersModalState.startDate = "";
      activeOrdersModalState.endDate = "";
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";
      closeOverviewActiveOrdersDateModal();
      renderActiveOrdersModal();
    });

    modal.querySelector("#overviewActiveOrdersDateApply")?.addEventListener("click", () => {
      activeOrdersModalState.startDate = fromInput?.value || "";
      activeOrdersModalState.endDate = toInput?.value || "";
      closeOverviewActiveOrdersDateModal();
      renderActiveOrdersModal();
    });

    return modal;
  }

  function openOverviewActiveOrdersDateModal() {
    const modal = ensureOverviewActiveOrdersDateModal();
    const fromInput = modal.querySelector("#overviewActiveOrdersDateFrom");
    const toInput = modal.querySelector("#overviewActiveOrdersDateTo");

    if (fromInput) fromInput.value = activeOrdersModalState.startDate;
    if (toInput) toInput.value = activeOrdersModalState.endDate;

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("pr-modal-open");
    fromInput?.focus();
  }

  function updateOverviewActiveDateRangeButton(controls) {
    const dateButton = controls?.querySelector(".overview-active-date-range-btn");
    if (!dateButton) return;

    const label = dateButton.querySelector("span:last-child");
    if (label) label.textContent = getOverviewActiveDateRangeLabel();
    dateButton.classList.toggle("has-filter", Boolean(activeOrdersModalState.startDate || activeOrdersModalState.endDate));
  }

  function ensureOverviewActiveOrdersControls() {
    const modal = document.getElementById("activeOrdersModal");
    const modalHead = modal?.querySelector(".overview-modal-head");
    const headRight = modal?.querySelector(".overview-modal-head-right");
    const footer = modal?.querySelector(".overview-modal-footer");
    if (!modal || !modalHead || !footer) return null;

    modal.querySelectorAll(".overview-modal-close").forEach((button) => button.remove());

    let counter = modal.querySelector(".overview-active-footer-counter");
    const existingHeaderCounter = modal.querySelector(".overview-modal-head-right > .overview-modal-counter.active-counter");

    if (!counter) {
      counter = existingHeaderCounter || document.createElement("span");
      counter.className = "overview-modal-counter active-counter overview-active-footer-counter";
      counter.innerHTML = `<strong>0</strong><small>Active</small>`;
      footer.prepend(counter);
    } else if (counter.parentElement !== footer) {
      footer.prepend(counter);
    }

    if (existingHeaderCounter && existingHeaderCounter !== counter) existingHeaderCounter.remove();

    let controls = modal.querySelector(".overview-active-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "overview-active-controls";
      controls.innerHTML = `
        <input
          id="overviewActiveOrdersSearch"
          class="overview-active-search"
          type="search"
          placeholder="Search JO, PO, client, item..."
          autocomplete="off"
        >
        <button class="overview-active-date-range-btn" id="overviewActiveOrdersDateRangeBtn" type="button">
          <span class="overview-active-date-icon" data-icon="calendar"></span>
          <span>Date Range</span>
        </button>
        <button class="overview-active-clear" type="button">Clear</button>
      `;

      if (headRight) {
        modalHead.insertBefore(controls, headRight);
      } else {
        modalHead.appendChild(controls);
      }

      const searchInput = controls.querySelector("#overviewActiveOrdersSearch");
      const dateRangeButton = controls.querySelector("#overviewActiveOrdersDateRangeBtn");
      const clearButton = controls.querySelector(".overview-active-clear");

      searchInput?.addEventListener("input", () => {
        activeOrdersModalState.search = searchInput.value.trim().toLowerCase();
        renderActiveOrdersModal();
      });

      dateRangeButton?.addEventListener("click", openOverviewActiveOrdersDateModal);

      clearButton?.addEventListener("click", () => {
        activeOrdersModalState.search = "";
        activeOrdersModalState.startDate = "";
        activeOrdersModalState.endDate = "";
        closeOverviewActiveOrdersDateModal();
        renderActiveOrdersModal();
      });
    }

    const searchInput = controls.querySelector("#overviewActiveOrdersSearch");

    if (searchInput && searchInput.value !== activeOrdersModalState.search) searchInput.value = activeOrdersModalState.search;
    updateOverviewActiveDateRangeButton(controls);

    return { counter, controls };
  }

  function getOverviewActiveRecordDateKey(record) {
    return String(record?.deliveryDateRaw || "").slice(0, 10);
  }

  function filterOverviewActiveRecords(records) {
    let filteredRecords = Array.isArray(records) ? records : [];
    const keyword = activeOrdersModalState.search.trim().toLowerCase();
    const startDate = activeOrdersModalState.startDate;
    const endDate = activeOrdersModalState.endDate;

    if (keyword) {
      filteredRecords = filteredRecords.filter((record) => {
        return [
          record.item,
          record.client,
          record.poNumber,
          record.joNumber,
          record.quantity,
          record.deliveryDate,
          `${getProductionStageLabel(record.stage)} ${getProductionStageStatusLabel(record.status)}`
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .some((value) => value.includes(keyword));
      });
    }

    if (startDate || endDate) {
      filteredRecords = filteredRecords.filter((record) => {
        const dateKeyValue = getOverviewActiveRecordDateKey(record);
        if (!dateKeyValue) return false;
        if (startDate && dateKeyValue < startDate) return false;
        if (endDate && dateKeyValue > endDate) return false;
        return true;
      });
    }

    return sortProductionRecordsRecentFirst(filteredRecords);
  }

  function setupActiveOrdersModalInteractions() {
    const list = document.querySelector("#activeOrdersModal .active-orders-list");
    if (!list || list.dataset.overviewActiveOrdersBound === "true") return;

    list.dataset.overviewActiveOrdersBound = "true";
    list.addEventListener("click", (event) => {
      const card = event.target.closest("[data-overview-active-record-id]");
      if (!card) return;
      openOverviewActiveOrderDetailsModal(card.dataset.overviewActiveRecordId);
    });

    list.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-overview-active-record-id]");
      if (!card) return;
      event.preventDefault();
      openOverviewActiveOrderDetailsModal(card.dataset.overviewActiveRecordId);
    });
  }

  function renderActiveOrdersModal() {
    const modal = document.getElementById("activeOrdersModal");
    const list = modal?.querySelector(".active-orders-list");
    if (!modal || !list) return;

    const activeRecords = getActiveOverviewProductionRecords();
    const controlsData = ensureOverviewActiveOrdersControls() || {};
    const counter = controlsData.counter;
    const filteredRecords = filterOverviewActiveRecords(activeRecords);

    if (counter) {
      const value = counter.querySelector("strong");
      if (value) value.textContent = String(filteredRecords.length);
    }

    setupActiveOrdersModalInteractions();

    if (!filteredRecords.length) {
      const hasFilter = Boolean(activeOrdersModalState.search || activeOrdersModalState.startDate || activeOrdersModalState.endDate);
      list.innerHTML = `
        <div class="overview-pending-empty">
          <strong>${hasFilter ? "No matching active orders" : "No active orders"}</strong>
          <span>${hasFilter ? "Try another search or date range." : "Orders taken into production will appear here."}</span>
        </div>
      `;
      return;
    }

    list.innerHTML = filteredRecords.map(createOverviewActiveOrderCard).join("");
  }

  async function requestJSON(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        ...getOverviewAuthHeaders(),
        ...(options.headers || {})
      },
      ...options
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || "Request failed.");
    }

    return data;
  }

  function getOrdersByStatus(status) {
    return sortOrdersRecentFirst(state.orders.filter((order) => normalizeStatus(order.orderStatus || order.order_status) === status));
  }

  function countOrders(status) {
    return getOrdersByStatus(status).length;
  }

  function updateStatCards() {
    const cards = document.querySelectorAll(".overview-view .stats-grid .stat-card");

    cards.forEach((card) => {
      const label = card.querySelector("p")?.textContent?.trim().toLowerCase();
      const countEl = card.querySelector("strong");
      if (!label || !countEl) return;

      if (label.includes("pending")) countEl.textContent = String(countOrders("pending"));
      if (label.includes("active")) countEl.textContent = String(getActiveOverviewProductionRecords().length);
      if (label.includes("for delivery")) countEl.textContent = String(countOrders("delivery"));
      if (label.includes("delivered")) countEl.textContent = String(countOrders("delivered"));
    });

    const pendingModalCounter = document.querySelector("#pendingOrdersModal .overview-modal-counter strong");
    if (pendingModalCounter) pendingModalCounter.textContent = String(countOrders("pending"));
  }

  function getCurrentMonthOrders() {
    const now = new Date();

    return state.orders.filter((order) => {
      const createdDate = getOrderDate(order);
      return createdDate.getFullYear() === now.getFullYear() && createdDate.getMonth() === now.getMonth();
    });
  }

  function getValidDateFromValues(...values) {
    for (const value of values) {
      if (!value) continue;

      const rawValue = String(value).trim();
      if (!rawValue) continue;

      const dateOnly = parseDateOnly(rawValue);
      if (dateOnly) return dateOnly;

      const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
      const parsed = new Date(normalizedValue);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  function isDateInCurrentMonth(dateValue) {
    const date = dateValue instanceof Date ? dateValue : getValidDateFromValues(dateValue);
    if (!date) return false;

    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function isOverviewActiveRecordInCurrentMonth(record) {
    const date = getValidDateFromValues(
      record.takenAtRaw,
      record.orderCreatedRaw,
      record.updatedAtRaw,
      record.deliveryDateRaw
    );

    return date ? isDateInCurrentMonth(date) : true;
  }

  function getCurrentMonthActiveRecords() {
    return getActiveOverviewProductionRecords().filter(isOverviewActiveRecordInCurrentMonth);
  }

  function renderMonthlyChart() {
    const panel = document.querySelector(".monthly-panel");
    const radialChart = document.getElementById("radialChart");
    const chartLegend = document.querySelector(".monthly-panel .chart-legend");
    if (!panel || !radialChart || !chartLegend) return;

    const now = new Date();
    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "long"
    }).format(now);

    const monthlyOrders = getCurrentMonthOrders();
    const activeRecords = getCurrentMonthActiveRecords();
    const activeCountFromOrders = monthlyOrders.filter((order) => normalizeStatus(order.orderStatus) === "production").length;
    const pendingCount = monthlyOrders.filter((order) => normalizeStatus(order.orderStatus) === "pending").length;
    const activeCount = activeRecords.length || activeCountFromOrders;
    const deliveryCount = monthlyOrders.filter((order) => normalizeStatus(order.orderStatus) === "delivery").length;
    const deliveredCount = monthlyOrders.filter((order) => normalizeStatus(order.orderStatus) === "delivered").length;
    const total = pendingCount + activeCount + deliveryCount + deliveredCount;

    const chartItems = [
      { key: "pending", label: "Pending", count: pendingCount, className: "overview-monthly-pending", strokeColor: "#246bfe" },
      { key: "active", label: "Active", count: activeCount, className: "overview-monthly-active", strokeColor: "#16b86a" },
      { key: "delivery", label: "For Delivery", count: deliveryCount, className: "overview-monthly-delivery", strokeColor: "#f97316" },
      { key: "delivered", label: "Delivered", count: deliveredCount, className: "overview-monthly-delivered", strokeColor: "#8b5cf6" }
    ];

    const visibleChartItems = chartItems.filter((item) => item.count > 0);
    const radius = 72;
    const circumference = 2 * Math.PI * radius;
    let usedLength = 0;

    const segmentMarkup = visibleChartItems.map((item) => {
      const segmentLength = total ? (item.count / total) * circumference : 0;
      const gap = visibleChartItems.length > 1 ? Math.min(5, segmentLength * 0.18) : 0;
      const dashLength = Math.max(segmentLength - gap, 0);
      const dashOffset = -usedLength;
      usedLength += segmentLength;

      return `
        <circle
          class="overview-monthly-segment ${escapeHTML(item.className)}"
          cx="100"
          cy="100"
          r="${radius}"
          fill="none"
          stroke="${escapeHTML(item.strokeColor)}"
          stroke-width="24"
          stroke-linecap="round"
          stroke-dasharray="${dashLength.toFixed(2)} ${(circumference - dashLength).toFixed(2)}"
          stroke-dashoffset="${dashOffset.toFixed(2)}"
          data-monthly-segment="true"
          data-monthly-tooltip-label="${escapeHTML(item.label)}"
          data-monthly-tooltip-count="${item.count}"
          tabindex="0"
        ></circle>
      `;
    }).join("");

    panel.classList.add("overview-real-monthly");
    panel.classList.remove("overview-monthly-single-color");

    radialChart.innerHTML = `
      <svg class="overview-monthly-svg" viewBox="0 0 200 200" role="img" aria-label="Monthly orders chart">
        <circle class="overview-monthly-track" cx="100" cy="100" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="24"></circle>
        ${segmentMarkup}
      </svg>
      <div class="overview-monthly-center">
        <strong>${escapeHTML(monthName)}</strong>
        <span>${total} order${total === 1 ? "" : "s"}</span>
      </div>
      <div class="chart-tooltip overview-monthly-tooltip" id="pieTooltip">
        ${escapeHTML(monthName)}<br>
        <b>${total}</b>
      </div>
    `;

    const tooltip = radialChart.querySelector(".overview-monthly-tooltip");

    const showTooltip = (label, count) => {
      if (!tooltip) return;
      tooltip.innerHTML = `
        ${escapeHTML(label)}<br>
        <b>${Number(count || 0)}</b>
      `;
      tooltip.classList.add("show");
    };

    const hideTooltip = () => {
      tooltip?.classList.remove("show");
    };

    radialChart.querySelectorAll("[data-monthly-segment]").forEach((segment) => {
      segment.addEventListener("mouseenter", () => showTooltip(segment.dataset.monthlyTooltipLabel, segment.dataset.monthlyTooltipCount));
      segment.addEventListener("mouseleave", hideTooltip);
      segment.addEventListener("focus", () => showTooltip(segment.dataset.monthlyTooltipLabel, segment.dataset.monthlyTooltipCount));
      segment.addEventListener("blur", hideTooltip);
    });

    chartLegend.innerHTML = chartItems.map((item) => `
      <li data-monthly-tooltip-label="${escapeHTML(item.label)}" data-monthly-tooltip-count="${item.count}">
        <span class="legend-dot overview-monthly-dot ${escapeHTML(item.className)}"></span>${escapeHTML(item.label)} <b>${item.count}</b>
      </li>
    `).join("");

    chartLegend.querySelectorAll("[data-monthly-tooltip-label]").forEach((item) => {
      item.addEventListener("mouseenter", () => {
        showTooltip(item.dataset.monthlyTooltipLabel, item.dataset.monthlyTooltipCount);
      });

      item.addEventListener("mouseleave", hideTooltip);
      item.addEventListener("focus", () => {
        showTooltip(item.dataset.monthlyTooltipLabel, item.dataset.monthlyTooltipCount);
      });
      item.addEventListener("blur", hideTooltip);
    });
  }

  function getOrdersForDate(targetDateKey) {
    return sortOrdersRecentFirst(state.orders.filter((order) => {
      if (isOverviewDeliveredOrder(order)) return false;
      return String(order.deliveryDate || order.delivery_date || "").slice(0, 10) === targetDateKey;
    }));
  }

  function renderCalendar() {
    const calendarPanel = document.querySelector(".overview-view .calendar-panel");
    const calendarTitle = calendarPanel?.querySelector(".calendar h3");
    const datesGrid = calendarPanel?.querySelector(".calendar .dates");
    const weekdaysGrid = calendarPanel?.querySelector(".calendar .weekdays");
    if (!calendarPanel || !calendarTitle || !datesGrid) return;

    const activeDate = state.calendarDate;
    const year = activeDate.getFullYear();
    const month = activeDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const previousLastDate = new Date(year, month, 0).getDate();
    const todayKey = dateKey(todayDateOnly());

    calendarTitle.textContent = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric"
    }).format(new Date(year, month, 1));

    if (weekdaysGrid && !weekdaysGrid.dataset.realOverviewCalendar) {
      weekdaysGrid.dataset.realOverviewCalendar = "true";
      weekdaysGrid.innerHTML = "<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>";
    }

    let cells = "";

    for (let index = 0; index < 42; index++) {
      let dateYear = year;
      let dateMonth = month;
      let dayNumber;
      let isMuted = false;

      if (index < startDay) {
        dayNumber = previousLastDate - startDay + index + 1;
        dateMonth -= 1;
        isMuted = true;

        if (dateMonth < 0) {
          dateMonth = 11;
          dateYear -= 1;
        }
      } else if (index >= startDay + lastDate) {
        dayNumber = index - (startDay + lastDate) + 1;
        dateMonth += 1;
        isMuted = true;

        if (dateMonth > 11) {
          dateMonth = 0;
          dateYear += 1;
        }
      } else {
        dayNumber = index - startDay + 1;
      }

      const cellDate = new Date(dateYear, dateMonth, dayNumber);
      const key = dateKey(cellDate);
      const orders = getOrdersForDate(key);
      const dueCount = orders.filter((order) => getDeliveryAlert(order).type === "due").length;
      const criticalCount = orders.filter((order) => getDeliveryAlert(order).type === "critical").length;
      const normalCount = orders.length - dueCount - criticalCount;
      const holdCount = orders.filter((order) => normalizeStatus(order.orderStatus) === "hold").length;
      const classes = [
        isMuted ? "muted" : "",
        key === todayKey ? "today" : "",
        orders.length ? "has-real-calendar-orders" : "",
        dueCount ? "has-due" : "",
        criticalCount ? "has-critical" : "",
        holdCount ? "has-hold" : ""
      ].filter(Boolean).join(" ");

      const markers = `
        <span class="overview-calendar-markers">
          ${dueCount ? `<i class="due" title="${dueCount} due/overdue"></i>` : ""}
          ${criticalCount ? `<i class="critical" title="${criticalCount} critical"></i>` : ""}
          ${holdCount ? `<i class="hold" title="${holdCount} hold"></i>` : ""}
          ${normalCount ? `<i class="normal" title="${normalCount} scheduled"></i>` : ""}
        </span>
      `;

      cells += `
        <span class="${classes}" data-overview-real-date="${key}" title="${orders.length ? `${orders.length} order/s` : ""}">
          <span class="calendar-date-number">${dayNumber}</span>
          ${orders.length ? markers : ""}
        </span>
      `;
    }

    datesGrid.innerHTML = cells;
  }

  function setupCalendarButtons() {
    const panel = document.querySelector(".overview-view .calendar-panel");
    if (!panel || panel.dataset.realCalendarButtons === "true") return;

    const [prevButton, nextButton] = panel.querySelectorAll(".panel-actions button");
    panel.dataset.realCalendarButtons = "true";

    prevButton?.addEventListener("click", () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
      renderCalendar();
    });

    nextButton?.addEventListener("click", () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
      renderCalendar();
    });

    panel.querySelector(".calendar .dates")?.addEventListener("click", (event) => {
      const dateCell = event.target.closest("[data-overview-real-date]");
      if (!dateCell) return;
      openRealCalendarDateModal(dateCell.dataset.overviewRealDate);
    });
  }

  function createCalendarRecord(order) {
    const alert = getDeliveryAlert(order);

    return `
      <article class="calendar-date-record">
        <div class="calendar-date-field">
          <span>J.O. Number</span>
          <strong>${escapeHTML(order.joNumber || "—")}</strong>
        </div>
        <div class="calendar-date-field">
          <span>P.O. Number</span>
          <strong>${escapeHTML(order.poNumber || "—")}</strong>
        </div>
        <div class="calendar-date-field">
          <span>Client</span>
          <strong>${escapeHTML(order.client || "—")}</strong>
        </div>
        <div class="calendar-date-field">
          <span>Status</span>
          <strong>${escapeHTML(getStatusLabel(order.orderStatus))}</strong>
        </div>
        <div class="calendar-date-field wide-field">
          <span>Item</span>
          <strong>${escapeHTML(order.item || "—")}</strong>
        </div>
        <div class="calendar-date-field">
          <span>Quantity</span>
          <strong>${escapeHTML(formatQuantity(order))}</strong>
        </div>
        <div class="calendar-date-field">
          <span>Alert</span>
          <strong>${escapeHTML(alert.label || "Scheduled")}</strong>
        </div>
      </article>
    `;
  }

  function openRealCalendarDateModal(selectedDateKey) {
    if (typeof createCalendarActivityModal === "function") createCalendarActivityModal();

    const modal = document.getElementById("overviewCalendarDateModal");
    const title = document.getElementById("overviewCalendarDateModalTitle");
    const summary = document.getElementById("overviewCalendarDateSummary");
    const body = document.getElementById("overviewCalendarDateModalBody");
    if (!modal || !title || !summary || !body) return;

    const orders = getOrdersForDate(selectedDateKey);
    const dueCount = orders.filter((order) => getDeliveryAlert(order).type === "due").length;
    const criticalCount = orders.filter((order) => getDeliveryAlert(order).type === "critical").length;
    const holdCount = orders.filter((order) => normalizeStatus(order.orderStatus) === "hold").length;

    title.textContent = formatDate(selectedDateKey);
    summary.innerHTML = `
      <span class="calendar-date-pill for-delivery">${orders.length} Order/s</span>
      ${dueCount ? `<span class="calendar-date-pill due">${dueCount} Due</span>` : ""}
      ${criticalCount ? `<span class="calendar-date-pill critical">${criticalCount} Critical</span>` : ""}
      ${holdCount ? `<span class="calendar-date-pill hold">${holdCount} Hold</span>` : ""}
    `;

    body.innerHTML = orders.length
      ? `<div class="calendar-date-list">${orders.map(createCalendarRecord).join("")}</div>`
      : `
        <div class="calendar-empty-state">
          <div>
            <strong>No orders</strong>
            <p>No orders are scheduled for this date.</p>
          </div>
        </div>
      `;

    if (typeof openOverviewModal === "function") {
      openOverviewModal("overviewCalendarDateModal");
    }
  }

  function getNoticeAlertClass(alert) {
    if (alert.type === "critical") return "alert-critical";
    if (alert.type === "hold") return "alert-hold";
    if (alert.type === "due" && String(alert.label || "").toLowerCase().includes("today")) return "alert-due";
    if (alert.type === "due") return "alert-overdue";
    return "alert-clear";
  }

  function getNoticeAlertBadge(alert) {
    if (alert.type === "critical") return "Critical";
    if (alert.type === "hold") return "Hold";
    return alert.label || "Due";
  }

  function getNoticeAlertDescription(order, alert) {
    if (alert.type === "hold") {
      return `Paused • ${getStatusLabel(order.orderStatus || order.order_status)}`;
    }

    if (alert.type === "critical") {
      return `${alert.label} • due ${formatDate(order.deliveryDate || order.delivery_date)}`;
    }

    return `${alert.label} • ${formatDate(order.deliveryDate || order.delivery_date)}`;
  }

  function getNoticeAlertItems() {
    const priority = {
      due: 0,
      critical: 1,
      hold: 2
    };

    return state.orders
      .filter((order) => !isOverviewDeliveredOrder(order))
      .map((order) => {
        const status = normalizeStatus(order.orderStatus || order.order_status);
        const alert = status === "hold"
          ? { type: "hold", label: "On hold", daysLeft: 0 }
          : getDeliveryAlert(order);

        return {
          order,
          alert,
          className: getNoticeAlertClass(alert),
          badge: getNoticeAlertBadge(alert),
          description: getNoticeAlertDescription(order, alert)
        };
      })
      .filter((item) => ["due", "critical", "hold"].includes(item.alert.type))
      .sort((a, b) => {
        return (priority[a.alert.type] ?? 9) - (priority[b.alert.type] ?? 9) ||
          (a.alert.daysLeft ?? 999) - (b.alert.daysLeft ?? 999) ||
          getOrderRecentTimestamp(b.order) - getOrderRecentTimestamp(a.order) ||
          String(a.order.poNumber || a.order.po_number || "").localeCompare(String(b.order.poNumber || b.order.po_number || ""));
      });
  }

  function getNoticeOrderById(orderId) {
    return state.orders.find((order) => String(order.id) === String(orderId)) || null;
  }

  function createNoticeBoardCard({ order, className, badge, description }, isCompact = false) {
    const poNumber = order.poNumber || order.po_number || "—";
    const joNumber = order.joNumber || order.jo_number || "—";
    const client = order.client || "—";
    const item = order.item || "Order";
    const deliveryDate = order.deliveryDate || order.delivery_date;

    if (isCompact) {
      return `
        <article class="delivery-alert-item ${escapeHTML(className)}" data-notice-order-id="${escapeHTML(order.id)}">
          <div class="delivery-alert-content">
            <p class="delivery-alert-title">${escapeHTML(item)}</p>
            <div class="delivery-alert-meta">
              <span>${escapeHTML(poNumber)}</span>
              <span>${escapeHTML(client)}</span>
              <span>${escapeHTML(description)}</span>
            </div>
          </div>
          <span class="delivery-alert-badge ${escapeHTML(className)}">${escapeHTML(badge)}</span>
        </article>
      `;
    }

    return `
      <article class="notice-alert-modal-card ${escapeHTML(className)}" data-notice-order-id="${escapeHTML(order.id)}">
        <div class="notice-alert-modal-status">
          <span>${escapeHTML(badge)}</span>
        </div>
        <div class="notice-alert-modal-field">
          <span>Delivery Date</span>
          <strong>${escapeHTML(formatDate(deliveryDate))}</strong>
        </div>
        <div class="notice-alert-modal-field">
          <span>J.O. Number</span>
          <strong>${escapeHTML(joNumber)}</strong>
        </div>
        <div class="notice-alert-modal-field">
          <span>P.O. Number</span>
          <strong>${escapeHTML(poNumber)}</strong>
        </div>
        <div class="notice-alert-modal-field">
          <span>Client</span>
          <strong>${escapeHTML(client)}</strong>
        </div>
        <div class="notice-alert-modal-field wide-field">
          <span>Item</span>
          <strong>${escapeHTML(item)}</strong>
        </div>
      </article>
    `;
  }

  function renderNoticeBoardViewAllModal(alertItems) {
    const modal = document.getElementById("noticeBoardViewAllModal");
    if (!modal) return;

    const list = modal.querySelector(".notice-alert-modal-list");
    const counter = modal.querySelector(".overview-modal-counter strong");

    if (counter) counter.textContent = String(alertItems.length);

    if (!list) return;

    if (!alertItems.length) {
      list.innerHTML = `
        <div class="overview-pending-empty">
          <strong>No notice board items</strong>
          <span>No due, critical, or hold orders.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = alertItems.map((item) => createNoticeBoardCard(item, false)).join("");
  }

  function createNoticeDetailsModal() {
    let modal = document.getElementById("noticeBoardOrderDetailsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "notice-order-details-backdrop";
    modal.id = "noticeBoardOrderDetailsModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <section class="notice-order-details-modal" role="dialog" aria-modal="true" aria-labelledby="noticeOrderDetailsTitle">
        <header class="notice-order-details-head">
          <div>
            <span class="notice-order-details-eyebrow">Notice Details</span>
            <h2 id="noticeOrderDetailsTitle">Order Details</h2>
          </div>
          <button class="notice-order-details-close" type="button" aria-label="Close notice details">
            <span>×</span>
          </button>
        </header>

        <div class="notice-order-details-body" id="noticeOrderDetailsBody"></div>
      </section>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".notice-order-details-close")?.addEventListener("click", closeNoticeDetailsModal);

    return modal;
  }

  function openNoticeDetailsModal(orderId) {
    const order = getNoticeOrderById(orderId);
    if (!order) return;

    const modal = createNoticeDetailsModal();
    const body = modal.querySelector("#noticeOrderDetailsBody");
    const quantity = `${order.quantity ?? "—"} ${order.unit ?? ""}`.trim();
    const status = normalizeStatus(order.orderStatus || order.order_status);
    const alert = status === "hold"
      ? { type: "hold", label: "On hold", daysLeft: 0 }
      : getDeliveryAlert(order);
    const className = getNoticeAlertClass(alert);
    const badge = getNoticeAlertBadge(alert);
    const poNumber = order.poNumber || order.po_number || "—";
    const productionRecord = getTotalOrderProductionRecord(order);
    const progressLabel = getTotalOrderProgressLabel(order, productionRecord);

    function noticeField(label, value, options = {}) {
      return `
        <div class="notice-order-field${options.wide ? " wide" : ""}">
          <span>${escapeHTML(label)}</span>
          <strong>${value || "—"}</strong>
        </div>
      `;
    }

    if (body) {
      body.innerHTML = `
        <section class="overview-detail-hero notice-order-summary-card ${escapeHTML(className)}">
          <div>
            <span class="overview-detail-eyebrow">${escapeHTML(badge)}</span>
            <h3>${escapeHTML(order.item || "—")}</h3>
            <p>${escapeHTML(order.client || "—")}</p>
            <small>${escapeHTML(poNumber)} • ${escapeHTML(order.joNumber || order.jo_number || "—")}</small>
          </div>

          <div class="notice-order-summary-side overview-detail-status-stack">
            <span class="delivery-alert-badge ${escapeHTML(className)}">${escapeHTML(badge)}</span>
            <span class="order-status-pill status-${escapeHTML(getStatusClass(status))}">${escapeHTML(getStatusLabel(status))}</span>
          </div>
        </section>

        <section class="overview-detail-summary-grid">
          <div class="overview-detail-summary-card">
            <span>Alert Status</span>
            <strong>${escapeHTML(badge)}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Current Location</span>
            <strong>${escapeHTML(progressLabel)}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Delivery Date</span>
            <strong>${escapeHTML(formatDate(order.deliveryDate || order.delivery_date))}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Original Quantity</span>
            <strong>${escapeHTML(quantity || "—")}</strong>
          </div>
        </section>

        <section class="notice-order-section overview-detail-section">
          <h3>Order Information</h3>
          <div class="notice-order-grid overview-detail-grid">
            ${noticeField("P.O. Number", escapeHTML(poNumber))}
            ${noticeField("J.O. Number", escapeHTML(order.joNumber || order.jo_number || "—"))}
            ${noticeField("Client", escapeHTML(order.client || "—"))}
            ${noticeField("Item", escapeHTML(order.item || "—"), { wide: true })}
            ${noticeField("Original Quantity", escapeHTML(quantity || "—"))}
            ${noticeField("Current Status", escapeHTML(getStatusLabel(status)))}
          </div>
        </section>

        <section class="notice-order-section overview-detail-section">
          <h3>Materials & Schedule</h3>
          <div class="notice-order-grid overview-detail-grid">
            ${noticeField("Printing Material", escapeHTML(order.printingMaterial || order.printing_material || productionRecord?.printingMaterial || "—"))}
            ${noticeField("Lamination Material", escapeHTML(order.laminationMaterial || order.lamination_material || productionRecord?.laminationMaterial || "—"))}
            ${noticeField("Assigned To", escapeHTML(order.assignTo || order.assign_to || productionRecord?.assignedTo || "—"))}
            ${noticeField("Date Created", escapeHTML(formatDate((order.createdAt || order.created_at || "").slice?.(0, 10) || order.createdAt || order.created_at)))}
          </div>
        </section>

        ${createTotalOrderActivityHistoryHTML(order, productionRecord)}
      `;

      body.scrollTop = 0;
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("notice-order-details-open");
  }

  function closeNoticeDetailsModal() {
    const modal = document.getElementById("noticeBoardOrderDetailsModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("notice-order-details-open");
  }

  function setupNoticeBoardInteractions() {
    const noticeList = document.getElementById("deliveryAlertList");
    const noticeModalList = document.querySelector("#noticeBoardViewAllModal .notice-alert-modal-list");

    if (noticeList && noticeList.dataset.noticeClickBound !== "true") {
      noticeList.dataset.noticeClickBound = "true";
      noticeList.addEventListener("click", (event) => {
        const item = event.target.closest("[data-notice-order-id]");
        if (!item) return;
        openNoticeDetailsModal(item.dataset.noticeOrderId);
      });
    }

    if (noticeModalList && noticeModalList.dataset.noticeClickBound !== "true") {
      noticeModalList.dataset.noticeClickBound = "true";
      noticeModalList.addEventListener("click", (event) => {
        const item = event.target.closest("[data-notice-order-id]");
        if (!item) return;
        openNoticeDetailsModal(item.dataset.noticeOrderId);
      });
    }
  }

  function renderNoticeBoard() {
    const list = document.getElementById("deliveryAlertList");
    if (!list) return;

    const alertItems = getNoticeAlertItems();

    renderNoticeBoardViewAllModal(alertItems);
    setupNoticeBoardInteractions();

    if (!alertItems.length) {
      list.innerHTML = `
        <article class="delivery-alert-item alert-clear">
          <div class="delivery-alert-content">
            <p class="delivery-alert-title">No urgent notices</p>
            <div class="delivery-alert-meta">
              <span>No due, critical, or hold orders.</span>
            </div>
          </div>
          <span class="delivery-alert-badge alert-clear">Clear</span>
        </article>
      `;
      return;
    }

    list.innerHTML = alertItems.slice(0, 6).map((item) => createNoticeBoardCard(item, true)).join("");
  }

  function getTotalOrdersStatusLabel(status) {
    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus === "production") return "In Production";
    return getStatusLabel(normalizedStatus);
  }

  function getTotalOrdersStatusFilterLabel(filter) {
    const normalizedFilter = normalizeStatus(filter);
    if (normalizedFilter === "all") return "All";
    if (normalizedFilter === "production") return "In Production";
    return getStatusLabel(normalizedFilter);
  }

  function getTotalOrdersSummaryCounts(orders = state.orders) {
    const counts = {
      all: Array.isArray(orders) ? orders.length : 0,
      pending: 0,
      production: 0,
      delivery: 0,
      delivered: 0,
      cancelled: 0
    };

    (Array.isArray(orders) ? orders : []).forEach((order) => {
      const status = normalizeStatus(order.orderStatus || order.order_status);
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });

    return counts;
  }

  function getTotalOrderSearchText(order) {
    return [
      order.id,
      order.joNumber,
      order.jo_number,
      order.poNumber,
      order.po_number,
      order.client,
      order.item,
      order.assignTo,
      order.assign_to,
      order.orderStatus,
      order.order_status
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function getFilteredTotalOrders() {
    const searchText = totalOrdersModalState.search.trim().toLowerCase();
    const filter = normalizeStatus(totalOrdersModalState.filter || "all");

    return sortOrdersRecentFirst(state.orders).filter((order) => {
      const status = normalizeStatus(order.orderStatus || order.order_status);
      const matchesFilter = filter === "all" || status === filter;
      const matchesSearch = !searchText || getTotalOrderSearchText(order).includes(searchText);
      return matchesFilter && matchesSearch;
    });
  }

  function getTotalOrderProductionRecord(order) {
    if (!order) return null;

    const orderId = String(order.id || order.orderId || order.order_id || "").trim();
    const joNumber = String(order.joNumber || order.jo_number || "").trim().toLowerCase();
    const poNumber = String(order.poNumber || order.po_number || "").trim().toLowerCase();

    const matchedRecords = state.productionRecords
      .map((record) => normalizeOverviewProductionRecord(record))
      .filter(Boolean)
      .filter((record) => {
        const recordOrderId = String(record.orderId || "").trim();
        const recordJo = String(record.joNumber || "").trim().toLowerCase();
        const recordPo = String(record.poNumber || "").trim().toLowerCase();

        return (orderId && recordOrderId === orderId)
          || (joNumber && recordJo === joNumber)
          || (poNumber && recordPo === poNumber);
      });

    return sortProductionRecordsRecentFirst(matchedRecords)[0] || null;
  }

  function ensureTotalOrdersDetailsModal() {
    let modal = document.getElementById("overviewTotalOrderDetailsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "overview-modal-backdrop total-order-details-modal";
    modal.id = "overviewTotalOrderDetailsModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="overview-modal" role="dialog" aria-modal="true" aria-labelledby="overviewTotalOrderDetailsTitle">
        <header class="overview-modal-head">
          <div class="overview-modal-title-wrap">
            <h2 id="overviewTotalOrderDetailsTitle">Order Details</h2>
            <p class="overview-total-order-subtitle" id="overviewTotalOrderDetailsSubtitle">Read-only order summary</p>
          </div>

          <div class="overview-modal-head-right">
            <button class="overview-modal-close" type="button" aria-label="Close order details modal">
              <span>×</span>
            </button>
          </div>
        </header>

        <div class="overview-modal-body" id="overviewTotalOrderDetailsBody"></div>

        <footer class="overview-modal-footer">
          <button class="overview-modal-secondary" type="button">Close</button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".overview-modal-close")?.addEventListener("click", () => closeOverviewModal(modal));
    modal.querySelector(".overview-modal-secondary")?.addEventListener("click", () => closeOverviewModal(modal));

    return modal;
  }

  function findTotalOrderById(orderId) {
    return state.orders.find((order) => String(order.id) === String(orderId)) || null;
  }

  function createTotalOrderDetailField(label, value, options = {}) {
    const wideClass = options.wide ? " wide-field" : "";
    return `
      <div class="total-order-modal-field${wideClass}">
        <span>${escapeHTML(label)}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function getTotalOrderCodeText(order = {}) {
    const poNumber = String(order.poNumber || order.po_number || "").trim();
    const joNumber = String(order.joNumber || order.jo_number || "").trim();
    return [poNumber, joNumber].filter(Boolean).join(" • ") || "—";
  }

  function getTotalOrderProgressLabel(order = {}, productionRecord = null) {
    const status = normalizeStatus(order.orderStatus || order.order_status);

    if (productionRecord) {
      return `${getProductionStageLabel(productionRecord.stage)} • ${getProductionStageStatusLabel(productionRecord.status)}`;
    }

    if (status === "pending") return "Waiting for Production";
    if (status === "production") return "In Production";
    if (status === "delivery") return "Delivery Process";
    if (status === "delivered") return "Delivered";
    if (status === "cancelled") return "Cancelled";

    return getTotalOrdersStatusLabel(status);
  }

  function getTotalOrderCompletedStagesText(productionRecord = null) {
    if (!productionRecord || !Array.isArray(productionRecord.completedStages)) return "—";

    const stages = productionRecord.completedStages
      .map((stage) => String(stage || "").trim())
      .filter(Boolean)
      .map((stage) => getProductionStageLabel(stage));

    return stages.length ? [...new Set(stages)].join(" • ") : "—";
  }

  function normalizeTotalOrderHistoryId(value) {
    return String(value ?? "").trim();
  }

  function getTotalOrderGlobalHistoryItems(order = {}, productionRecord = null) {
    const orderId = normalizeTotalOrderHistoryId(order.id || order.orderId || order.order_id || productionRecord?.orderId);
    const productionRecordId = normalizeTotalOrderHistoryId(
      productionRecord?.productionRecordId ||
      productionRecord?.production_record_id ||
      order.productionRecordId ||
      order.production_record_id
    );

    if (!orderId && !productionRecordId) return [];

    const globalHistory = Array.isArray(state.productionHistory) ? state.productionHistory : [];

    return globalHistory.filter((history) => {
      const historyKey = normalizeTotalOrderHistoryId(history?.historyKey || history?.history_key);
      const historyOrderId = normalizeTotalOrderHistoryId(history?.orderId || history?.order_id);
      const historyProductionRecordId = normalizeTotalOrderHistoryId(history?.productionRecordId || history?.production_record_id);

      return Boolean(
        (orderId && (historyOrderId === orderId || historyKey === orderId)) ||
        (productionRecordId && historyProductionRecordId === productionRecordId)
      );
    });
  }

  function getTotalOrderHistoryStorageItems(order = {}, productionRecord = null) {
    const globalHistoryItems = getTotalOrderGlobalHistoryItems(order, productionRecord)
      .filter((historyItem) => !shouldHideOverviewAutoDeliveryFinishingCompletedHistory(historyItem));
    if (globalHistoryItems.length) return globalHistoryItems;

    const orderId = String(order.id || order.orderId || order.order_id || productionRecord?.orderId || "").trim();
    if (!orderId) return [];

    /* Legacy fallback only for old local records that were created before global history existed. */
    try {
      return getOverviewProductionActionHistory({ orderId });
    } catch (error) {
      return [];
    }
  }

  function totalOrderHistoryHasEvent(historyItems = [], eventType = "", titleText = "") {
    const cleanEventType = String(eventType || "").trim().toLowerCase();
    const cleanTitle = String(titleText || "").trim().toLowerCase();

    return (Array.isArray(historyItems) ? historyItems : []).some((item) => {
      const itemEvent = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
      const itemTitle = String(item?.title || "").trim().toLowerCase();
      return (cleanEventType && itemEvent === cleanEventType) || (cleanTitle && itemTitle === cleanTitle);
    });
  }

  function buildTotalOrderHistoryRecord(order = {}, productionRecord = null) {
    const status = normalizeStatus(order.orderStatus || order.order_status || "");
    const orderId = String(order.id || order.orderId || order.order_id || productionRecord?.orderId || "").trim();
    const storedHistoryItems = getTotalOrderHistoryStorageItems({ ...order, id: orderId }, productionRecord);
    const productionHistoryItems = Array.isArray(productionRecord?.actionHistory) ? productionRecord.actionHistory : [];
    const historyItems = [...storedHistoryItems, ...productionHistoryItems];

    const addSyntheticHistory = (title, description, meta, details = {}) => {
      if (totalOrderHistoryHasEvent(historyItems, details.eventType, title)) return;
      historyItems.push({
        title,
        description,
        meta,
        ...details
      });
    };

    if (status === "delivery" || status === "delivered") {
      addSyntheticHistory(
        "Moved to Delivery",
        "Item moved to Deliveries > For Delivery.",
        order.movedToDeliveryAt || order.moved_to_delivery_at || order.updatedAt || order.updated_at || "",
        { eventType: "moved-to-delivery", stage: "delivery", status: "delivery" }
      );
    }

    if (status === "delivered") {
      addSyntheticHistory(
        "Item Delivered",
        "Item was marked as delivered.",
        order.deliveredAt || order.delivered_at || order.updatedAt || order.updated_at || "",
        { eventType: "item-delivered", stage: "delivery", status: "delivered" }
      );
    }

    const baseRecord = productionRecord || normalizeOverviewActiveOrderRecord(order);
    const completedStages = Array.isArray(baseRecord?.completedStages) && baseRecord.completedStages.length
      ? baseRecord.completedStages
      : Array.isArray(order.completedStages)
        ? order.completedStages
        : Array.isArray(order.completed_stages)
          ? order.completed_stages
          : [];

    return {
      ...(baseRecord || {}),
      productionRecordId: baseRecord?.productionRecordId || order.productionRecordId || order.production_record_id || "",
      orderId,
      stage: baseRecord?.stage || (status === "delivery" || status === "delivered" ? "finishing" : "production"),
      status: baseRecord?.status || (status === "delivery" || status === "delivered" ? "completed" : "ongoing"),
      poNumber: baseRecord?.poNumber || order.poNumber || order.po_number || "—",
      joNumber: baseRecord?.joNumber || order.joNumber || order.jo_number || "—",
      client: baseRecord?.client || order.client || "—",
      item: baseRecord?.item || order.item || "—",
      quantity: baseRecord?.quantity || formatQuantity(order) || "—",
      convertedMeters: baseRecord?.convertedMeters || order.convertedMeters || order.converted_meters || "",
      convertedMetersDisplay: baseRecord?.convertedMetersDisplay || formatOverviewProductionMeters(order.convertedMeters || order.converted_meters),
      printingMaterial: baseRecord?.printingMaterial || order.printingMaterial || order.printing_material || "—",
      laminationMaterial: baseRecord?.laminationMaterial || order.laminationMaterial || order.lamination_material || "—",
      assignedTo: baseRecord?.assignedTo || order.assignTo || order.assign_to || "Unassigned",
      remarks: baseRecord?.remarks || "Order item history.",
      holdReason: baseRecord?.holdReason || "",
      completedStages,
      actionHistory: historyItems,
      deliveryDateRaw: baseRecord?.deliveryDateRaw || order.deliveryDate || order.delivery_date || "",
      orderCreatedRaw: baseRecord?.orderCreatedRaw || order.createdAt || order.created_at || "",
      updatedAtRaw: baseRecord?.updatedAtRaw || order.updatedAt || order.updated_at || "",
      takenAtRaw: baseRecord?.takenAtRaw || "",
      deliveryDate: baseRecord?.deliveryDate || formatDate(order.deliveryDate || order.delivery_date || ""),
      orderDate: baseRecord?.orderDate || formatDate(order.createdAt || order.created_at || ""),
      dateEntered: baseRecord?.dateEntered || formatOverviewProductionDateTime(order.updatedAt || order.updated_at || order.createdAt || order.created_at || "")
    };
  }

  function createTotalOrderActivityHistoryHTML(order = {}, productionRecord = null) {
    const historyRecord = buildTotalOrderHistoryRecord(order, productionRecord);
    const historyHTML = createOverviewProductionHistoryHTML(historyRecord);
    if (!historyHTML) return "";

    return historyHTML
      .replace("Production History", "Item History");
  }

  function createTotalOrderTableRow(order = {}) {
    const status = normalizeStatus(order.orderStatus || order.order_status);

    return `
      <tr class="total-orders-row" data-total-order-id="${escapeHTML(order.id)}">
        <td>
          <strong>${escapeHTML(order.joNumber || "—")}</strong>
          <small>${escapeHTML(order.poNumber || "—")}</small>
        </td>
        <td>${escapeHTML(order.client || "—")}</td>
        <td>${escapeHTML(order.item || "—")}</td>
        <td><span class="status ${escapeHTML(getStatusClass(status))}">${escapeHTML(getTotalOrdersStatusLabel(status))}</span></td>
        <td>${escapeHTML(formatQuantity(order))}</td>
        <td>${escapeHTML(formatDate(order.deliveryDate || order.delivery_date))}</td>
      </tr>
    `;
  }

  function createTotalOrderModalCard(order = {}) {
    const status = normalizeStatus(order.orderStatus || order.order_status);
    const deliveryAlert = getDeliveryAlert(order);
    const orderCodeText = getTotalOrderCodeText(order);
    const deliveryDate = formatDate(order.deliveryDate || order.delivery_date);
    const quantity = formatQuantity(order);

    return `
      <article class="total-order-list-card" data-total-order-id="${escapeHTML(order.id)}" data-total-order-status="${escapeHTML(status)}" data-total-order-alert="${escapeHTML(deliveryAlert.type)}" role="button" tabindex="0" aria-label="View details for ${escapeHTML(order.item || 'Untitled item')}">
        <div class="total-order-list-main">
          <div class="total-order-list-title-row">
            <div class="total-order-list-title-wrap">
              <h3>${escapeHTML(order.item || "Untitled item")}</h3>
              <p>${escapeHTML(order.client || "—")}</p>
            </div>

            <div class="total-order-list-status-stack">
              <span class="order-status-pill status-${escapeHTML(getStatusClass(status))}">${escapeHTML(getTotalOrdersStatusLabel(status))}</span>
              ${deliveryAlert.label ? `<em class="pr-delivery-alert-pill ${escapeHTML(deliveryAlert.pillClass)}">${escapeHTML(deliveryAlert.label)}</em>` : ""}
            </div>
          </div>

          <div class="total-order-list-code">${escapeHTML(orderCodeText)}</div>
        </div>

        <div class="total-order-list-meta">
          <span>
            <small>Quantity</small>
            <strong>${escapeHTML(quantity || "—")}</strong>
          </span>
          <span>
            <small>Delivery Date</small>
            <strong>${escapeHTML(deliveryDate)}</strong>
          </span>
        </div>
      </article>
    `;
  }

  function openTotalOrderDetails(orderId) {
    const order = findTotalOrderById(orderId);
    if (!order) return;

    const modal = ensureTotalOrdersDetailsModal();
    const body = modal.querySelector("#overviewTotalOrderDetailsBody");
    const subtitle = modal.querySelector("#overviewTotalOrderDetailsSubtitle");
    const status = normalizeStatus(order.orderStatus || order.order_status);
    const productionRecord = getTotalOrderProductionRecord(order);
    const deliveryAlert = getDeliveryAlert(order);
    const orderCodeText = getTotalOrderCodeText(order);
    const progressLabel = getTotalOrderProgressLabel(order, productionRecord);
    const completedStagesText = getTotalOrderCompletedStagesText(productionRecord);
    const deliveryAlertHTML = deliveryAlert.label
      ? `<span class="delivery-alert-badge alert-${escapeHTML(deliveryAlert.type)}">${escapeHTML(deliveryAlert.label)}</span>`
      : `<span class="delivery-alert-badge alert-clear">No urgent alert</span>`;
    const deliverySpecificFields = getOverviewDeliverySpecificFields(order);

    if (subtitle) {
      subtitle.textContent = "";
      subtitle.hidden = true;
    }

    if (body) {
      body.innerHTML = `
        <section class="total-order-detail-summary overview-detail-hero">
          <div>
            <span class="total-order-detail-eyebrow">${escapeHTML(getTotalOrdersStatusLabel(status))}</span>
            <h3>${escapeHTML(order.item || "Untitled item")}</h3>
            <p>${escapeHTML(order.client || "—")}</p>

          </div>
          <div class="total-order-detail-status-stack overview-detail-status-stack">
            <span class="order-status-pill status-${escapeHTML(getStatusClass(status))}">${escapeHTML(getTotalOrdersStatusLabel(status))}</span>
            ${deliveryAlertHTML}
          </div>
        </section>

        <section class="overview-detail-summary-grid total-order-summary-grid">
          <div class="overview-detail-summary-card">
            <span>Current Status</span>
            <strong>${escapeHTML(progressLabel)}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Delivery Date</span>
            <strong>${escapeHTML(formatDate(order.deliveryDate || order.delivery_date))}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Original Quantity</span>
            <strong>${escapeHTML(getOverviewOriginalQuantityText(order))}</strong>
          </div>
          <div class="overview-detail-summary-card">
            <span>Final Delivered Quantity</span>
            <strong>${escapeHTML(getOverviewDeliveredQuantityText(order))}</strong>
          </div>
        </section>

        <section class="total-order-detail-section overview-detail-section">
          <h3>Basic Order Info</h3>
          <div class="total-order-detail-grid overview-detail-grid">
            ${createTotalOrderDetailField("Item", escapeHTML(order.item || "—"), { wide: true })}
            ${createTotalOrderDetailField("Client", escapeHTML(order.client || "—"))}
            ${createTotalOrderDetailField("P.O. Number", escapeHTML(order.poNumber || order.po_number || "—"))}
            ${createTotalOrderDetailField("J.O. Number", escapeHTML(order.joNumber || order.jo_number || "—"))}
            ${createTotalOrderDetailField("Original Quantity", escapeHTML(formatQuantity(order)))}
            ${createTotalOrderDetailField("Unit", escapeHTML(order.unit || order.order_unit || "—"))}
            ${createTotalOrderDetailField("Assigned To", escapeHTML(order.assignTo || order.assign_to || productionRecord?.assignedTo || "—"))}
            ${createTotalOrderDetailField("Date Created", escapeHTML(formatDateTime(order.createdAt || order.created_at || "")))}
          </div>
        </section>

        <section class="total-order-detail-section overview-detail-section">
          <h3>Materials</h3>
          <div class="total-order-detail-grid overview-detail-grid">
            ${createTotalOrderDetailField("Printing Material", escapeHTML(order.printingMaterial || order.printing_material || productionRecord?.printingMaterial || "—"))}
            ${createTotalOrderDetailField("Lamination Material", escapeHTML(order.laminationMaterial || order.lamination_material || productionRecord?.laminationMaterial || "—"))}
          </div>
        </section>

        <section class="total-order-detail-section overview-detail-section total-order-quantity-section">
          <h3>Quantity Summary</h3>
          <div class="total-order-detail-grid overview-detail-grid">
            ${createTotalOrderDetailField("Original Quantity", escapeHTML(getOverviewOriginalQuantityText(order)))}
            ${createTotalOrderDetailField("Final Delivered Quantity", escapeHTML(getOverviewDeliveredQuantityText(order)), { wide: true })}
            ${createTotalOrderDetailField("Difference", escapeHTML(getOverviewDeliveredDifferenceText(order)))}
          </div>
        </section>


        <section class="total-order-detail-section overview-detail-section">
          <h3>Delivery Summary</h3>
          <div class="total-order-detail-grid overview-detail-grid">
            ${createTotalOrderDetailField("Delivery Status", `<em class="order-status-pill status-${escapeHTML(getStatusClass(status))}">${escapeHTML(getTotalOrdersStatusLabel(status))}</em>`)}
            ${createTotalOrderDetailField("Delivery Process Type", escapeHTML(getOverviewDeliveryProcessLabel(order)))}
            ${deliverySpecificFields.map(([label, value]) => createTotalOrderDetailField(label, escapeHTML(value))).join("")}
            ${createTotalOrderDetailField("Date Moved to Delivery", escapeHTML(formatDateTime(order.movedToDeliveryAt || order.moved_to_delivery_at || "")))}
            ${createTotalOrderDetailField("Date Delivered", escapeHTML(formatDate(order.deliveredAt || order.delivered_at || "")))}
            ${createTotalOrderDetailField("Alert", deliveryAlertHTML)}
          </div>
        </section>

        ${createTotalOrderActivityHistoryHTML(order, productionRecord)}
      `;

      body.scrollTop = 0;
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("overview-modal-open");
  }

  function ensureTotalOrdersModalTools() {
    const modal = document.getElementById("totalOrdersViewAllModal");
    const list = modal?.querySelector(".total-orders-modal-list");
    const body = list?.parentElement;
    if (!modal || !list || !body) return null;

    let tools = modal.querySelector(".total-orders-modal-tools");
    if (!tools) {
      tools = document.createElement("section");
      tools.className = "total-orders-modal-tools";
      body.insertBefore(tools, list);
    }

    return tools;
  }

  function renderTotalOrdersModalTools() {
    const tools = ensureTotalOrdersModalTools();
    if (!tools) return;

    const counts = getTotalOrdersSummaryCounts(state.orders);
    const filters = ["all", "pending", "production", "delivery", "delivered"];

    tools.innerHTML = `
      <div class="total-orders-tools-top">
        <label class="total-orders-search-field">
          <span>Search</span>
          <input id="overviewTotalOrdersSearch" type="search" value="${escapeHTML(totalOrdersModalState.search)}" placeholder="Search P.O., J.O., client, or item">
        </label>

        <div class="total-orders-filter-chips" aria-label="Total orders filters">
          ${filters.map((filter) => `
            <button class="total-orders-filter-chip${normalizeStatus(totalOrdersModalState.filter) === filter ? " active" : ""}" type="button" data-total-orders-filter="${escapeHTML(filter)}">
              ${escapeHTML(getTotalOrdersStatusFilterLabel(filter))} <span>(${counts[filter] || 0})</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="total-orders-summary-strip" aria-label="Total orders summary">
        <span><strong>${counts.all}</strong> Total</span>
        <span><strong>${counts.pending}</strong> Pending</span>
        <span><strong>${counts.production}</strong> In Production</span>
        <span><strong>${counts.delivery}</strong> For Delivery</span>
        <span><strong>${counts.delivered}</strong> Delivered</span>
      </div>
    `;

    const searchInput = tools.querySelector("#overviewTotalOrdersSearch");
    if (searchInput && searchInput.dataset.bound !== "true") {
      searchInput.dataset.bound = "true";
      searchInput.addEventListener("input", (event) => {
        totalOrdersModalState.search = event.target.value;
        renderTotalOrders();
        document.querySelector("#overviewTotalOrdersSearch")?.focus();
      });
    }

    if (tools.dataset.filterBound !== "true") {
      tools.dataset.filterBound = "true";
      tools.addEventListener("click", (event) => {
        const filterButton = event.target.closest("[data-total-orders-filter]");
        if (!filterButton) return;
        totalOrdersModalState.filter = filterButton.dataset.totalOrdersFilter || "all";
        renderTotalOrders();
      });
    }
  }

  function setupTotalOrdersInteractions() {
    const tableBody = document.querySelector(".total-orders-table tbody");
    const modalList = document.querySelector("#totalOrdersViewAllModal .total-orders-modal-list");

    if (tableBody && tableBody.dataset.totalOrderClickBound !== "true") {
      tableBody.dataset.totalOrderClickBound = "true";
      tableBody.addEventListener("click", (event) => {
        const row = event.target.closest("[data-total-order-id]");
        if (!row) return;
        openTotalOrderDetails(row.dataset.totalOrderId);
      });
    }

    if (modalList && modalList.dataset.totalOrderClickBound !== "true") {
      modalList.dataset.totalOrderClickBound = "true";
      modalList.addEventListener("click", (event) => {
        const card = event.target.closest("[data-total-order-id]");
        if (!card) return;
        openTotalOrderDetails(card.dataset.totalOrderId);
      });
    }
  }

  function renderTotalOrders() {
    const tbody = document.querySelector(".total-orders-table tbody");
    const modalList = document.querySelector("#totalOrdersViewAllModal .total-orders-modal-list");
    const modalCounter = document.querySelector("#totalOrdersViewAllModal .total-orders-counter strong");

    if (modalCounter) modalCounter.textContent = String(state.orders.length);

    const sortedOrders = sortOrdersRecentFirst(state.orders);
    const filteredOrders = getFilteredTotalOrders();
    renderTotalOrdersModalTools();
    setupTotalOrdersInteractions();

    if (tbody) {
      if (!sortedOrders.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6">No orders found.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = sortedOrders.slice(0, 10).map(createTotalOrderTableRow).join("");
      }
    }

    if (modalList) {
      const hasSearch = Boolean(totalOrdersModalState.search.trim());
      const hasFilter = normalizeStatus(totalOrdersModalState.filter) !== "all";

      if (!filteredOrders.length) {
        modalList.innerHTML = `
          <div class="overview-pending-empty">
            <strong>${hasSearch || hasFilter ? "No matching orders" : "No orders found"}</strong>
            <span>${hasSearch || hasFilter ? "Try another search keyword or filter." : "Orders from the Orders tab will appear here."}</span>
          </div>
        `;
      } else {
        modalList.innerHTML = `
          <div class="table-wrap total-orders-table-wrap total-orders-modal-table-wrap">
            <table class="total-orders-table total-orders-modal-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Client</th>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Quantity</th>
                  <th>Delivery Date</th>
                </tr>
              </thead>
              <tbody>
                ${filteredOrders.map(createTotalOrderTableRow).join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    }
  }

  function createOverviewStatusOrderCard(order, statusType) {
    if (statusType === "delivery") {
      const card = createOverviewForDeliveryCard(order);
      const orderId = escapeHTML(order.id ?? order.orderId ?? order.order_id ?? "");
      return card.replace('<article class="pr-record-card delivery-record-card overview-delivery-record-card"', `<article class="pr-record-card delivery-record-card overview-delivery-record-card" data-total-order-id="${orderId}" role="button" tabindex="0"`);
    }

    const quantity = formatQuantity(order);
    const deliveryDate = order.deliveryDate || order.delivery_date;
    const status = normalizeStatus(order.orderStatus || order.order_status);
    const isDelivered = statusType === "delivered";
    const orderId = order.id ?? order.orderId ?? order.order_id ?? "";

    return `
      <article class="pending-order-card overview-status-order-card ${isDelivered ? "delivered-order-card" : "delivery-order-card"}" data-total-order-id="${escapeHTML(orderId)}" role="button" tabindex="0" aria-label="View details for ${escapeHTML(order.item || 'order')}">
        <div class="overview-status-card-head">
          <div>
            <h3>${escapeHTML(order.item || "—")}</h3>
            <p>${escapeHTML(order.client || "—")}</p>
            <small>${escapeHTML(order.poNumber || order.po_number || "—")} • ${escapeHTML(order.joNumber || order.jo_number || "—")}</small>
          </div>
          <em class="order-status-pill status-${escapeHTML(getStatusClass(status))}">${escapeHTML(getStatusLabel(status))}</em>
        </div>

        ${isDelivered ? `
          <div class="pending-order-field">
            <span>Date Delivered</span>
            <strong>${escapeHTML(formatDate(order.deliveredAt || order.delivered_at || order.updatedAt || order.updated_at || ""))}</strong>
          </div>
        ` : `
          <div class="pending-order-field">
            <span>Delivery Date</span>
            <strong>${escapeHTML(formatDate(deliveryDate))}</strong>
          </div>
        `}
        <div class="pending-order-field">
          <span>P.O. Number</span>
          <strong>${escapeHTML(order.poNumber || order.po_number || "—")}</strong>
        </div>
        <div class="pending-order-field">
          <span>J.O. Number</span>
          <strong>${escapeHTML(order.joNumber || order.jo_number || "—")}</strong>
        </div>
        <div class="pending-order-field">
          <span>Original Quantity</span>
          <strong>${escapeHTML(quantity || "—")}</strong>
        </div>
        ${isDelivered ? `
          <div class="pending-order-field wide-field">
            <span>Final Delivered Quantity</span>
            <strong>${escapeHTML(getOverviewDeliveredQuantityText(order))}</strong>
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderOrderStatusModal({ modalId, listSelector, counterSelector, status, emptyTitle, emptyText }) {
    const modal = document.getElementById(modalId);
    const list = modal?.querySelector(listSelector);
    const counter = modal?.querySelector(counterSelector);
    if (!modal || !list) return;

    if (list.dataset.overviewStatusDetailsBound !== "true") {
      list.dataset.overviewStatusDetailsBound = "true";
      list.addEventListener("click", (event) => {
        const card = event.target.closest("[data-total-order-id]");
        if (!card) return;
        openTotalOrderDetails(card.dataset.totalOrderId);
      });
      list.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const card = event.target.closest("[data-total-order-id]");
        if (!card) return;
        event.preventDefault();
        openTotalOrderDetails(card.dataset.totalOrderId);
      });
    }

    const records = getOrdersByStatus(status);

    if (counter) {
      const value = counter.querySelector("strong");
      if (value) value.textContent = String(records.length);
    }

    if (!records.length) {
      list.innerHTML = `
        <div class="overview-pending-empty">
          <strong>${escapeHTML(emptyTitle)}</strong>
          <span>${escapeHTML(emptyText)}</span>
        </div>
      `;
      return;
    }

    list.innerHTML = records.map((order) => createOverviewStatusOrderCard(order, status)).join("");

    if (status === "delivery") {
      window.requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent("system:delivery-list-rendered"));
      });
    }
  }

  function renderDeliveryStatusModals() {
    renderOrderStatusModal({
      modalId: "forDeliveryModal",
      listSelector: ".delivery-orders-list",
      counterSelector: ".delivery-counter",
      status: "delivery",
      emptyTitle: "No for delivery orders",
      emptyText: "Orders moved to delivery will appear here."
    });

    renderOrderStatusModal({
      modalId: "deliveredOrdersModal",
      listSelector: ".delivered-orders-list",
      counterSelector: ".delivered-counter",
      status: "delivered",
      emptyTitle: "No delivered orders",
      emptyText: "Delivered orders will appear here."
    });
  }

  async function loadRecentActivity(options = {}) {
    try {
      const data = await requestJSON(OVERVIEW_ACTIVITY_API);
      state.activities = Array.isArray(data.activities) ? data.activities : [];
    } catch (error) {
      if (!options.silent) {
        state.activities = [];
      }
    }
  }

  function parseOverviewActivityTime(value = "") {
    const rawValue = String(value || "").trim();
    if (!rawValue || rawValue === "—") return 0;

    const directParsed = new Date(rawValue);
    if (!Number.isNaN(directParsed.getTime())) return directParsed.getTime();

    const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function normalizeOverviewActivityTitle(title = "", activity = {}) {
    const cleanTitle = String(title || "").trim();
    const text = `${cleanTitle} ${activity?.description || ""} ${activity?.eventType || ""} ${activity?.moduleName || activity?.module || ""}`.toLowerCase();
    const stageLabel = getOverviewActivityStageLabel(activity, text);

    if (!cleanTitle) return "Activity Updated";
    if (/\bbatches? combined\b|\bcombined batches\b/i.test(text)) return "Batches Combined";
    if (/\bnew order\b|\border added\b|\border created\b|\bissue order\b/i.test(text)) return "Order Created";
    if (/\border updated\b|\border edited\b|\bupdate order\b/i.test(text)) return "Order Updated";
    if (/\border taken\b|\btake order\b|\btaken from pending\b|\bmoved to production\b/i.test(text)) return "Moved to Printing";
    if (/\bmoved to delivery\b|\bfor delivery\b|\bdelivery process\b/i.test(text)) return "Moved to Delivery";
    if (/\bdelivered order\b|\bitem delivered\b|\bmarked as delivered\b/i.test(text)) return "Item Delivered";
    if (/\bproduction completed\b/i.test(text)) return stageLabel ? `${stageLabel} Completed` : "Production Completed";
    if (/\bhold\b|\bplaced on hold\b|\bput on hold\b/i.test(text)) return `${stageLabel || "Item"} Put on Hold`;
    if (/\bresume\b|\bresumed\b/i.test(text)) return `${stageLabel || "Production"} Resumed`;
    if (/\bcompleted\b/i.test(cleanTitle) && stageLabel) return `${stageLabel} Completed`;
    if (/\bongoing\b|\bon-going\b|\bstarted\b/i.test(text) && stageLabel) return `${stageLabel} Started`;

    return cleanTitle;
  }

  function normalizeOverviewActivityRoleLabel(value = "") {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim();
  }

  function getOverviewActivityStageLabel(activity = {}, fallbackText = "") {
    const rawStage = String(activity.stage || activity.stageStatus || "").trim();
    const text = `${rawStage} ${fallbackText || ""}`.toLowerCase();

    if (/printing/.test(text)) return "Printing";
    if (/rewinding/.test(text)) return "Rewinding";
    if (/lamination/.test(text)) return "Lamination";
    if (/slitting/.test(text)) return "Slitting";
    if (/finishing/.test(text)) return "Finishing";
    if (/delivery/.test(text)) return "Delivery";

    return rawStage ? getProductionStageLabel(rawStage) : "";
  }

  function getOverviewActivityItemLabel(activity = {}) {
    const item = String(activity.item || activity.itemName || activity.orderItem || "").trim();
    return item && item !== "—" ? item : "Item";
  }

  function hasOverviewMeaningfulActivityReference(activity = {}) {
    return [
      activity.joNumber,
      activity.poNumber,
      activity.client,
      activity.item,
      activity.itemName,
      activity.orderItem
    ].some((value) => {
      const text = String(value || "").trim();
      return Boolean(text && text !== "—");
    });
  }

  function findOverviewOrderForActivity(activity = {}) {
    const recordId = String(activity.recordId || activity.record_id || activity.referenceId || activity.reference_id || "").trim();
    const joNumber = String(activity.joNumber || activity.jo_number || "").trim().toLowerCase();
    const poNumber = String(activity.poNumber || activity.po_number || "").trim().toLowerCase();

    return (Array.isArray(state.orders) ? state.orders : []).find((order) => {
      const orderId = String(order.id || order.orderId || order.order_id || "").trim();
      const orderJo = String(order.joNumber || order.jo_number || "").trim().toLowerCase();
      const orderPo = String(order.poNumber || order.po_number || "").trim().toLowerCase();

      return (recordId && orderId && recordId === orderId)
        || (joNumber && orderJo && joNumber === orderJo)
        || (poNumber && orderPo && poNumber === orderPo);
    }) || null;
  }

  function getOverviewActivityReferenceLabel(activity = {}) {
    const joNumber = String(activity.joNumber || "").trim();
    const poNumber = String(activity.poNumber || "").trim();
    const refs = [joNumber && joNumber !== "—" ? `J.O. ${joNumber}` : "", poNumber && poNumber !== "—" ? `P.O. ${poNumber}` : ""].filter(Boolean);
    return refs.join(" / ");
  }

  function extractOverviewHoldReason(description = "") {
    const text = String(description || "").trim();
    if (!text) return "";

    const holdReasonMatch = text.match(/Hold reason:\s*([^.]*)/i);
    if (holdReasonMatch?.[1]) return holdReasonMatch[1].trim();

    const reasonMatch = text.match(/Reason:\s*([^.]*)/i);
    if (reasonMatch?.[1]) return reasonMatch[1].trim();

    const putHoldMatch = text.match(/put on hold\.\s*(.+)$/i);
    if (putHoldMatch?.[1]) return putHoldMatch[1].trim();

    return "";
  }

  function shouldExcludeOverviewRecentActivity(activity = {}) {
    const moduleName = String(activity.moduleName || activity.module || "").trim().toLowerCase();
    const eventType = String(activity.eventType || activity.event_type || "").trim().toLowerCase();
    const action = String(activity.action || "").trim().toLowerCase();
    const title = String(activity.title || "").trim().toLowerCase();
    const description = String(activity.description || "").trim().toLowerCase();
    const text = `${moduleName} ${eventType} ${action} ${title} ${description}`;

    if (/\b(auth|login|logout|logged in|logged out)\b/.test(text)) return true;
    if (/\b(user created|user updated|user deleted|created user|updated user|deleted user|add user|edit user|delete user)\b/.test(text)) return true;
    if (/\b(database backup|backup database|downloaded a database backup)\b/.test(text)) return true;
    if (moduleName === "settings" || moduleName === "users") return true;

    const sourceType = String(activity.sourceType || "").trim().toLowerCase();
    const hasReference = hasOverviewMeaningfulActivityReference(activity);
    const looksLikeGenericSystemMovement = /\b(production completed|delivered order|item delivered|moved to printing|moved to delivery|order taken|new order|order updated)\b/i.test(text);

    // Hide generic API notification rows that do not contain item/order details.
    // These are the rows that created blank "—" cards and repeated "Production Completed" messages.
    if (sourceType === "api" && !hasReference && looksLikeGenericSystemMovement) return true;

    const normalizedTitle = normalizeOverviewActivityTitle(activity.title || "", activity);
    const normalizedStatus = normalizeProductionStageStatus(activity.status || activity.stageStatus || activity.stage_status || "");
    const isPendingStatus = normalizedStatus === "pending" || /\bpending\b|waiting to start/i.test(text);
    const isMovementOrStartTitle = /^(Moved to|.+ Started)$/i.test(normalizedTitle);

    // Guard against false movement cards from pending/current-state records.
    // A pending item should never appear as Moved/Started in Recent Activity.
    // This applies to Printing, Rewinding, Lamination, and Slitting.
    if (isPendingStatus && isMovementOrStartTitle) return true;

    return false;
  }

  function applyOverviewRecentActivityTemplate(activity = {}) {
    const text = `${activity.title || ""} ${activity.description || ""} ${activity.eventType || ""}`.toLowerCase();
    const stageLabel = getOverviewActivityStageLabel(activity, text);
    const itemLabel = getOverviewActivityItemLabel(activity);
    const refLabel = getOverviewActivityReferenceLabel(activity);
    const assignTo = String(activity.assignTo || activity.assign_to || "").trim();
    const metersDisplay = String(activity.meters || activity.metersDisplay || "").trim();
    const currentTitle = normalizeOverviewActivityTitle(activity.title || "Activity Updated", activity);
    let title = currentTitle;
    let description = String(activity.description || "").trim();

    if (currentTitle === "Order Created") {
      title = "Order Created";
      description = `New order for ${itemLabel} was added${assignTo ? ` and assigned to ${assignTo}` : ""}.`;
    } else if (currentTitle === "Order Updated") {
      title = "Order Updated";
      description = `Order details for ${itemLabel}${refLabel ? ` (${refLabel})` : ""} were updated.`;
    } else if (currentTitle === "Moved to Printing") {
      title = "Moved to Printing";
      description = `${itemLabel} was taken from pending and moved to Printing Ongoing.`;
    } else if (/Put on Hold$/i.test(currentTitle)) {
      title = `${stageLabel || "Item"} Put on Hold`;
      const reason = extractOverviewHoldReason(description);
      description = `${itemLabel} was put on hold${reason ? `. Reason: ${reason}` : "."}`;
    } else if (/Resumed$/i.test(currentTitle)) {
      title = `${stageLabel || "Production"} Resumed`;
      description = `${itemLabel} resumed ${stageLabel ? `${stageLabel} ` : "production "}process.`;
    } else if (currentTitle === "Moved to Delivery") {
      title = "Moved to Delivery";
      description = `${itemLabel} was moved to Deliveries for dispatch.`;
    } else if (currentTitle === "Item Delivered") {
      title = "Item Delivered";
      description = `${itemLabel} was marked as delivered.`;
    } else if (/Completed$/i.test(currentTitle) && currentTitle !== "Production Completed") {
      title = `${stageLabel || currentTitle.replace(/\s*Completed$/i, "") || "Production"} Completed`;
      description = `${itemLabel} finished ${stageLabel || "production"}${metersDisplay ? ` with ${metersDisplay}` : ""}.`;
    } else if (currentTitle === "Production Completed") {
      title = stageLabel ? `${stageLabel} Completed` : "Moved to Delivery";
      description = stageLabel
        ? `${itemLabel} finished ${stageLabel}${metersDisplay ? ` with ${metersDisplay}` : ""}.`
        : `${itemLabel} was moved to Deliveries for dispatch.`;
    } else if (currentTitle === "Batches Combined") {
      title = "Batches Combined";
      description = description || `Batches for ${itemLabel} were combined for the next production stage.`;
    } else if (/Started$/i.test(currentTitle)) {
      title = `${stageLabel || "Production"} Started`;
      description = `${stageLabel || "Production"} process started for ${itemLabel}.`;
    } else if (!description || description === title || /activity updated/i.test(title)) {
      title = stageLabel ? `${stageLabel} Updated` : "Production Updated";
      description = `${itemLabel} production movement was updated.`;
    }

    return {
      ...activity,
      title,
      description
    };
  }

  function getOverviewActivityTone(activity = {}) {
    const text = `${activity.title || ""} ${activity.description || ""} ${activity.eventType || ""}`.toLowerCase();

    if (text.includes("hold")) return "orange";
    if (text.includes("resume")) return "green";
    if (text.includes("completed") || text.includes("delivered")) return "green";
    if (text.includes("combined")) return "purple";
    if (text.includes("started") || text.includes("ongoing") || text.includes("take order")) return "blue";
    if (text.includes("created") || text.includes("added") || text.includes("issue")) return "cyan";
    return "blue";
  }

  function getOverviewActivityIcon(activity = {}) {
    const text = `${activity.title || ""} ${activity.description || ""} ${activity.eventType || ""} ${activity.moduleName || activity.module || ""}`.toLowerCase();

    /*
      Keep Recent Activity icons simple and recognizable using only icons
      that already exist in the current icon system.
    */
    if (/\b(delivered order|item delivered|marked as delivered|delivered)\b/.test(text)) return "check";
    if (/\b(moved to delivery|for delivery|deliveries|delivery dispatch|dispatch)\b/.test(text)) return "delivery";
    if (/\b(production completed|completed|finished)\b/.test(text)) return "check";
    if (/\b(batches? combined|combined batches|combined)\b/.test(text)) return "box";
    if (/\b(hold|on hold|put on hold|placed on hold)\b/.test(text)) return "bell";
    if (/\b(resume|resumed|started|ongoing|on-going|take order|order taken|moved to printing|printing started)\b/.test(text)) return "bolt";
    if (/\b(order updated|updated order|order edited|edited)\b/.test(text)) return "settings";
    if (/\b(order created|new order|order added|added order|issue order|created)\b/.test(text)) return "clipboard";

    return "clipboard";
  }

  function createOverviewActivityFromOrder(order = {}) {
    const createdAt = order.createdAt || order.created_at || "";
    const activity = {
      id: `order-created:${order.id || order.orderId || order.order_id || order.joNumber || order.jo_number || createdAt}`,
      title: "Order Created",
      description: "",
      joNumber: order.joNumber || order.jo_number || "—",
      poNumber: order.poNumber || order.po_number || "—",
      client: order.client || "—",
      item: order.item || "—",
      assignTo: order.assignTo || order.assign_to || "",
      operators: "",
      meters: "",
      timeRaw: createdAt,
      timeDisplay: formatDateTime(createdAt),
      sortTime: parseOverviewActivityTime(createdAt),
      tone: "cyan",
      icon: "clipboard",
      sourceType: "order"
    };

    const templatedActivity = applyOverviewRecentActivityTemplate(activity);

    return {
      ...templatedActivity,
      tone: getOverviewActivityTone(templatedActivity),
      icon: getOverviewActivityIcon(templatedActivity)
    };
  }

  function createOverviewActivityFromProductionHistory(record = {}, history = {}, index = 0) {
    const title = normalizeOverviewActivityTitle(getOverviewHistoryDisplayTitle(history) || history.title, history);
    const cleanDescription = cleanOverviewProductionHistoryDescription(history.description || "", history) || "Production activity was updated.";
    const operators = String(history.operators || extractOverviewHistoryOperators(history.description) || "").trim();
    const timeDisplay = history.meta || "—";
    const timeRaw = history.meta || record.updatedAtRaw || record.takenAtRaw || record.orderCreatedRaw || "";
    const meters = Number(history.meters || 0) > 0 ? formatOverviewProductionMeters(history.meters) : "";
    const wasteMeters = Number(history.wasteMeters || 0) > 0 ? formatOverviewProductionMeters(history.wasteMeters) : "";
    const batchLabel = getOverviewHistoryBatchLabel(history);
    const baseActivity = {
      id: `production-history:${record.id}:${title}:${timeDisplay}:${index}`,
      title,
      description: cleanDescription,
      joNumber: record.joNumber || "—",
      poNumber: record.poNumber || "—",
      client: record.client || "—",
      item: record.item || "—",
      stage: getProductionStageLabel(history.stage || record.stage),
      status: getProductionStageStatusLabel(history.status || record.status),
      operators,
      meters,
      wasteMeters,
      batchLabel,
      timeRaw,
      timeDisplay,
      sortTime: parseOverviewActivityTime(timeRaw),
      eventType: history.eventType || "production",
      sourceType: "production_history"
    };

    const templatedActivity = applyOverviewRecentActivityTemplate(baseActivity);

    return {
      ...templatedActivity,
      tone: getOverviewActivityTone(templatedActivity),
      icon: getOverviewActivityIcon(templatedActivity)
    };
  }

  function normalizeOverviewApiActivity(activity = {}, index = 0) {
    const createdAt = activity.createdAt || activity.created_at || activity.time || "";
    const matchedOrder = findOverviewOrderForActivity(activity);
    const baseActivity = {
      id: `api-activity:${activity.id || index}:${createdAt}`,
      title: activity.title || activity.eventTitle || activity.event_type || "Activity Updated",
      description: activity.message || activity.description || "",
      joNumber: activity.joNumber || activity.jo_number || matchedOrder?.joNumber || matchedOrder?.jo_number || "",
      poNumber: activity.poNumber || activity.po_number || matchedOrder?.poNumber || matchedOrder?.po_number || "",
      client: activity.client || matchedOrder?.client || "",
      item: activity.item || activity.itemName || matchedOrder?.item || "",
      assignTo: activity.assignTo || activity.assign_to || matchedOrder?.assignTo || matchedOrder?.assign_to || "",
      operators: activity.operators || "",
      meters: activity.metersDisplay || activity.meters || "",
      timeRaw: createdAt,
      timeDisplay: formatDateTime(createdAt),
      sortTime: parseOverviewActivityTime(createdAt),
      eventType: activity.eventType || activity.event_type || "",
      moduleName: activity.moduleName || activity.module_name || activity.module || "",
      action: activity.action || "",
      recordId: activity.recordId || activity.record_id || "",
      stage: activity.stage || activity.stageName || "",
      status: activity.status || activity.stageStatus || "",
      sourceType: "api"
    };

    const templatedActivity = applyOverviewRecentActivityTemplate(baseActivity);

    return {
      ...templatedActivity,
      tone: getOverviewActivityTone(templatedActivity),
      icon: getOverviewActivityIcon(templatedActivity)
    };
  }

  function getOverviewActivityActionKey(activity = {}) {
    const title = normalizeOverviewActivityTitle(activity.title || "", activity).toLowerCase();
    const text = `${title} ${activity.description || ""} ${activity.eventType || ""}`.toLowerCase();

    if (title === "order created" || /new order|order created|order added|issue order/.test(text)) return "order_created";
    if (title === "order updated" || /order updated|order edited|update order/.test(text)) return "order_updated";
    if (title === "moved to printing" || /order taken|take order|moved to printing|taken from pending|printing started/.test(text)) return "moved_to_printing";
    if (title === "moved to delivery" || /moved to delivery|for delivery|delivery process/.test(text)) return "moved_to_delivery";
    if (title === "item delivered" || /delivered order|item delivered|marked as delivered/.test(text)) return "delivered";
    if (/put on hold|placed on hold|hold/.test(text)) return "hold";
    if (/resume|resumed/.test(text)) return "resume";
    if (/combined/.test(text)) return "combined";
    if (/production completed/.test(text)) return "moved_to_delivery";
    if (/completed/.test(text)) return "completed";
    if (/started|ongoing|on-going/.test(text)) return "started";

    return title.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "activity";
  }

  function getOverviewActivityMinuteBucket(activity = {}) {
    const sortTime = Number(activity.sortTime || parseOverviewActivityTime(activity.timeRaw || activity.timeDisplay || "") || 0);
    return sortTime > 0 ? Math.floor(sortTime / 60000) : 0;
  }

  function hasOverviewActivityReference(activity = {}) {
    return Boolean(
      String(activity.joNumber || "").trim() ||
      String(activity.poNumber || "").trim() ||
      String(activity.item || "").trim() ||
      String(activity.client || "").trim()
    );
  }

  function getOverviewActivityReferenceKey(activity = {}) {
    const joNumber = String(activity.joNumber || "").trim().toLowerCase();
    const poNumber = String(activity.poNumber || "").trim().toLowerCase();
    const item = String(activity.item || "").trim().toLowerCase();

    if (joNumber || poNumber) return `${joNumber || "no-jo"}:${poNumber || "no-po"}`;
    if (item) return `item:${item}`;
    return "no-reference";
  }

  function getOverviewActivityPriority(activity = {}) {
    const sourceType = String(activity.sourceType || "").toLowerCase();
    let priority = 0;

    if (sourceType === "production_history") priority += 300;
    if (sourceType === "order") priority += 220;
    if (sourceType === "api") priority += 100;

    if (hasOverviewActivityReference(activity)) priority += 40;
    if (String(activity.description || "").trim() && String(activity.description || "").trim() !== "—") priority += 15;
    if (String(activity.operators || "").trim()) priority += 10;
    if (String(activity.meters || "").trim()) priority += 10;

    return priority;
  }

  function getOverviewActivityDedupeKey(activity = {}) {
    const actionKey = getOverviewActivityActionKey(activity);
    const referenceKey = getOverviewActivityReferenceKey(activity);
    const minuteBucket = getOverviewActivityMinuteBucket(activity);
    const stage = String(activity.stage || "").trim().toLowerCase();
    const status = String(activity.status || "").trim().toLowerCase();

    if (actionKey === "order_created") {
      if (referenceKey !== "no-reference") return `${actionKey}:${referenceKey}`;
      return `${actionKey}:generic:${minuteBucket}`;
    }

    if (["order_updated", "moved_to_printing", "moved_to_delivery", "delivered", "hold", "resume", "combined", "completed", "started"].includes(actionKey)) {
      if (referenceKey !== "no-reference") return `${actionKey}:${referenceKey}:${stage}:${status}:${minuteBucket}`;
      return `${actionKey}:generic:${minuteBucket}`;
    }

    const description = String(activity.description || "").trim().toLowerCase();
    return `${actionKey}:${referenceKey}:${minuteBucket}:${description}`;
  }

  function shouldHideOverviewGenericDuplicate(activity = {}, detailedBuckets = new Set()) {
    if (String(activity.sourceType || "").toLowerCase() !== "api") return false;
    if (hasOverviewActivityReference(activity)) return false;

    const actionKey = getOverviewActivityActionKey(activity);
    const minuteBucket = getOverviewActivityMinuteBucket(activity);
    if (!minuteBucket) return false;

    for (let offset = -1; offset <= 1; offset += 1) {
      if (detailedBuckets.has(`${actionKey}:${minuteBucket + offset}`)) return true;
    }

    return false;
  }

  function shouldHideOverviewApiReferenceDuplicate(activity = {}, detailedReferenceBuckets = new Set()) {
    if (String(activity.sourceType || "").toLowerCase() !== "api") return false;
    if (!hasOverviewActivityReference(activity)) return false;

    const actionKey = getOverviewActivityActionKey(activity);
    const referenceKey = getOverviewActivityReferenceKey(activity);
    const minuteBucket = getOverviewActivityMinuteBucket(activity);
    if (!minuteBucket || referenceKey === "no-reference") return false;

    for (let offset = -1; offset <= 1; offset += 1) {
      if (detailedReferenceBuckets.has(`${actionKey}:${referenceKey}:${minuteBucket + offset}`)) return true;
    }

    return false;
  }

  function getOverviewRecentActivityRecords() {
    const activityMap = new Map();

    const putActivity = (activity) => {
      if (!activity) return;

      const normalizedActivity = applyOverviewRecentActivityTemplate({
        ...activity,
        title: normalizeOverviewActivityTitle(activity.title || "Activity Updated", activity),
        sortTime: activity.sortTime || parseOverviewActivityTime(activity.timeRaw || activity.timeDisplay || "")
      });

      if (shouldExcludeOverviewRecentActivity(normalizedActivity)) return;

      const key = getOverviewActivityDedupeKey(normalizedActivity);
      const existing = activityMap.get(key);

      if (!existing || getOverviewActivityPriority(normalizedActivity) > getOverviewActivityPriority(existing)) {
        activityMap.set(key, normalizedActivity);
      }
    };

    sortOrdersRecentFirst(state.orders)
      .slice(0, 25)
      .forEach((order) => putActivity(createOverviewActivityFromOrder(order)));

    const recordMap = new Map();
    const addRecord = (record) => {
      const normalizedRecord = record?.overviewSourceType || String(record?.id || "").startsWith("production-status:")
        ? record
        : normalizeOverviewProductionRecord(record);
      if (!normalizedRecord) return;

      const key = [
        normalizedRecord.productionRecordId || normalizedRecord.sourceRecordId || normalizedRecord.orderId || normalizedRecord.id,
        normalizedRecord.stage,
        normalizedRecord.status,
        normalizedRecord.batchLabel || normalizedRecord.overviewBatchLabel || ""
      ].join(":");

      if (!recordMap.has(key)) recordMap.set(key, normalizedRecord);
    };

    state.productionRecords.forEach(addRecord);
    getOverviewProductionStatusModuleRecords().forEach(addRecord);

    recordMap.forEach((record) => {
      getOverviewProductionHistoryItems(record).forEach((history, index) => {
        const title = String(history.title || "").trim();
        if (!title) return;
        if (/^issue order$/i.test(title)) return;
        if (/pending$/i.test(title) && !/hold|ongoing|completed|take order|combined/i.test(title)) return;
        if (shouldHideOverviewStaleCompletedHistory(record, history)) return;
        putActivity(createOverviewActivityFromProductionHistory(record, history, index));
      });
    });

    state.activities.forEach((activity, index) => putActivity(normalizeOverviewApiActivity(activity, index)));

    const activities = Array.from(activityMap.values());
    const detailedBuckets = new Set();
    const detailedReferenceBuckets = new Set();

    activities.forEach((activity) => {
      const actionKey = getOverviewActivityActionKey(activity);
      const minuteBucket = getOverviewActivityMinuteBucket(activity);
      if (!minuteBucket) return;

      if (hasOverviewActivityReference(activity)) {
        detailedBuckets.add(`${actionKey}:${minuteBucket}`);
      }

      if (String(activity.sourceType || "").toLowerCase() !== "api" && hasOverviewActivityReference(activity)) {
        const referenceKey = getOverviewActivityReferenceKey(activity);
        if (referenceKey !== "no-reference") detailedReferenceBuckets.add(`${actionKey}:${referenceKey}:${minuteBucket}`);
      }
    });

    return activities
      .filter((activity) => activity.sortTime || activity.timeDisplay !== "—")
      .filter((activity) => hasOverviewMeaningfulActivityReference(activity))
      .filter((activity) => !shouldHideOverviewGenericDuplicate(activity, detailedBuckets))
      .filter((activity) => !shouldHideOverviewApiReferenceDuplicate(activity, detailedReferenceBuckets))
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
  }

  function createOverviewRecentActivityCard(activity = {}, compact = false) {
    const title = activity.title || "Activity Updated";
    const itemName = String(activity.item || "").trim();
    const clientName = String(activity.client || "").trim();
    const joNumber = String(activity.joNumber || "").trim();
    const poNumber = String(activity.poNumber || "").trim();
    const orderParts = [joNumber, poNumber]
      .filter((part) => part && part !== "—");
    const compactOrderParts = [
      poNumber && poNumber !== "—" ? poNumber : "",
      joNumber && joNumber !== "—" ? joNumber : ""
    ].filter(Boolean);
    const compactOrderText = compactOrderParts.join(" • ");
    const metaParts = [orderParts.join(" • "), clientName]
      .filter((part) => String(part || "").trim() && String(part || "").trim() !== "—");
    const metaText = metaParts.join(" — ");
    const description = String(activity.description || "").trim();
    const itemClientDescription = [clientName, itemName].filter(Boolean).join(" — ");
    const shouldShowDescription = description
      && description.toLowerCase() !== itemClientDescription.toLowerCase()
      && description.toLowerCase() !== itemName.toLowerCase();
    const tags = [
      activity.operators ? `<small class="operator-tag">Operator/s · ${escapeHTML(activity.operators)}</small>` : "",
      activity.meters ? `<small class="meters-tag">Meters · ${escapeHTML(activity.meters)}</small>` : "",
      activity.wasteMeters ? `<small class="waste-tag">Waste · ${escapeHTML(activity.wasteMeters)}</small>` : "",
      activity.batchLabel ? `<small class="batch-tag">${escapeHTML(activity.batchLabel)}</small>` : ""
    ].filter(Boolean).join("");

    const compactBody = `
      <div class="overview-activity-compact-head">
        <strong>${escapeHTML(title)}</strong>
        <time>${escapeHTML(activity.timeDisplay || "—")}</time>
      </div>
      <p class="overview-activity-item">${escapeHTML(itemName || "—")}</p>
      ${compactOrderText ? `<p class="overview-activity-subtitle">${escapeHTML(compactOrderText)}</p>` : ""}
    `;

    const fullBody = `
      <div class="overview-activity-title-row">
        <strong>${escapeHTML(title)}</strong>
        <time>${escapeHTML(activity.timeDisplay || "—")}</time>
      </div>
      ${itemName ? `<p class="overview-activity-item">${escapeHTML(itemName)}</p>` : ""}
      ${metaText ? `<p class="overview-activity-subtitle">${escapeHTML(metaText)}</p>` : ""}
      ${shouldShowDescription ? `<p class="overview-activity-description">${escapeHTML(description)}</p>` : ""}
      ${tags ? `<div class="pr-history-tags overview-activity-tags">${tags}</div>` : ""}
    `;

    return `
      <article class="overview-activity-card${compact ? " compact" : ""}" data-activity-tone="${escapeHTML(activity.tone || "blue")}">
        <span class="overview-activity-icon"><i data-icon="${escapeHTML(activity.icon || "bolt")}"></i></span>
        <div class="overview-activity-content">
          ${compact ? compactBody : fullBody}
        </div>
      </article>
    `;
  }

  function filterOverviewRecentActivities(activities = []) {
    const keyword = recentActivityModalState.search.trim().toLowerCase();
    if (!keyword) return activities;

    return activities.filter((activity) => [
      activity.title,
      activity.description,
      activity.joNumber,
      activity.poNumber,
      activity.client,
      activity.item,
      activity.operators,
      activity.stage,
      activity.status
    ].join(" ").toLowerCase().includes(keyword));
  }

  function ensureOverviewRecentActivityModal() {
    let modal = document.getElementById("overviewRecentActivityModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "overview-modal-backdrop overview-recent-activity-modal";
    modal.id = "overviewRecentActivityModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="overview-modal" role="dialog" aria-modal="true" aria-labelledby="overviewRecentActivityModalTitle">
        <header class="overview-modal-head">
          <div class="overview-modal-title-wrap">
            <h2 id="overviewRecentActivityModalTitle">Recent Activity</h2>
            <p class="overview-total-order-subtitle">Latest system-wide order and production movements.</p>
          </div>
          <div class="overview-modal-head-right">
            <span class="overview-modal-counter activity-counter"><strong>0</strong><small>Items</small></span>
            <button class="overview-modal-close" type="button" aria-label="Close recent activity modal"><span>×</span></button>
          </div>
        </header>
        <div class="overview-modal-body">
          <div class="overview-activity-modal-tools">
            <label class="total-orders-search-field">
              <span>Search</span>
              <input id="overviewRecentActivitySearch" type="search" placeholder="Search activity, P.O., J.O., client, or item">
            </label>
          </div>
          <div class="overview-activity-modal-list"></div>
        </div>
        <footer class="overview-modal-footer">
          <button class="overview-modal-secondary" type="button">Close</button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);
    modal.querySelector(".overview-modal-close")?.addEventListener("click", () => closeOverviewModal(modal));
    modal.querySelector(".overview-modal-secondary")?.addEventListener("click", () => closeOverviewModal(modal));
    modal.querySelector("#overviewRecentActivitySearch")?.addEventListener("input", (event) => {
      recentActivityModalState.search = event.target.value.trim();
      renderOverviewRecentActivityModal();
      document.querySelector("#overviewRecentActivitySearch")?.focus();
    });

    return modal;
  }

  function renderOverviewRecentActivityModal() {
    const modal = ensureOverviewRecentActivityModal();
    const list = modal.querySelector(".overview-activity-modal-list");
    const counter = modal.querySelector(".activity-counter strong");
    const searchInput = modal.querySelector("#overviewRecentActivitySearch");
    const activities = filterOverviewRecentActivities(getOverviewRecentActivityRecords());

    if (counter) counter.textContent = String(activities.length);
    if (searchInput && searchInput.value !== recentActivityModalState.search) searchInput.value = recentActivityModalState.search;
    if (!list) return;

    if (!activities.length) {
      list.innerHTML = `
        <div class="overview-activity-empty large">
          <p>No matching activity</p>
          <time>Try another keyword.</time>
        </div>
      `;
      return;
    }

    list.innerHTML = activities.slice(0, 80).map((activity) => createOverviewRecentActivityCard(activity, true)).join("");
  }

  function setupOverviewRecentActivityInteractions() {
    const viewAllButton = document.querySelector(".overview-view .activity-panel .ghost-btn");
    if (!viewAllButton || viewAllButton.dataset.overviewActivityBound === "true") return;

    viewAllButton.dataset.overviewActivityBound = "true";
    viewAllButton.addEventListener("click", () => {
      recentActivityModalState.search = "";
      renderOverviewRecentActivityModal();
      openOverviewModal("overviewRecentActivityModal");
      document.querySelector("#overviewRecentActivitySearch")?.focus();
    });
  }

  function renderRecentActivity() {
    const list = document.querySelector(".overview-view .activity-list");
    if (!list) return;

    const activities = getOverviewRecentActivityRecords();
    setupOverviewRecentActivityInteractions();

    if (!activities.length) {
      list.innerHTML = `
        <div class="overview-activity-empty">
          <p>No recent activity yet</p>
          <time>New order movements will appear here.</time>
        </div>
      `;
      return;
    }

    list.innerHTML = activities.slice(0, 8).map((activity) => createOverviewRecentActivityCard(activity, true)).join("");
  }

  function getYearFromOrder(order) {
    return getOrderDate(order).getFullYear();
  }

  function setupYearOptions() {
    const select = document.getElementById("yearlyGraphYear");
    if (!select) return;

    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear]);

    state.orders.forEach((order) => {
      const year = getYearFromOrder(order);
      if (year) years.add(year);
    });

    const currentValue = select.value || String(currentYear);
    const sortedYears = [...years].sort((a, b) => b - a);

    select.innerHTML = sortedYears
      .map((year) => `<option value="${year}" ${String(year) === currentValue ? "selected" : ""}>${year}</option>`)
      .join("");

    if (!sortedYears.map(String).includes(currentValue)) {
      select.value = String(sortedYears[0] || currentYear);
    }
  }

  function getYearlyValues(metric, year) {
    const values = Array(12).fill(0);

    state.orders.forEach((order) => {
      const orderDate = getOrderDate(order);
      if (orderDate.getFullYear() !== Number(year)) return;

      const status = normalizeStatus(order.orderStatus);
      const matchesMetric =
        metric === "total" ||
        (metric === "pending" && status === "pending") ||
        (metric === "active" && status === "production") ||
        (metric === "delivery" && status === "delivery") ||
        (metric === "delivered" && status === "delivered");

      if (!matchesMetric) return;

      values[orderDate.getMonth()] += 1;
    });

    return values;
  }

  function createSmoothPath(points) {
    if (!points.length) return "";

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 1; index < points.length; index++) {
      const current = points[index];
      const previous = points[index - 1];
      const controlX = (previous.x + current.x) / 2;
      path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
    }

    return path;
  }

  function renderYearlyGraph() {
    setupYearOptions();

    const yearlyPanel = document.querySelector(".yearly-panel");
    const selectedYear = document.getElementById("yearlyGraphYear")?.value || String(new Date().getFullYear());
    const metric = state.yearlyMetric;
    const values = getYearlyValues(metric, selectedYear);
    const maxValue = Math.max(...values, 1);
    const graphWidth = 720;
    const graphHeight = 184;
    const topPadding = 30;
    const chartBaseY = 224;
    const monthColumnWidth = graphWidth / 12;
    const points = values.map((value, index) => {
      const x = Math.round(monthColumnWidth * index + monthColumnWidth / 2);
      const y = Math.round(topPadding + (1 - value / maxValue) * graphHeight);
      return { x, y, value, month: monthLabels[index] };
    });
    const linePath = createSmoothPath(points);
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPath = `${linePath} L ${lastPoint.x} ${chartBaseY} L ${firstPoint.x} ${chartBaseY} Z`;

    const line = document.getElementById("yearlyGraphLine");
    const area = document.getElementById("yearlyGraphArea");
    const pointsGroup = document.getElementById("yearlyGraphPoints");
    const yLabels = document.getElementById("yearlyGraphYLabels");
    const tooltip = document.getElementById("lineTooltip");

    yearlyPanel?.setAttribute("data-yearly-metric", metric);

    if (line) line.setAttribute("d", linePath);
    if (area) area.setAttribute("d", areaPath);

    if (yLabels) {
      yLabels.innerHTML = `
        <span>${maxValue}</span>
        <span>${Math.round(maxValue * .75)}</span>
        <span>${Math.round(maxValue * .5)}</span>
        <span>${Math.round(maxValue * .25)}</span>
      `;
    }

    if (pointsGroup) {
      pointsGroup.innerHTML = "";

      const svgElement = document.querySelector(".yearly-panel .line-chart.enhanced-line-chart svg");
      let monthLabelsGroup = document.getElementById("yearlyGraphSvgMonthLabels");

      if (!monthLabelsGroup && svgElement) {
        monthLabelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        monthLabelsGroup.setAttribute("id", "yearlyGraphSvgMonthLabels");
        monthLabelsGroup.setAttribute("class", "svg-month-labels");
        svgElement.appendChild(monthLabelsGroup);
      }

      if (monthLabelsGroup) {
        monthLabelsGroup.innerHTML = "";
        points.forEach((point) => {
          const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
          label.setAttribute("x", point.x);
          label.setAttribute("y", "252");
          label.setAttribute("text-anchor", "middle");
          label.textContent = point.month;
          monthLabelsGroup.appendChild(label);
        });
      }

      points.forEach((point) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", "6");
        circle.dataset.month = point.month;
        circle.dataset.value = point.value;

        circle.addEventListener("mouseenter", () => {
          if (tooltip) {
            const metricLabel = document.querySelector(`[data-yearly-metric="${metric}"]`)?.textContent?.trim() || "Orders";
            tooltip.innerHTML = `${point.month} ${selectedYear}<br><b>${point.value.toLocaleString()}</b><small>${metricLabel}</small>`;
            tooltip.style.left = `calc(${Math.max(2, Math.min((point.x / graphWidth) * 100, 92))}% - 26px)`;
            tooltip.style.top = `calc(${(point.y / 260) * 100}% - 58px)`;
            tooltip.classList.add("show");
          }
        });

        circle.addEventListener("mouseleave", () => {
          tooltip?.classList.remove("show");
        });

        pointsGroup.appendChild(circle);
      });
    }

    renderYearlySummary(values);
  }

  function renderYearlySummary(values) {
    const summaryCards = Array.from(document.querySelectorAll("#yearlySummaryGrid .yearly-summary-card"));
    if (!summaryCards.length) return;

    const total = values.reduce((sum, value) => sum + value, 0);
    const highestValue = Math.max(...values);
    const lowestValue = Math.min(...values);
    const highestIndex = values.indexOf(highestValue);
    const lowestIndex = values.indexOf(lowestValue);
    const average = total / values.length;

    const summaryValues = [
      total.toLocaleString(),
      `${monthLabels[highestIndex]} (${highestValue})`,
      `${monthLabels[lowestIndex]} (${lowestValue})`,
      average.toFixed(1)
    ];

    summaryCards.forEach((card, index) => {
      const strong = card.querySelector("strong");
      if (strong) strong.textContent = summaryValues[index] || "—";
    });
  }

  function setupYearlyGraphControls() {
    document.querySelectorAll(".yearly-metric-btn").forEach((button) => {
      if (button.dataset.realOverviewBound === "true") return;
      button.dataset.realOverviewBound = "true";

      button.addEventListener("click", () => {
        state.yearlyMetric = button.dataset.yearlyMetric || "total";
        document.querySelectorAll(".yearly-metric-btn").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderYearlyGraph();
      });
    });

    const select = document.getElementById("yearlyGraphYear");
    if (select && select.dataset.realOverviewBound !== "true") {
      select.dataset.realOverviewBound = "true";
      select.addEventListener("change", renderYearlyGraph);
    }
  }

  function renderOverviewDashboard() {
    updateStatCards();
    renderMonthlyChart();
    setupCalendarButtons();
    renderCalendar();
    renderNoticeBoard();
    renderActiveOrdersModal();
    renderDeliveryStatusModals();
    renderTotalOrders();
    renderRecentActivity();
    setupYearlyGraphControls();
    renderYearlyGraph();
  }

  async function loadOverviewDashboard(options = {}) {
    if (state.isLoading) return;

    const isSilent = options.silent === true;
    const forceRender = options.forceRender === true;

    state.isLoading = true;

    try {
      const [data, productionData, historyData] = await Promise.all([
        requestJSON(OVERVIEW_ORDERS_API),
        requestJSON(OVERVIEW_PRODUCTION_RECORDS_API).catch(() => ({ records: [] })),
        requestJSON(OVERVIEW_PRODUCTION_HISTORY_API).catch(() => ({ history: [] }))
      ]);

      const nextOrders = sortOrdersRecentFirst(overviewFilterByAssignmentScope(Array.isArray(data.orders) ? data.orders : []));
      const nextProductionRecords = overviewFilterByAssignmentScope(Array.isArray(productionData.records) ? productionData.records : []);
      const nextProductionHistory = Array.isArray(historyData.history) ? historyData.history : [];

      await loadRecentActivity({ silent: isSilent });

      const nextSignature = createOverviewDashboardSignature(nextOrders, nextProductionRecords, nextProductionHistory, state.activities);

      if (isSilent && !forceRender && nextSignature === state.dataSignature) {
        return;
      }

      state.orders = nextOrders;
      state.productionRecords = nextProductionRecords;
      state.productionHistory = nextProductionHistory;
      state.dataSignature = nextSignature;

      if (isSilent) {
        preserveOverviewScroll(renderOverviewDashboard);
      } else {
        renderOverviewDashboard();
      }
    } catch (error) {
      console.warn("Unable to load overview real data:", error.message);
    } finally {
      state.isLoading = false;
    }
  }

  function scheduleOverviewDashboardRefresh(options = {}) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => loadOverviewDashboard(options), REFRESH_DELAY);
  }


  function renderOverviewFromProductionStatusList() {
    renderOverviewDashboard();
  }

  document.addEventListener("system:production-status-list-records-updated", () => {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(renderOverviewFromProductionStatusList, 60);
  });
  document.addEventListener("system:notifications-refresh", (event) => scheduleOverviewDashboardRefresh({ silent: event.detail?.source === "live-poll" }));
  document.addEventListener("system:orders-list-rendered", () => scheduleOverviewDashboardRefresh({ silent: true }));
  document.addEventListener("system:production-records-updated", () => scheduleOverviewDashboardRefresh({ silent: true }));
  document.addEventListener("system:unified-production-records-updated", () => scheduleOverviewDashboardRefresh({ silent: true }));
  document.addEventListener("system:production-status-list-records-updated", () => scheduleOverviewDashboardRefresh({ silent: true }));
  document.addEventListener("system:production-status-overview-records-updated", () => scheduleOverviewDashboardRefresh({ silent: true }));
  document.addEventListener("system:overview-refresh", (event) => scheduleOverviewDashboardRefresh({ silent: event.detail?.source === "live-poll" }));

  window.addEventListener("resize", () => {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(renderYearlyGraph, 120);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeNoticeDetailsModal();
    closeOverviewActiveOrderDetailsModal();
  });

  document.querySelector('[data-overview-modal="activeOrdersModal"]')?.addEventListener("click", () => {
    setTimeout(loadOverviewDashboard, 0);
  });

  loadOverviewDashboard();
})();
