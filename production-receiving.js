/* ===== PRODUCTION RECEIVING V14: details reset top + remove complete production option + finishing combine ===== */
/* ===== HISTORY UPDATE V21: keep one Finishing Completed only; remove duplicate redundant entries ===== */
/* ===== DELIVERY UPDATE V9: delivery layout runtime guard + date range; paste this whole content to production-receiving.js ===== */
/* ===== DELIVERY UPDATE V4: delivery right controls + date range; paste this whole content to production-receiving.js ===== */
/* ===== PRODUCTION STAGES MODULE ONLY ===== */
/* Real data from Orders API. Pending orders from the database appear in Prod.Status and Printing pending. */

(() => {
  const productionStageView = document.querySelector('.production-receiving-view');
  if (!productionStageView) return;

  const productionStages = [
    { id: 'printing', label: 'Printing', short: 'P', next: 'rewinding' },
    { id: 'rewinding', label: 'Rewinding', short: 'R', next: 'lamination' },
    { id: 'lamination', label: 'Lamination', short: 'L', next: 'slitting' },
    { id: 'slitting', label: 'Slitting', short: 'S', next: 'finishing' },
    { id: 'finishing', label: 'Finishing', short: 'F', next: 'completed' }
  ];

  const productionStageMap = productionStages.reduce((map, stage) => {
    map[stage.id] = stage;
    return map;
  }, {});

  const PRODUCTION_ORDERS_API_BASE = "/api/orders";
  const PRODUCTION_API_BASE = "/api/production";
  const defaultProductionStage = "printing";
  const UNIFIED_PRODUCTION_SOURCE_EVENT = "system:unified-production-records-updated";

  function dispatchProductionOverviewRefresh() {
    document.dispatchEvent(new CustomEvent('system:production-records-updated'));
    document.dispatchEvent(new CustomEvent('system:overview-refresh'));
  }

  let productionReceivingRecords = [];
  let isProductionReceivingLoading = false;
  let productionReceivingLoadError = "";
  let productionReceivingRefreshTimer = null;
  let productionActionHistoryMap = {};
  let latestProductionRecordsSignature = "";

  function createProductionRecordsSignature(records = []) {
    if (!Array.isArray(records)) return "[]";

    return JSON.stringify(records.map((record) => ({
      id: record?.id ?? "",
      orderId: record?.orderId ?? "",
      sourceType: record?.sourceType ?? "",
      stage: record?.stage ?? "",
      status: record?.status ?? record?.stageStatus ?? "",
      assignToRole: record?.assignToRole ?? record?.assign_to_role ?? "",
      orderAssignedTo: record?.orderAssignedTo ?? record?.assignTo ?? "",
      updatedAt: record?.updatedAt ?? "",
      dateEntered: record?.dateEntered ?? "",
      holdReason: record?.holdReason ?? "",
      completedStages: Array.isArray(record?.completedStages) ? record.completedStages.join(",") : "",
      historyCount: Array.isArray(record?.actionHistory) ? record.actionHistory.length : 0
    })));
  }

  function preserveProductionListScroll(callback) {
    if (!listContainer || typeof callback !== "function") return callback?.();

    const top = listContainer.scrollTop;
    const left = listContainer.scrollLeft;
    const result = callback();

    listContainer.scrollTop = top;
    listContainer.scrollLeft = left;

    return result;
  }

  const statusDetails = {
    pending: {
      title: 'Pending',
      label: 'Pending',
      pillClass: 'pr-status-pending',
      emptyTitle: 'No pending items',
      emptyText: 'Items waiting for this stage will appear here.'
    },
    ongoing: {
      title: 'Ongoing',
      label: 'Ongoing',
      pillClass: 'pr-status-ongoing',
      emptyTitle: 'No ongoing production',
      emptyText: 'Started items will appear here.'
    },
    hold: {
      title: 'Hold',
      label: 'Hold',
      pillClass: 'pr-status-hold',
      emptyTitle: 'No items on hold',
      emptyText: 'Paused items will appear here.'
    }
  };

  const finishingFolderDetails = {
    'for-weighing': {
      title: 'For Weighing',
      label: 'For Weighing',
      pillClass: 'pr-status-pending',
      emptyTitle: 'No items for weighing',
      emptyText: 'After Slitting, finishing items with original kgs/mts unit will appear here.'
    },
    'for-bagging': {
      title: 'For Bagging',
      label: 'For Bagging',
      pillClass: 'pr-status-pending',
      emptyTitle: 'No items for bagging',
      emptyText: 'After Slitting, finishing items with original pcs unit will appear here.'
    }
  };

  const defaultFinishingFolderStatus = 'for-weighing';
  const regularProductionTabConfig = [
    { status: 'pending', label: 'Pending' },
    { status: 'ongoing', label: 'On-going' },
    { status: 'hold', label: 'Hold' }
  ];
  const finishingProductionTabConfig = [
    { status: 'for-weighing', label: 'For Weighing' },
    { status: 'for-bagging', label: 'For Bagging' }
  ];

  let activeProductionStage = 'all';
  let activeProductionReceivingStatus = 'pending';
  let productionReceivingSearchText = '';
  let productionReceivingDateFrom = '';
  let productionReceivingDateTo = '';
  let activeProductionReceivingModalRecordId = null;

  const productionStatusNavLink = document.querySelector('[data-production-status-link]');
  const productionNavGroup = document.querySelector('[data-production-nav-group]');
  const productionNavParent = document.querySelector('[data-production-nav-toggle]');
  const productionStatusSidebarNotificationBadge = ensureProductionSidebarNotificationBadge(productionStatusNavLink);
  const productionSidebarNotificationBadge = ensureProductionSidebarNotificationBadge(productionNavParent);
  const productionSubNav = document.querySelector('#productionSubNav');
  const productionStageLinks = document.querySelectorAll('[data-production-stage-link]');
  const productionStageCountBadges = document.querySelectorAll('[data-production-stage-count]');
  const topbarTitle = document.querySelector('.topbar h1');
  const tabButtons = productionStageView.querySelectorAll('[data-pr-tab]');
  const listContainer = productionStageView.querySelector('#productionReceivingList');
  const searchInput = productionStageView.querySelector('#productionReceivingSearch');
  const dateRangeButton = productionStageView.querySelector('#productionReceivingDateRangeBtn');
  const dateModalBackdrop = productionStageView.querySelector('#productionReceivingDateModal');
  const dateFromInput = productionStageView.querySelector('#productionReceivingDateFrom');
  const dateToInput = productionStageView.querySelector('#productionReceivingDateTo');
  const dateApplyButton = productionStageView.querySelector('#productionReceivingDateApply');
  const dateClearButton = productionStageView.querySelector('#productionReceivingDateClear');
  const clearButton = productionStageView.querySelector('#productionReceivingClear');
  const modalBackdrop = document.querySelector('#productionReceivingModal');
  const modalBody = document.querySelector('#productionReceivingModalBody');
  const modalTitle = document.querySelector('#productionReceivingModalTitle');
  const modalSubTitle = document.querySelector('#productionReceivingModalSubTitle');
  const modalPrimaryAction = document.querySelector('#productionReceivingModalPrimaryAction');

  function ensureProductionSidebarNotificationBadge(parent = productionNavParent) {
    if (!parent) return null;

    let badge = parent.querySelector('[data-production-status-notification]');
    if (badge) return badge;

    badge = document.createElement('span');
    badge.className = 'production-status-sidebar-badge';
    badge.setAttribute('data-production-status-notification', 'true');
    badge.hidden = true;
    parent.appendChild(badge);

    return badge;
  }

  function setProductionNotificationBadge(badge, count) {
    if (!badge) return;

    const safeCount = Number(count || 0);
    badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
    badge.hidden = safeCount <= 0;
  }

  function isFinishingFolderStatus(status) {
    return Object.prototype.hasOwnProperty.call(finishingFolderDetails, status);
  }

  function getProductionFolderDetails(status) {
    return finishingFolderDetails[status] || statusDetails[status] || null;
  }

  function getProductionTabLabel(status) {
    return getProductionFolderDetails(status)?.label || status;
  }

  function isFinishingStageView() {
    return activeProductionStage === 'finishing' && !isProductionStatusView();
  }

  function getDefaultProductionTabStatus(stageId = activeProductionStage) {
    return stageId === 'finishing' ? defaultFinishingFolderStatus : 'pending';
  }

  function normalizeProductionOriginalUnitValue(value = "") {
    const unit = String(value || "").trim().toLowerCase();
    if (!unit) return "";

    if (["pc", "pcs", "piece", "pieces"].includes(unit)) return "pcs";
    if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(unit)) return "kgs";
    if (["m", "mt", "mts", "meter", "meters", "metre", "metres"].includes(unit)) return "mts";

    return unit;
  }

  function getProductionOriginalUnit(record = {}) {
    const directUnit = normalizeProductionOriginalUnitValue(
      record?.originalUnit ||
      record?.original_unit ||
      record?.orderUnit ||
      record?.order_unit ||
      record?.unit ||
      record?.baseUnit ||
      record?.base_unit ||
      ""
    );

    if (directUnit) return directUnit;

    /*
      Safety fallback for older partial/container records.
      Some saved batch items only kept the display quantity like "100 pcs"
      and did not preserve a separate unit field, so Finishing could default
      them to For Weighing. Parse the original quantity text before routing.
    */
    const searchableText = [
      record?.quantity,
      record?.quantityText,
      record?.originalQuantity,
      record?.orderQuantity,
      record?.sourceBatchDetailsText
    ].filter(Boolean).join(" ").toLowerCase();

    if (/pcs?|pieces?/.test(searchableText)) return "pcs";
    if (/kgs?|kilograms?|kilos?/.test(searchableText)) return "kgs";
    if (/mts?|meters?|metres?/.test(searchableText)) return "mts";

    if (Array.isArray(record?.sourceBatchDetails)) {
      for (const source of record.sourceBatchDetails) {
        const sourceUnit = getProductionOriginalUnit(source);
        if (sourceUnit) return sourceUnit;
      }
    }

    return "";
  }

  function getFinishingFolderStatus(record = {}) {
    const originalUnit = getProductionOriginalUnit(record);

    if (originalUnit === 'pcs') return 'for-bagging';
    if (originalUnit === 'kgs' || originalUnit === 'mts') return 'for-weighing';

    /* Safety fallback: keep unexpected/old units visible in Finishing instead of hiding them. */
    return 'for-weighing';
  }

  function isFinishingReadyForDeliveryRecord(record = {}) {
    return record?.stage === 'finishing'
      && record?.status === 'pending'
      && ["production-stage", "production-partial"].includes(record?.sourceType);
  }

  function getFinishingDeliveryProcessType(record = {}) {
    return getFinishingFolderStatus(record) === 'for-bagging' ? 'bagging' : 'weighing';
  }

  function getFinishingDeliveryProcessLabel(record = {}) {
    return getFinishingDeliveryProcessType(record) === 'bagging' ? 'For Bagging' : 'For Weighing';
  }

  function formatProductionCompactNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "—";
    return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function configureProductionTabButton(tabButton, config = {}, index = 0) {
    if (!tabButton) return;

    const shouldHide = Boolean(config.hidden);
    tabButton.hidden = shouldHide;
    tabButton.setAttribute('aria-hidden', String(shouldHide));

    if (config.status) {
      tabButton.dataset.prTab = config.status;
    }

    let label = tabButton.querySelector('.pr-tab-label');
    let counter = tabButton.querySelector('.pr-tab-count');
    let badge = tabButton.querySelector('.pr-tab-badge');

    if (!label || !counter || !badge) {
      tabButton.innerHTML = `
        <span class="pr-tab-label">${escapeProductionHTML(config.label || getProductionTabLabel(config.status))}</span>
        <span class="pr-tab-count" aria-label="Item count">0</span>
        <span class="pr-tab-badge" hidden aria-label="Unread updates">0</span>
      `;
      label = tabButton.querySelector('.pr-tab-label');
      counter = tabButton.querySelector('.pr-tab-count');
      badge = tabButton.querySelector('.pr-tab-badge');
    }

    if (label) label.textContent = config.label || getProductionTabLabel(config.status);
    if (counter && shouldHide) counter.textContent = '0';
    if (badge && shouldHide) badge.hidden = true;
    tabButton.classList.toggle('pr-folder-tab-unused', shouldHide);
    tabButton.style.order = String(index);
  }

  function configureProductionTabsForActiveStage() {
    const config = isFinishingStageView()
      ? finishingProductionTabConfig
      : regularProductionTabConfig;

    tabButtons.forEach((tabButton, index) => {
      const tabConfig = config[index];
      configureProductionTabButton(tabButton, tabConfig ? { ...tabConfig, hidden: false } : { hidden: true }, index);
    });

    productionStageView.classList.toggle('is-finishing-stage-view', isFinishingStageView());
  }

  function ensureProductionTabStructure() {
    configureProductionTabsForActiveStage();

    tabButtons.forEach((tabButton) => {
      const status = tabButton.dataset.prTab;
      const labelText = getProductionTabLabel(status);
      let label = tabButton.querySelector('.pr-tab-label');
      let counter = tabButton.querySelector('.pr-tab-count');
      let badge = tabButton.querySelector('.pr-tab-badge');

      if (!label || !counter || !badge) {
        tabButton.innerHTML = `
          <span class="pr-tab-label">${escapeProductionHTML(labelText)}</span>
          <span class="pr-tab-count" aria-label="Item count">0</span>
          <span class="pr-tab-badge" hidden aria-label="Unread updates">0</span>
        `;
      } else {
        const content = tabButton.querySelector('.pr-tab-content');
        if (content && label) {
          content.replaceWith(label);
        }
      }

      label = tabButton.querySelector('.pr-tab-label');
      counter = tabButton.querySelector('.pr-tab-count');
      badge = tabButton.querySelector('.pr-tab-badge');

      if (label) label.textContent = labelText;
      if (counter && tabButton.hidden) counter.textContent = '0';
      if (badge && tabButton.hidden) badge.hidden = true;
    });
  }

  function setProductionTabCounter(tabButton, count) {
    if (!tabButton) return;

    const counter = tabButton.querySelector('.pr-tab-count');
    const safeCount = Number(count || 0);

    if (!counter) return;

    counter.textContent = safeCount > 99 ? '99+' : String(safeCount);
    counter.dataset.itemCount = String(safeCount);
    tabButton.dataset.itemCount = String(safeCount);
  }

  function setProductionTabNotification(tabButton, count) {
    if (!tabButton) return;

    const badge = tabButton.querySelector('.pr-tab-badge');
    const safeCount = Number(count || 0);

    tabButton.classList.toggle('has-notification', safeCount > 0);
    if (!badge) return;

    badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
    badge.hidden = safeCount <= 0;
  }


  function getProductionNotificationUserId() {
    const possibleKeys = [
      "currentUser",
      "loggedInUser",
      "activeUser",
      "username",
      "user"
    ];

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

  function getProductionStoredUser() {
    const possibleKeys = ["currentUser", "loggedInUser", "activeUser", "user"];

    for (const key of possibleKeys) {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) continue;

      try {
        const parsedValue = JSON.parse(rawValue);
        if (parsedValue && typeof parsedValue === "object" && parsedValue.username) return parsedValue;
      } catch (error) {
        // Plain username values are handled by getProductionNotificationUserId().
      }
    }

    const username = localStorage.getItem("username");
    return username ? { username } : null;
  }

  function normalizeProductionUserRole(role) {
    return String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function getProductionCurrentUserRole() {
    const user = getProductionStoredUser();
    const role = normalizeProductionUserRole(user?.role);

    if (role) return role;

    const username = normalizeProductionUserRole(user?.username || getProductionNotificationUserId());
    if (username === "lockkey" || username === "lockkey_production") return "lockkey_production";
    if (username === "happy" || username === "happy_production") return "happy_production";
    if (username === "production" || username === "production_staff") return "production_staff";

    return role;
  }

  function productionCurrentUserCanSeeAllAssignments() {
    return ["admin", "manager", "supervisor", "logistics", "production_staff"].includes(getProductionCurrentUserRole());
  }

  function productionCurrentUserCanUpdateProduction() {
    return ["admin", "supervisor", "lockkey_production", "happy_production"].includes(getProductionCurrentUserRole());
  }

  function getProductionScopedAssignmentRole() {
    const role = getProductionCurrentUserRole();
    return ["lockkey_production", "happy_production"].includes(role) ? role : "";
  }

  function getProductionRecordAssignmentRole(record = {}) {
    return normalizeProductionUserRole(
      record.assignToRole
        || record.assign_to_role
        || record.assignedUserRole
        || record.assigned_user_role
        || record.orderAssignToRole
        || record.order_assign_to_role
        || ""
    );
  }

  function canProductionCurrentUserSeeRecord(record = {}) {
    if (productionCurrentUserCanSeeAllAssignments()) return true;

    const scopedRole = getProductionScopedAssignmentRole();
    if (!scopedRole) return true;

    return getProductionRecordAssignmentRole(record) === scopedRole;
  }

  function filterProductionRecordsByAssignmentScope(records = []) {
    if (!Array.isArray(records)) return [];
    if (productionCurrentUserCanSeeAllAssignments()) return records;

    const scopedRole = getProductionScopedAssignmentRole();
    if (!scopedRole) return records;

    return records.filter(canProductionCurrentUserSeeRecord);
  }

  function getProductionStatusReadStorageKey() {
    return `production-status-read-records:${getProductionNotificationUserId()}`;
  }

  function getProductionStatusReadRecordIds() {
    try {
      const storedValue = localStorage.getItem(getProductionStatusReadStorageKey());
      const parsedValue = JSON.parse(storedValue || "[]");

      if (Array.isArray(parsedValue)) {
        return new Set(parsedValue.map((recordId) => String(recordId)));
      }
    } catch (error) {
      return new Set();
    }

    return new Set();
  }

  function saveProductionStatusReadRecordIds(readRecordIds) {
    localStorage.setItem(
      getProductionStatusReadStorageKey(),
      JSON.stringify(Array.from(readRecordIds))
    );
  }


  function getProductionStageStorageKey() {
    return `production-stage-records:${getProductionNotificationUserId()}`;
  }

  function getStoredProductionStageRecords() {
    try {
      const storedValue = localStorage.getItem(getProductionStageStorageKey());
      const parsedValue = JSON.parse(storedValue || "{}");

      if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (error) {
      return {};
    }

    return {};
  }

  function saveStoredProductionStageRecords(stageRecords) {
    localStorage.setItem(getProductionStageStorageKey(), JSON.stringify(stageRecords || {}));
  }

  function getProductionPartialStorageKey() {
    return `production-partial-stage-records:${getProductionNotificationUserId()}`;
  }

  function getStoredProductionPartialRecords() {
    try {
      const storedValue = localStorage.getItem(getProductionPartialStorageKey());
      const parsedValue = JSON.parse(storedValue || "{}");

      if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (error) {
      return {};
    }

    return {};
  }

  function saveStoredProductionPartialRecords(partialRecords) {
    localStorage.setItem(getProductionPartialStorageKey(), JSON.stringify(partialRecords || {}));
  }

  function getProductionContainerSourceStorageKey() {
    return `production-container-source-locks:${getProductionNotificationUserId()}`;
  }

  function getStoredProductionContainerSourceLocks() {
    try {
      const storedValue = localStorage.getItem(getProductionContainerSourceStorageKey());
      const parsedValue = JSON.parse(storedValue || "{}");

      if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (error) {
      return {};
    }

    return {};
  }

  function saveStoredProductionContainerSourceLocks(sourceLocks) {
    localStorage.setItem(getProductionContainerSourceStorageKey(), JSON.stringify(sourceLocks || {}));
  }

  function getProductionSourceRecordKey(record) {
    return String(record?.partialRecordId || record?.id || record?.productionRecordId || record?.orderId || "").trim();
  }

  function isProductionPartialRecord(record) {
    return record?.sourceType === "production-partial" || Boolean(record?.partialRecordId);
  }

  function hasProductionSourceBatchDetails(record) {
    return Array.isArray(record?.sourceBatchDetails) && record.sourceBatchDetails.length > 0;
  }

  function getProductionSourceBatchDetailCount(record) {
    if (Array.isArray(record?.sourceBatchDetails)) {
      const sourceDetails = record.sourceBatchDetails.filter((source) => {
        if (!source || typeof source !== "object") return false;
        return Boolean(
          String(source.label || "").trim()
          || String(source.metersDisplay || "").trim()
          || Number(source.meters || 0) > 0
        );
      });

      if (sourceDetails.length > 0) return sourceDetails.length;
    }

    const sourceSummary = String(record?.sourceBatchSummary || "").trim();
    if (sourceSummary.includes("+")) {
      return sourceSummary
        .split("+")
        .map((item) => item.trim())
        .filter(Boolean)
        .length;
    }

    return 0;
  }

  function shouldShowProductionPendingSourceBatches(record) {
    // Pending should look clean when it only received one partial from the previous stage.
    // Show Source Batches only for the grouped/container record that is created when
    // 2 or more partial source records meet in the same pending stage.
    // This prevents inherited/nested source traces from showing as a Source Batches card
    // on a single pending item in later stages.
    if (!record || record.status !== "pending") return false;
    if (!isProductionContainerRecord(record)) return false;

    const sourceRecordCount = Array.isArray(record.sourceRecordIds)
      ? record.sourceRecordIds.filter(Boolean).length
      : 0;

    return sourceRecordCount > 1 || getProductionSourceBatchDetailCount(record) > 1;
  }

  function isProductionContainerRecord(record) {
    return record?.partialKind === "container";
  }

  function isProductionContainerSourceLocked(record) {
    if (!record || isProductionContainerRecord(record)) return false;
    const sourceKey = getProductionSourceRecordKey(record);
    if (!sourceKey) return false;
    const sourceLocks = getStoredProductionContainerSourceLocks();
    return Boolean(sourceLocks[sourceKey]);
  }

  function getProductionPartialRecordId(record) {
    return String(record?.partialRecordId || record?.id || "").trim();
  }

  function getProductionBatchNumber(record) {
    const batchValue = Number(record?.batchNumber || record?.partialBatchNumber || record?.productionBatchNumber || 0);
    return Number.isFinite(batchValue) && batchValue > 0 ? Math.floor(batchValue) : 0;
  }

  function getProductionBatchLabel(record) {
    const batchNumber = getProductionBatchNumber(record);
    return batchNumber > 0 ? `Batch ${batchNumber}` : "";
  }

  function getProductionDisplayBatchLabel(record) {
    if (isProductionContainerRecord(record)) return "";

    const status = String(record?.status || "").toLowerCase();

    // Clean pending lists: batch labels are shown only when the item is actually being processed.
    // Pending cards stay as normal stage items; source/batch trace remains in the details/history.
    if (["ongoing", "hold"].includes(status)) {
      return getProductionBatchLabel(record);
    }

    return "";
  }

  function parseProductionMetersValue(value) {
    const text = String(value || "").trim();
    if (!text) return 0;

    const numberMatch = text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
    if (!numberMatch) return 0;

    const parsedValue = Number(numberMatch[1].replaceAll(",", ""));
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  }

  function getProductionOriginalMetersFromHistory(record) {
    const actionHistory = Array.isArray(record?.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);

    for (let index = actionHistory.length - 1; index >= 0; index -= 1) {
      const item = actionHistory[index] || {};
      const description = String(item.description || "");
      const originalMatch = description.match(/Original meters:\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
      if (originalMatch) return parseProductionMetersValue(originalMatch[1]);

      const outOfMatch = description.match(/out of\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
      if (outOfMatch) return parseProductionMetersValue(outOfMatch[1]);
    }

    return 0;
  }

  function getProductionOriginalStageMeters(record) {
    const directMeters = Number(
      record?.originalStageMeters
      || record?.originalMetersBeforePartial
      || record?.parentOriginalMeters
      || 0
    );

    if (Number.isFinite(directMeters) && directMeters > 0) return directMeters;

    const displayMeters = parseProductionMetersValue(
      record?.originalStageMetersDisplay
      || record?.originalMetersDisplay
      || record?.parentOriginalMetersDisplay
    );

    if (displayMeters > 0) return displayMeters;

    return getProductionOriginalMetersFromHistory(record);
  }

  function getProductionOriginalStageMetersDisplay(record) {
    const meters = getProductionOriginalStageMeters(record);
    return meters > 0 ? formatProductionMeters(meters) : "—";
  }

  function shouldShowProductionOriginalMeters(record) {
    return getProductionOriginalStageMeters(record) > 0;
  }

  function applyProductionBatchMetadata(record, batchNumber, originalStageMeters) {
    if (!record) return;

    const safeBatchNumber = Number(batchNumber || 0);
    if (Number.isFinite(safeBatchNumber) && safeBatchNumber > 0) {
      const normalizedBatchNumber = Math.floor(safeBatchNumber);
      record.batchNumber = normalizedBatchNumber;
      record.partialBatchNumber = normalizedBatchNumber;
    }

    const safeOriginalMeters = Number(originalStageMeters || 0);
    if (Number.isFinite(safeOriginalMeters) && safeOriginalMeters > 0) {
      record.originalStageMeters = safeOriginalMeters;
      record.originalStageMetersDisplay = formatProductionMeters(safeOriginalMeters);
    }
  }

  function createProductionPartialRecordId(record) {
    const baseId = String(record?.partialRecordId || record?.productionRecordId || record?.orderId || record?.id || "item").replace(/[^a-zA-Z0-9_-]/g, "");
    return `partial-${baseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createProductionStableHash(value) {
    const text = String(value || "");
    let hash = 0;

    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash).toString(36);
  }

  function getProductionContainerGroupKey(record) {
    return [record?.poNumber, record?.joNumber, record?.item, record?.client]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");
  }

  function getProductionContainerSourceStageId(targetStageId) {
    const targetIndex = productionStages.findIndex((stage) => stage.id === targetStageId);
    if (targetIndex <= 0) return "";
    return productionStages[targetIndex - 1]?.id || "";
  }

  function getProductionContainerSourceStageLabel(targetStageId) {
    const sourceStageId = getProductionContainerSourceStageId(targetStageId);
    return sourceStageId ? getStageLabel(sourceStageId) : "Previous Stage";
  }

  function getProductionSourceBatchOriginLabel(record) {
    const sourceStageLabel = String(record?.partialSourceLabel || "").trim();
    if (sourceStageLabel) return sourceStageLabel;

    const sourceStageId = String(record?.partialSourceStage || "").trim();
    if (sourceStageId) return getStageLabel(sourceStageId);

    const currentStageId = String(record?.stage || "").trim();
    return getProductionContainerSourceStageLabel(currentStageId);
  }

  function isProductionContainerEligibleStage(stageId) {
    return stageId === "rewinding" || stageId === "lamination" || stageId === "slitting" || stageId === "finishing";
  }

  function isProductionContainerSourceCandidate(record, targetStageId) {
    if (!record || record.stage !== targetStageId || record.status !== "pending") return false;
    if (!isProductionContainerEligibleStage(targetStageId)) return false;
    if (record.sourceType === "orders-pending") return false;
    if (isProductionContainerRecord(record)) return false;
    if (record.hiddenByContainerId || isProductionContainerSourceLocked(record)) return false;

    const sourceStageId = getProductionContainerSourceStageId(targetStageId);
    if (!sourceStageId) return false;

    const sourceStageLabel = getStageLabel(sourceStageId);
    const remarksText = String(record.remarks || "").toLowerCase();
    const sourceStageText = sourceStageLabel.toLowerCase();
    const hasExpectedSource = record.partialSourceStage === sourceStageId
      || getStageCompletionHistory(record, sourceStageLabel)
      || remarksText.includes(`${sourceStageText} completed`)
      || remarksText.includes(`moved to ${getStageLabel(targetStageId).toLowerCase()}`);

    return Boolean(hasExpectedSource);
  }

  function getProductionSourceBatchLabel(record, fallbackIndex = 0) {
    const batchLabel = getProductionBatchLabel(record);
    if (batchLabel) return batchLabel;

    const sourceTitle = String(record?.partialSourceLabel || "").trim();
    if (/batch\s*\d+/i.test(sourceTitle)) return sourceTitle;

    if (hasProductionSourceBatchDetails(record)) {
      const originLabel = getProductionSourceBatchOriginLabel(record);
      return fallbackIndex > 0 ? `${originLabel} Run ${fallbackIndex}` : `${originLabel} Run`;
    }

    return fallbackIndex > 0 ? `Batch ${fallbackIndex}` : "Batch";
  }

  function getProductionSourceBatchMeters(record) {
    const stageInput = getStageInputDetails(record);
    const meters = Number(stageInput?.meters || record?.convertedMeters || record?.lastProducedMeters || 0);
    return Number.isFinite(meters) && meters > 0 ? meters : 0;
  }

  function getProductionSourceBatchSummary(record) {
    if (!hasProductionSourceBatchDetails(record)) return "";

    return record.sourceBatchDetails
      .map((source) => source.label)
      .filter(Boolean)
      .join(" + ");
  }

  function getProductionSourceBatchStageLabel(source, record) {
    // Prefer the immediate source stage of the current pending/ongoing item.
    // Example: when a Rewinding output moves to Lamination, Source Batches should show
    // "Rewinding - Batch 1", not the older Printing batch trace nested inside it.
    const sourceStageId = String(
      source?.sourceStageId
      || source?.stage
      || record?.partialSourceStage
      || getProductionContainerSourceStageId(record?.stage)
      || ""
    ).trim();

    if (sourceStageId) return getStageLabel(sourceStageId);

    const directStage = String(source?.sourceStage || "").trim();
    if (directStage) return directStage;

    return getProductionSourceBatchOriginLabel(record);
  }

  function normalizeProductionSourceBatchLabelForStage(label) {
    let normalizedLabel = String(label || "Batch").trim() || "Batch";
    const stageNamesPattern = productionStages
      .map((stage) => stage.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    if (stageNamesPattern) {
      normalizedLabel = normalizedLabel
        .replace(new RegExp(`^(?:${stageNamesPattern})\\s*(?:-|:)?\\s*`, "i"), "")
        .trim();
    }

    const runMatch = normalizedLabel.match(/^Run\s*(\d+)?$/i);
    if (runMatch) {
      const runNumber = String(runMatch[1] || "").trim();
      return runNumber ? `Batch ${runNumber}` : "Batch";
    }

    return normalizedLabel || "Batch";
  }

  function formatProductionSourceBatchDetail(source, record) {
    const rawBatchLabel = String(source?.label || "Batch").trim() || "Batch";
    const batchLabel = normalizeProductionSourceBatchLabelForStage(rawBatchLabel);
    const metersDisplay = String(source?.metersDisplay || "").trim();
    const stageLabel = getProductionSourceBatchStageLabel(source, record);
    const shouldPrefixStage = stageLabel && !batchLabel.toLowerCase().startsWith(stageLabel.toLowerCase());
    const labelWithStage = shouldPrefixStage ? `${stageLabel} - ${batchLabel}` : batchLabel;

    return `${labelWithStage}${metersDisplay ? ` (${metersDisplay})` : ""}`;
  }

  function formatProductionCombinedBatchLineDetail(source) {
    const rawBatchLabel = String(source?.label || "Batch").trim() || "Batch";
    const batchLabel = normalizeProductionSourceBatchLabelForStage(rawBatchLabel);
    const metersDisplay = String(source?.metersDisplay || "").trim();

    return `${batchLabel}${metersDisplay ? ` (${metersDisplay})` : ""}`;
  }

  function getProductionSourceBatchDetailsText(record) {
    if (!hasProductionSourceBatchDetails(record)) return "";

    return record.sourceBatchDetails
      .map((source) => formatProductionSourceBatchDetail(source, record))
      .join(", ");
  }

  function getProductionGroupedSourceLabel(record) {
    const sourceStageId = String(record?.partialSourceStage || "").trim();
    if (sourceStageId) return getStageLabel(sourceStageId);

    const stageId = String(record?.stage || "").trim();
    return getProductionContainerSourceStageLabel(stageId);
  }

  function getProductionHistoryItemDedupeKey(item = {}) {
    const displayTitle = getProductionHistoryDisplayTitle(item);
    const title = String(displayTitle || item.title || "").trim().toLowerCase();
    const description = String(item.description || "").trim().toLowerCase();
    const stage = inferProductionStageIdFromHistory(item, item.stage || "");

    /* Keep one Finishing Completed entry only. It is useful history, but duplicate
       auto/local/server entries are redundant. Ignore description/meta differences. */
    if (title === "finishing completed" && (stage === "finishing" || description.includes("finishing"))) {
      return "finishing-completed";
    }

    return [
      displayTitle || item.title || "",
      cleanProductionHistoryDescription(item.description || "", item),
      item.meta || "",
      item.stage || "",
      item.status || "",
      item.eventType || "",
      item.batchLabel || ""
    ].map((part) => String(part || "").trim().toLowerCase()).join("|");
  }

  function hasProductionSecondPrecision(value) {
    const text = String(value || "").trim();
    return /\b\d{1,2}:\d{2}:\d{2}\b/.test(text);
  }

  function getProductionHistorySequence(item = {}) {
    const numericId = Number(item?.id || 0);
    if (Number.isFinite(numericId) && numericId > 0) return numericId;

    const sortIndex = Number(item?._sortIndex);
    return Number.isFinite(sortIndex) ? sortIndex : 0;
  }

  function isProductionSavedActionHistory(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = String(item.title || "").trim().toLowerCase();

    if (eventType === "current-status") return false;
    if (title.includes("pending") || title === "waiting for take order") return false;

    return Boolean(item?.id || eventType || title);
  }

  function shouldHideAutoDeliveryFinishingCompletedHistory(item = {}) {
    /* V21: do not hide Finishing Completed anymore. It should appear once.
       Duplicate removal is handled by getProductionHistoryItemDedupeKey(). */
    return false;
  }

  function sortProductionHistoryItems(items = []) {
    return [...items].sort((a, b) => {
      const rankA = getProductionHistoryOrderRank(a);
      const rankB = getProductionHistoryOrderRank(b);
      const timeA = parseProductionSortTimestamp(a?.meta);
      const timeB = parseProductionSortTimestamp(b?.meta);
      const sequenceA = getProductionHistorySequence(a);
      const sequenceB = getProductionHistorySequence(b);
      const batchA = getProductionHistoryBatchSortNumber(a);
      const batchB = getProductionHistoryBatchSortNumber(b);
      const batchOrderGroupA = getProductionHistoryBatchOrderGroup(a);
      const batchOrderGroupB = getProductionHistoryBatchOrderGroup(b);

      /*
       * Production History must stay in workflow order, not in whatever order
       * the API/local snapshot returns.  Date/time is only a tie-breaker inside
       * the same workflow step because several actions can share the same
       * minute, especially after Take Order / Ongoing / Hold updates.
       *
       * Expected timeline:
       * Issue Order -> Waiting/Take Order -> Stage Ongoing/Hold/Resume ->
       * Stage Completed -> Next Stage -> Production Completed.
       */
      if (rankA !== rankB) return rankA - rankB;
      if (batchA > 0 && batchB > 0 && batchOrderGroupA === batchOrderGroupB && batchA !== batchB) return batchA - batchB;
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;
      if (timeA && !timeB) return -1;
      if (!timeA && timeB) return 1;
      if (sequenceA !== sequenceB) return sequenceA - sequenceB;

      return 0;
    });
  }

  function mergeProductionHistoryItems(items = [], historyKey = "") {
    const seen = new Set();
    const mergedItems = [];

    items.forEach((rawItem, index) => {
      const normalizedItem = normalizeProductionHistoryItem({
        ...rawItem,
        historyKey: rawItem?.historyKey || historyKey || ""
      });

      if (!normalizedItem || shouldHideAutoDeliveryFinishingCompletedHistory(normalizedItem)) return;

      const dedupeKey = getProductionHistoryItemDedupeKey(normalizedItem);
      if (seen.has(dedupeKey)) return;

      seen.add(dedupeKey);
      mergedItems.push({ ...normalizedItem, _sortIndex: index });
    });

    return sortProductionHistoryItems(mergedItems).map(({ _sortIndex, ...item }) => item);
  }

  function isProductionCurrentStageStatusHistory(item = {}, targetStageId = "") {
    const stageId = String(targetStageId || "").trim();
    if (!stageId) return false;

    const stageLabel = getStageLabel(stageId);
    const title = String(item?.title || "").trim().toLowerCase();
    const description = String(item?.description || "").trim().toLowerCase();
    const stageText = stageLabel.toLowerCase();

    if (title === `${stageText} • pending`) return true;
    if (title === `${stageText} • on-going`) return true;
    if (title === `${stageText} • hold`) return true;
    if (description === `${stageText} is waiting to start.`) return true;
    if (description === `${stageText} is currently on-going.`) return true;
    if (description === `${stageText} is currently on hold.`) return true;

    return false;
  }


  function isProductionStageRunHistoryEvent(item = {}, targetStageId = "") {
    const stageId = String(targetStageId || "").trim();
    if (!stageId) return false;

    const stageLabel = getStageLabel(stageId);
    const stageText = stageLabel.toLowerCase();
    const eventType = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
    const title = String(item?.title || "").trim().toLowerCase();
    const description = String(item?.description || "").trim().toLowerCase();
    const historyStageId = inferProductionStageIdFromHistory(item, stageId);

    if (historyStageId && historyStageId !== stageId) return false;

    if ([
      "current-status",
      "stage-started",
      "stage-resumed",
      "stage-hold",
      "stage-completed"
    ].includes(eventType)) return true;

    if (stageId === defaultProductionStage && (eventType === "take-order" || title === "take order")) return true;
    if (title.startsWith("start ") || title.startsWith("resume ") || title.startsWith("hold ")) return true;
    if (title === `${stageText} • pending` || title === `${stageText} • on-going` || title === `${stageText} • hold`) return true;
    if (title === `${stageText} completed`) return true;
    if (description === `${stageText} is waiting to start.` || description === `${stageText} is in progress.` || description === `${stageText} is on hold.`) return true;

    return false;
  }

  function getProductionHistoryCarryForwardForBalance(record = {}, historyItems = []) {
    const stageId = String(record?.stage || "").trim();
    if (!stageId || !Array.isArray(historyItems)) return [];

    return historyItems.filter((historyItem) => {
      return !isProductionStageRunHistoryEvent(historyItem, stageId);
    });
  }

  function isProductionStageCompletedHistoryEvent(item = {}, targetStageId = "") {
    const stageId = String(targetStageId || "").trim();
    if (!stageId) return false;

    const stageLabel = getStageLabel(stageId);
    const stageText = stageLabel.toLowerCase();
    const eventType = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
    const title = String(item?.title || "").trim().toLowerCase();

    return eventType === "stage-completed"
      || title === `${stageText} completed`
      || title.includes(`${stageText} completed`);
  }

  function shouldHideProductionHistoryItemForRecord(record = {}, historyItem = {}) {
    if (!record || !historyItem || !isProductionPartialRecord(record)) return false;

    const stageId = String(record.stage || "").trim();
    if (!stageId) return false;

    const historyStageId = inferProductionStageIdFromHistory(historyItem, stageId);
    if (historyStageId && historyStageId !== stageId) return false;

    const isStageRunEvent = isProductionStageRunHistoryEvent(historyItem, stageId);
    if (!isStageRunEvent) return false;

    const recordStatus = String(record.status || "").trim().toLowerCase();

    /*
      Batch isolation rule:
      If the item is still in the same stage as pending / ongoing / hold,
      that stage is not completed for this specific batch yet. Do not show
      a completed event that belongs to another sibling batch from the same
      order/stage. The completed row should appear only on the batch that
      already moved out of this stage or became completed.
    */
    if (["pending", "ongoing", "hold"].includes(recordStatus)
      && isProductionStageCompletedHistoryEvent(historyItem, stageId)) {
      return true;
    }

    const recordBatchLabel = getProductionBatchLabel(record).toLowerCase();
    const historyBatchLabel = getProductionHistoryBatchLabel(historyItem).toLowerCase();

    if (record.partialKind === "balance") return true;
    if (recordBatchLabel && historyBatchLabel && recordBatchLabel !== historyBatchLabel) return true;

    return false;
  }

  function getProductionSourceHistoryForContainer(sourceRecords = [], targetStageId = "") {
    const carryForwardHistory = [];

    sortProductionSourceRecordsForMerge(sourceRecords).forEach((sourceRecord) => {
      const sourceHistory = getProductionHistoryItems(sourceRecord)
        .filter((historyItem) => !isProductionCurrentStageStatusHistory(historyItem, targetStageId));

      carryForwardHistory.push(...sourceHistory);
    });

    return mergeProductionHistoryItems(carryForwardHistory);
  }

  function getProductionContainerSourceRecords(record = {}) {
    if (!isProductionContainerRecord(record) || !Array.isArray(record.sourceRecordIds)) return [];

    const sourceIds = new Set(record.sourceRecordIds.map((sourceId) => String(sourceId || "").trim()).filter(Boolean));
    if (!sourceIds.size) return [];

    return productionReceivingRecords.filter((candidateRecord) => {
      if (!candidateRecord || candidateRecord === record || isProductionContainerRecord(candidateRecord)) return false;
      return sourceIds.has(getProductionSourceRecordKey(candidateRecord));
    });
  }

  function createProductionContainerRecord(records, targetStageId) {
    const sourceRecords = sortProductionSourceRecordsForMerge(records);
    if (sourceRecords.length < 2) return null;

    const sourceStageId = getProductionContainerSourceStageId(targetStageId);
    if (!sourceStageId) return null;

    const targetStageLabel = getStageLabel(targetStageId);
    const sourceStageLabel = getStageLabel(sourceStageId);
    const sourceKeys = sourceRecords
      .map(getProductionSourceRecordKey)
      .filter(Boolean)
      .sort();

    if (sourceKeys.length < 2) return null;

    const firstRecord = sourceRecords[0];
    const containerOriginalUnit = getProductionOriginalUnit(firstRecord);
    const groupKey = getProductionContainerGroupKey(firstRecord);
    const containerId = `${targetStageId}-container-${createProductionStableHash(`${groupKey}|${sourceStageId}|${sourceKeys.join("|")}`)}`;
    const sourceBatchDetails = sourceRecords.map((record, index) => {
      const meters = getProductionSourceBatchMeters(record);
      return {
        id: getProductionSourceRecordKey(record),
        label: getProductionSourceBatchLabel(record, index + 1),
        meters,
        metersDisplay: meters > 0 ? formatProductionMeters(meters) : "—",
        completedAt: record.dateEntered || record.updatedAtDisplay || "—",
        sourceStage: sourceStageLabel,
        sourceStageId,
        originalSourceStage: getProductionSourceBatchOriginLabel(record),
        nestedSourceBatches: Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [],
        unit: record.unit || getProductionOriginalUnit(record) || "",
        orderUnit: record.orderUnit || record.originalUnit || record.unit || getProductionOriginalUnit(record) || "",
        originalUnit: getProductionOriginalUnit(record) || record.originalUnit || record.orderUnit || record.unit || ""
      };
    });
    const totalMeters = sourceBatchDetails.reduce((total, source) => total + (Number(source.meters || 0) || 0), 0);
    const latestTimestamp = sourceRecords.reduce((latest, record) => {
      const timestamp = getProductionRecordRecentTimestamp(record);
      return timestamp > latest ? timestamp : latest;
    }, 0);
    const latestRecord = [...sourceRecords].sort((a, b) => getProductionRecordRecentTimestamp(b) - getProductionRecordRecentTimestamp(a))[0] || firstRecord;
    const originalMeters = sourceRecords.reduce((largest, record) => {
      const meters = getProductionOriginalStageMeters(record);
      return meters > largest ? meters : largest;
    }, 0);
    const sourceSummary = sourceBatchDetails.map((source) => source.label).join(" + ");
    const sourceDetailsText = sourceBatchDetails.map((source) => formatProductionSourceBatchDetail(source, firstRecord)).join(", ");
    const historyKey = containerId;
    const combineHistoryItem = {
      title: "Batches Combined",
      description: `Multiple ${sourceStageLabel} outputs were combined and are ready for ${targetStageLabel}. Total available: ${formatProductionMeters(totalMeters)}.`,
      meta: latestRecord.dateEntered || latestRecord.updatedAtDisplay || formatProductionNow(),
      stage: sourceStageId,
      status: "completed",
      eventType: "batches-combined",
      meters: totalMeters,
      sourceBatches: sourceBatchDetails
    };
    const inheritedSourceHistory = getProductionSourceHistoryForContainer(sourceRecords, targetStageId);
    const containerHistory = mergeProductionHistoryItems([
      ...inheritedSourceHistory,
      combineHistoryItem
    ], historyKey);

    const historyMap = getStoredProductionActionHistory();
    const hasExistingContainerHistory = Array.isArray(historyMap[historyKey]);
    let containerHistoryItems = hasExistingContainerHistory
      ? mergeProductionHistoryItems([...historyMap[historyKey], ...containerHistory], historyKey)
      : containerHistory;

    const containerRecordBase = { ...firstRecord, id: containerId, partialRecordId: containerId, stage: targetStageId, status: "pending" };
    if (!hasExistingContainerHistory) {
      saveProductionHistorySnapshot(containerRecordBase, containerHistoryItems);
      containerHistoryItems = getProductionActionHistory(containerRecordBase);
    } else {
      historyMap[historyKey] = containerHistoryItems;
      saveStoredProductionActionHistory(historyMap);
    }

    return normalizeProductionPartialRecord({
      ...firstRecord,
      id: containerId,
      partialRecordId: containerId,
      sourceType: "production-partial",
      partialKind: "container",
      unit: firstRecord.unit || containerOriginalUnit || "",
      orderUnit: firstRecord.orderUnit || firstRecord.originalUnit || firstRecord.unit || containerOriginalUnit || "",
      originalUnit: firstRecord.originalUnit || firstRecord.orderUnit || firstRecord.unit || containerOriginalUnit || "",
      partialSourceStage: sourceStageId,
      partialSourceLabel: sourceStageLabel,
      productionRecordId: "",
      stage: targetStageId,
      status: "pending",
      sourceRecordIds: sourceKeys,
      sourceBatchDetails,
      sourceBatchSummary: sourceSummary,
      sourceBatchDetailsText: sourceDetailsText,
      convertedMeters: totalMeters,
      convertedMetersDisplay: formatProductionMeters(totalMeters),
      balanceMeters: "",
      batchNumber: "",
      partialBatchNumber: "",
      originalStageMeters: originalMeters > 0 ? originalMeters : "",
      originalStageMetersDisplay: originalMeters > 0 ? formatProductionMeters(originalMeters) : "",
      assignedTo: "Unassigned",
      orderAssignedTo: getOriginalOrderAssignedTo(firstRecord),
      originalAssignedTo: getOriginalOrderAssignedTo(firstRecord),
      dateEntered: latestRecord.dateEntered || latestRecord.updatedAtDisplay || "—",
      updatedAtDisplay: latestRecord.updatedAtDisplay || latestRecord.dateEntered || "—",
      orderUpdatedAtValue: latestRecord.orderUpdatedAtValue || "",
      productionUpdatedAtValue: latestTimestamp || latestRecord.productionUpdatedAtValue || "",
      takenAtValue: latestRecord.takenAtValue || "",
      remarks: `Multiple ${sourceStageLabel} outputs were combined for ${targetStageLabel}. Total available: ${formatProductionMeters(totalMeters)}.`,
      actionHistory: containerHistoryItems
    });
  }

  function buildProductionPendingContainers(records) {
    const sourceLocks = getStoredProductionContainerSourceLocks();
    const activeContainerIds = new Set(
      records
        .filter((record) => isProductionContainerRecord(record) || hasProductionSourceBatchDetails(record))
        .map((record) => String(record.partialRecordId || record.id || ""))
        .filter(Boolean)
    );
    let hasLockCleanup = false;

    Object.entries(sourceLocks).forEach(([sourceId, containerId]) => {
      if (!activeContainerIds.has(String(containerId))) {
        delete sourceLocks[sourceId];
        hasLockCleanup = true;
      }
    });

    if (hasLockCleanup) saveStoredProductionContainerSourceLocks(sourceLocks);

    records.forEach((record) => {
      const sourceKey = getProductionSourceRecordKey(record);
      if (sourceKey && sourceLocks[sourceKey]) {
        record.hiddenByContainerId = sourceLocks[sourceKey];
      }
    });

    const containers = [];

    ["rewinding", "lamination", "slitting", "finishing"].forEach((targetStageId) => {
      const groups = new Map();

      records.forEach((record) => {
        if (!isProductionContainerSourceCandidate(record, targetStageId)) return;
        const groupKey = getProductionContainerGroupKey(record);
        if (!groupKey) return;

        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(record);
      });

      groups.forEach((groupRecords) => {
        if (groupRecords.length < 2) return;
        const containerRecord = createProductionContainerRecord(groupRecords, targetStageId);
        if (!containerRecord) return;

        groupRecords.forEach((sourceRecord) => {
          sourceRecord.hiddenByContainerId = containerRecord.id;
        });
        containers.push(containerRecord);
      });
    });

    return records.concat(containers);
  }

  function lockProductionContainerSourceRecords(record) {
    if (!isProductionContainerRecord(record) || !Array.isArray(record.sourceRecordIds) || !record.sourceRecordIds.length) return;

    const sourceLocks = getStoredProductionContainerSourceLocks();
    record.sourceRecordIds.forEach((sourceRecordId) => {
      const cleanSourceRecordId = String(sourceRecordId || "").trim();
      if (cleanSourceRecordId) sourceLocks[cleanSourceRecordId] = record.partialRecordId || record.id;
    });
    saveStoredProductionContainerSourceLocks(sourceLocks);

    productionReceivingRecords.forEach((sourceRecord) => {
      const sourceKey = getProductionSourceRecordKey(sourceRecord);
      if (sourceKey && sourceLocks[sourceKey]) {
        sourceRecord.hiddenByContainerId = sourceLocks[sourceKey];
      }
    });
  }

  function normalizeProductionPartialRecord(record) {
    if (!record) return null;

    const partialRecordId = getProductionPartialRecordId(record) || createProductionPartialRecordId(record);
    const meters = Number(record.convertedMeters || record.balanceMeters || record.partialBalanceMeters || 0);
    const safeMeters = Number.isFinite(meters) && meters > 0 ? meters : 0;

    const originalStageMeters = getProductionOriginalStageMeters(record);
    const originalUnit = getProductionOriginalUnit(record);

    return {
      ...record,
      id: partialRecordId,
      partialRecordId,
      sourceType: "production-partial",
      productionRecordId: "",
      orderId: record.orderId,
      unit: record.unit || originalUnit || "",
      orderUnit: record.orderUnit || record.originalUnit || record.unit || originalUnit || "",
      originalUnit: record.originalUnit || record.orderUnit || record.unit || originalUnit || "",
      stage: record.stage || defaultProductionStage,
      status: record.status || "pending",
      convertedMeters: safeMeters,
      convertedMetersDisplay: safeMeters > 0 ? formatProductionMeters(safeMeters) : (record.convertedMetersDisplay || "—"),
      originalStageMeters: originalStageMeters > 0 ? originalStageMeters : (record.originalStageMeters || ""),
      originalStageMetersDisplay: originalStageMeters > 0 ? formatProductionMeters(originalStageMeters) : (record.originalStageMetersDisplay || ""),
      balanceMeters: Number(record.balanceMeters || 0) || "",
      assignedTo: record.assignedTo || "Unassigned",
      orderAssignedTo: record.orderAssignedTo
        || record.originalAssignedTo
        || getStoredProductionStageRecords()[String(record.orderId || "").trim()]?.orderAssignedTo
        || getStoredProductionStageRecords()[String(record.orderId || "").trim()]?.originalAssignedTo
        || (record.sourceType === "orders-pending" ? record.assignedTo : "")
        || "Unassigned",
      originalAssignedTo: record.originalAssignedTo
        || record.orderAssignedTo
        || getStoredProductionStageRecords()[String(record.orderId || "").trim()]?.originalAssignedTo
        || getStoredProductionStageRecords()[String(record.orderId || "").trim()]?.orderAssignedTo
        || (record.sourceType === "orders-pending" ? record.assignedTo : "")
        || "Unassigned",
      assignToRole: normalizeProductionUserRole(
        record.assignToRole
          || record.assign_to_role
          || getStoredProductionStageRecords()[String(record.orderId || "").trim()]?.assignToRole
          || getStoredProductionStageRecords()[String(record.orderId || "").trim()]?.assign_to_role
          || ""
      ),
      dateEntered: record.dateEntered || record.updatedAtDisplay || "—",
      updatedAtDisplay: record.updatedAtDisplay || record.dateEntered || "—",
      remarks: record.remarks || "Partial balance item.",
      holdReason: record.holdReason || "",
      completedStages: sanitizeProductionCompletedStagesForRecord(
        Array.isArray(record.completedStages) && record.completedStages.length ? record.completedStages : ["Issue Order"],
        record.stage || defaultProductionStage,
        record.status || "pending"
      ),
      sourceRecordIds: Array.isArray(record.sourceRecordIds) ? record.sourceRecordIds : [],
      sourceBatchDetails: Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [],
      sourceBatchSummary: record.sourceBatchSummary || "",
      sourceBatchDetailsText: record.sourceBatchDetailsText || "",
      hiddenByContainerId: record.hiddenByContainerId || "",
      actionHistory: Array.isArray(record.actionHistory) ? record.actionHistory : getProductionActionHistory({ partialRecordId })
    };
  }

  function persistProductionPartialRecord(record) {
    const normalizedRecord = normalizeProductionPartialRecord(record);
    if (!normalizedRecord?.partialRecordId) return;

    const storedRecords = getStoredProductionPartialRecords();
    const recordForStorage = { ...normalizedRecord };
    delete recordForStorage.actionHistory;
    storedRecords[normalizedRecord.partialRecordId] = recordForStorage;
    saveStoredProductionPartialRecords(storedRecords);

    record.id = normalizedRecord.partialRecordId;
    record.partialRecordId = normalizedRecord.partialRecordId;
    record.sourceType = "production-partial";
  }

  function removeProductionPartialRecord(record) {
    const partialRecordId = getProductionPartialRecordId(record);
    if (!partialRecordId) return;

    const storedRecords = getStoredProductionPartialRecords();
    delete storedRecords[partialRecordId];
    saveStoredProductionPartialRecords(storedRecords);
  }

  function collectProductionSourceBatchIds(sourceBatches = [], targetSet = new Set()) {
    if (!Array.isArray(sourceBatches)) return targetSet;

    sourceBatches.forEach((source) => {
      const sourceId = String(source?.id || source?.partialRecordId || source?.partial_record_id || "").trim();
      if (sourceId) targetSet.add(sourceId);

      collectProductionSourceBatchIds(source?.nestedSourceBatches, targetSet);
      collectProductionSourceBatchIds(source?.sourceBatchDetails, targetSet);
    });

    return targetSet;
  }

  function getProductionDeliveryCleanupKeys(record = {}) {
    const cleanupKeys = new Set();
    const addKey = (value) => {
      const cleanValue = String(value || "").trim();
      if (cleanValue) cleanupKeys.add(cleanValue);
    };

    addKey(record.id);
    addKey(record.partialRecordId);
    addKey(record.productionRecordId ? `production-${record.productionRecordId}` : "");

    (Array.isArray(record.sourceRecordIds) ? record.sourceRecordIds : []).forEach(addKey);
    collectProductionSourceBatchIds(record.sourceBatchDetails, cleanupKeys);

    return cleanupKeys;
  }

  function cleanupProductionLocalRecordsAfterDelivery(record = {}) {
    const cleanupKeys = getProductionDeliveryCleanupKeys(record);
    const orderId = String(record?.orderId || "").trim();

    const storedPartialRecords = getStoredProductionPartialRecords();
    Object.entries(storedPartialRecords).forEach(([key, storedRecord]) => {
      const storedKey = getProductionSourceRecordKey(storedRecord);
      const storedOrderId = String(storedRecord?.orderId || "").trim();
      const shouldRemove = cleanupKeys.has(String(key))
        || cleanupKeys.has(storedKey)
        || (orderId && storedOrderId === orderId && String(storedRecord?.stage || "") === "finishing");

      if (shouldRemove) delete storedPartialRecords[key];
    });
    saveStoredProductionPartialRecords(storedPartialRecords);

    const sourceLocks = getStoredProductionContainerSourceLocks();
    Object.entries(sourceLocks).forEach(([sourceKey, containerId]) => {
      if (cleanupKeys.has(String(sourceKey)) || cleanupKeys.has(String(containerId))) {
        delete sourceLocks[sourceKey];
      }
    });
    saveStoredProductionContainerSourceLocks(sourceLocks);

    productionReceivingRecords = productionReceivingRecords.filter((item) => {
      const itemKey = getProductionSourceRecordKey(item);
      const itemOrderId = String(item?.orderId || "").trim();
      if (cleanupKeys.has(itemKey)) return false;
      if (orderId && itemOrderId === orderId && ["slitting", "finishing"].includes(String(item?.stage || ""))) return false;
      return true;
    });
  }

  function normalizeProductionHistoryItem(item = {}) {
    const title = String(item.title || "").trim();
    if (!title) return null;

    return {
      id: item.id || "",
      historyKey: String(item.historyKey || item.history_key || "").trim(),
      title,
      description: String(item.description || "").trim(),
      meta: String(item.meta || item.createdAt || item.created_at || "").trim(),
      stage: String(item.stage || "").trim(),
      status: String(item.status || item.stageStatus || item.stage_status || "").trim(),
      eventType: String(item.eventType || item.event_type || "").trim(),
      operators: String(
        item.operators
        || item.operator
        || item.operatorName
        || item.operatorNames
        || item.completedOperator
        || item.completed_operator
        || item.assignedTo
        || item.assigned_to
        || ""
      ).trim(),
      meters: Number(item.meters || 0) || "",
      wasteMeters: Number(item.wasteMeters || item.waste_meters || 0) || "",
      batchLabel: String(item.batchLabel || item.batch_label || "").trim(),
      sourceBatches: normalizeProductionHistorySourceBatchDetails(item.sourceBatches)
    };
  }

  function getStoredProductionActionHistory() {
    return productionActionHistoryMap && typeof productionActionHistoryMap === "object" && !Array.isArray(productionActionHistoryMap)
      ? productionActionHistoryMap
      : {};
  }

  function saveStoredProductionActionHistory(historyMap) {
    productionActionHistoryMap = historyMap && typeof historyMap === "object" && !Array.isArray(historyMap)
      ? historyMap
      : {};
  }

  function getProductionHistoryOrderKeyFromRow(row = {}) {
    const orderId = Number(row?.orderId || row?.order_id || 0);
    return Number.isInteger(orderId) && orderId > 0 ? String(orderId) : "";
  }

  function addProductionHistoryItemToMap(historyMap, historyKey, item) {
    const cleanKey = String(historyKey || "").trim();
    if (!cleanKey || !item) return;

    if (!Array.isArray(historyMap[cleanKey])) historyMap[cleanKey] = [];

    const isDuplicate = historyMap[cleanKey].some((existing) => {
      const sameId = item.id && existing?.id && String(existing.id) === String(item.id);
      const sameContent =
        String(existing?.title || "") === String(item.title || "") &&
        String(existing?.description || "") === String(item.description || "") &&
        String(existing?.meta || "") === String(item.meta || "");

      return sameId || sameContent;
    });

    if (!isDuplicate) historyMap[cleanKey].push(item);
  }

  function normalizeProductionHistoryMap(historyMap = {}) {
    Object.keys(historyMap).forEach((key) => {
      historyMap[key] = (Array.isArray(historyMap[key]) ? historyMap[key] : [])
        .filter(Boolean)
        .sort((a, b) => {
          const timeA = parseProductionSortTimestamp(a.meta);
          const timeB = parseProductionSortTimestamp(b.meta);
          if (timeA !== timeB) return timeA - timeB;
          return Number(a.id || 0) - Number(b.id || 0);
        })
        .slice(-120);
    });

    return historyMap;
  }

  function setProductionActionHistoryFromApi(historyRows = []) {
    const nextHistoryMap = {};

    historyRows.forEach((row) => {
      const item = normalizeProductionHistoryItem(row);
      const historyKey = String(row?.historyKey || row?.history_key || item?.historyKey || "").trim();
      const orderHistoryKey = getProductionHistoryOrderKeyFromRow(row);
      if (!item || !historyKey) return;

      item.historyKey = historyKey;
      addProductionHistoryItemToMap(nextHistoryMap, historyKey, item);

      /*
        Delivery details are opened by order id. Partial/container histories use
        their own partial history keys, so also mirror every API history row under
        the order id. This keeps Finishing history visible after Move to Delivery.
      */
      if (orderHistoryKey && orderHistoryKey !== historyKey) {
        addProductionHistoryItemToMap(nextHistoryMap, orderHistoryKey, { ...item });
      }
    });

    saveStoredProductionActionHistory(normalizeProductionHistoryMap(nextHistoryMap));
  }

  function mergeProductionActionHistoryFromApi(historyRows = []) {
    const historyMap = { ...getStoredProductionActionHistory() };

    historyRows.forEach((row) => {
      const item = normalizeProductionHistoryItem(row);
      const historyKey = String(row?.historyKey || row?.history_key || item?.historyKey || "").trim();
      const orderHistoryKey = getProductionHistoryOrderKeyFromRow(row);
      if (!item || !historyKey) return;

      item.historyKey = historyKey;
      addProductionHistoryItemToMap(historyMap, historyKey, item);

      if (orderHistoryKey && orderHistoryKey !== historyKey) {
        addProductionHistoryItemToMap(historyMap, orderHistoryKey, { ...item });
      }
    });

    saveStoredProductionActionHistory(normalizeProductionHistoryMap(historyMap));
  }

  function getProductionActionHistoryKey(record) {
    if (isProductionPartialRecord(record)) {
      return getProductionPartialRecordId(record);
    }

    return String(record?.orderId || record?.productionRecordId || record?.id || "").trim();
  }

  function getProductionActionHistory(record) {
    const historyKey = getProductionActionHistoryKey(record);
    if (!historyKey) return [];

    const historyItems = getStoredProductionActionHistory()[historyKey];
    return Array.isArray(historyItems) ? historyItems : [];
  }

  function extractProductionHistoryOperators(description = "") {
    const match = String(description || "").match(/Operator\/s:\s*([^.]*)/i);
    return match?.[1]?.trim() || "";
  }

  function cleanProductionHistoryDescription(description = "", item = {}) {
    let text = String(description || "")
      .replace(/^\s*Batch\s*\d+\s*[.•:-]?\s*/i, "")
      .replace(/\s*Operator\/s:\s*[^.]*\.?/gi, "")
      .replace(/\s*Printing Material:\s*[^.]*\.?/gi, "")
      .replace(/\s*Lamination Material:\s*[^.]*\.?/gi, "")
      .replace(/\s*Materials?:\s*[^.]*\.?/gi, "")
      .replace(/\s*Original meters:\s*[^.]*\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const eventType = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
    const title = String(item?.title || "").trim().toLowerCase();
    const stageId = inferProductionStageIdFromHistory(item, item?.stage || "");
    const stageLabel = stageId && productionStageMap[stageId] ? getStageLabel(stageId) : "Production";

    if (eventType === "take-order" || title === "take order") {
      return "Order was taken for Printing.";
    }

    if (eventType === "stage-started" || title.startsWith("start ")) {
      return `${stageLabel} was started.`;
    }

    if (eventType === "stage-resumed" || title.startsWith("resume ")) {
      return `${stageLabel} resumed.`;
    }

    const groupedMatch = text.match(/Grouped from\s+([^:]+):.*?Total available(?: meters)?:\s*([^.]+)\.?/i);
    if (groupedMatch) {
      const sourceStageLabel = groupedMatch[1]?.trim() || "previous stage";
      const totalMetersText = groupedMatch[2]?.trim() || "";
      const targetStageLabel = item?.stage && productionStageMap[item.stage]
        ? getStageLabel(item.stage)
        : "this stage";

      text = `Multiple ${sourceStageLabel} outputs were combined and are ready for ${targetStageLabel}.`;
      if (totalMetersText) text += ` Total available: ${totalMetersText}.`;
    }

    return text;
  }

  function getProductionHistoryDisplayTitle(item = {}) {
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

  function getProductionHistoryStagePillClass(stage = "") {
    const safeStage = String(stage || "").trim().toLowerCase();
    return productionStageMap[safeStage] ? `pr-stage-status-${safeStage}` : "";
  }

  function getProductionHistoryOperators(item = {}) {
    return String(
      item.operators
      || item.operator
      || item.operatorName
      || item.operatorNames
      || item.completedOperator
      || item.completed_operator
      || item.assignedTo
      || item.assigned_to
      || extractProductionHistoryOperators(item.description)
      || ""
    ).trim();
  }

  function getProductionStageSortOffset(stage = "") {
    const stageId = String(stage || "").trim().toLowerCase();
    const index = productionStages.findIndex((item) => item.id === stageId);
    return index >= 0 ? (index + 1) * 100 : 0;
  }

  function getProductionCombinedHistorySourceStageIdForSort(item = {}) {
    const sourceBatches = normalizeProductionHistorySourceBatchDetails(item.sourceBatches);

    for (const source of sourceBatches) {
      const directStageText = String(source?.sourceStageId || source?.sourceStage || "").trim();
      if (!directStageText) continue;

      const directStageId = inferProductionStageIdFromHistory({
        stage: directStageText,
        title: directStageText,
        description: directStageText
      }, "");

      if (directStageId && productionStageMap[directStageId]) return directStageId;
    }

    const targetStageId = String(item.stage || "").trim().toLowerCase();
    const previousStageId = getProductionContainerSourceStageId(targetStageId);
    if (previousStageId && productionStageMap[previousStageId]) return previousStageId;

    return inferProductionStageIdFromHistory(item, item.stage || "");
  }

  function getProductionHistoryOrderRank(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = String(item.title || "").trim().toLowerCase();
    const description = String(item.description || "").trim().toLowerCase();
    const isCombinedHistory = eventType === "batches-combined" || title === "batches combined" || description.includes("combined");
    const stageId = isCombinedHistory
      ? getProductionCombinedHistorySourceStageIdForSort(item)
      : inferProductionStageIdFromHistory(item, item.stage || "");
    const stageOffset = getProductionStageSortOffset(stageId);

    if (title === "issue order") return 10;
    if (title === "waiting for take order") return 20;
    if (eventType === "take-order" || title === "take order") return getProductionStageSortOffset(defaultProductionStage) + 20;
    if (eventType === "balance-created" || title.includes("balance")) return stageOffset + 15;
    if (eventType === "stage-started" || title.startsWith("start ")) return stageOffset + 20;
    if (title.includes("on-going") || title.includes("ongoing") || description.includes("in progress")) return stageOffset + 25;
    if (eventType === "stage-hold" || title.startsWith("hold ")) return stageOffset + 30;
    if (eventType === "stage-resumed" || title.startsWith("resume ")) return stageOffset + 35;
    if (eventType === "moved-to-delivery" || title.includes("moved to delivery") || title.includes("move to delivery")) return getProductionStageSortOffset("finishing") + 80;
    if (eventType === "delivered" || eventType === "item-delivered" || title.includes("item delivered") || title === "delivered order") return getProductionStageSortOffset("finishing") + 90;
    if (eventType === "stage-completed" || title.includes(" completed")) return stageOffset + 60;
    if (isCombinedHistory) return stageOffset + 70;
    if (title.includes("pending") || description.includes("waiting to start")) return stageOffset + 90;
    if (title === "production completed") return 9990;

    return stageOffset + 50;
  }


  function inferProductionStageIdFromHistory(item = {}, fallbackStageId = "") {
    const explicitStageId = String(item.stage || "").trim().toLowerCase();
    if (productionStageMap[explicitStageId]) return explicitStageId;

    const text = [item.title, item.description, item.eventType, fallbackStageId]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchedStage = productionStages.find((stage) => {
      const stageId = String(stage.id || "").toLowerCase();
      const stageLabel = String(stage.label || "").toLowerCase();
      return text.includes(stageId) || text.includes(stageLabel);
    });

    if (matchedStage?.id) return matchedStage.id;

    const fallback = String(fallbackStageId || "").trim().toLowerCase();
    return productionStageMap[fallback] ? fallback : "";
  }


  function getProductionStageOrder(stageId = "") {
    const normalizedStageId = String(stageId || "").trim().toLowerCase();
    return productionStages.findIndex((stage) => stage.id === normalizedStageId);
  }

  function shouldKeepCompletedStageForCurrentRecord(stageName = "", currentStageId = "", currentStatus = "") {
    const stageId = inferProductionStageIdFromHistory({
      title: `${stageName} Completed`,
      description: `${stageName} was completed.`,
      stage: stageName,
      eventType: "stage-completed"
    }, "");
    const currentStage = String(currentStageId || "").trim().toLowerCase();
    const normalizedStatus = String(currentStatus || "").trim().toLowerCase();

    if (!stageId || !productionStageMap[stageId]) return true;
    if (!["pending", "ongoing", "hold"].includes(normalizedStatus)) return true;

    const completedStageOrder = getProductionStageOrder(stageId);
    const currentStageOrder = getProductionStageOrder(currentStage);

    if (completedStageOrder < 0 || currentStageOrder < 0) return true;

    /*
      Stale-history guard:
      An item that is still active in its current stage must only show completed
      stages that truly happened before the current stage. This prevents old
      saved messages like "Printing Completed" or "Rewinding Completed" from
      appearing while the item is still in Printing On-going.
    */
    return completedStageOrder < currentStageOrder;
  }

  function sanitizeProductionCompletedStagesForRecord(completedStages = [], currentStageId = "", currentStatus = "") {
    const sourceStages = Array.isArray(completedStages) && completedStages.length
      ? completedStages
      : ["Issue Order"];
    const sanitizedStages = [];

    sourceStages.forEach((stageName) => {
      const cleanStageName = String(stageName || "").trim();
      if (!cleanStageName) return;

      if (cleanStageName.toLowerCase() === "issue order") {
        if (!sanitizedStages.includes("Issue Order")) sanitizedStages.push("Issue Order");
        return;
      }

      if (!shouldKeepCompletedStageForCurrentRecord(cleanStageName, currentStageId, currentStatus)) return;
      if (!sanitizedStages.includes(cleanStageName)) sanitizedStages.push(cleanStageName);
    });

    return sanitizedStages.length ? sanitizedStages : ["Issue Order"];
  }

  function shouldHideStaleCompletedHistoryForActiveRecord(record = {}, historyItem = {}) {
    const recordStatus = String(record?.status || "").trim().toLowerCase();
    if (!["pending", "ongoing", "hold"].includes(recordStatus)) return false;

    const eventType = String(historyItem?.eventType || historyItem?.event_type || "").trim().toLowerCase();
    const title = String(historyItem?.title || "").trim().toLowerCase();
    const isCompletedHistory = eventType === "stage-completed" || title.includes(" completed");
    if (!isCompletedHistory) return false;

    const historyStageId = inferProductionStageIdFromHistory(historyItem, "");
    if (!historyStageId || !productionStageMap[historyStageId]) return false;

    const currentStageId = String(record?.stage || "").trim().toLowerCase();
    const historyStageOrder = getProductionStageOrder(historyStageId);
    const currentStageOrder = getProductionStageOrder(currentStageId);

    if (historyStageOrder < 0 || currentStageOrder < 0) return false;
    return historyStageOrder >= currentStageOrder;
  }

  function extractProductionBatchLabelFromText(value = "") {
    const match = String(value || "").match(/\bBatch\s*(\d+)\b/i);
    return match ? `Batch ${Number(match[1]) || match[1]}` : "";
  }

  function getProductionHistoryBatchLabel(item = {}) {
    const storedBatchLabel = String(item.batchLabel || item.batch_label || "").trim();
    if (storedBatchLabel) return normalizeProductionSourceBatchLabelForStage(storedBatchLabel);

    return extractProductionBatchLabelFromText(`${item.title || ""} ${item.description || ""}`);
  }

  function getProductionBatchSortNumberFromText(value = "") {
    const match = String(value || "").match(/\bBatch\s*#?\s*(\d+)\b|(?:^|[\s._-])B\s*0*(\d+)\b/i);
    const number = match ? Number(match[1] || match[2] || 0) : 0;
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function getProductionHistoryBatchSortNumber(item = {}) {
    const directBatchLabel = getProductionHistoryBatchLabel(item);
    const directNumber = getProductionBatchSortNumberFromText(directBatchLabel);
    if (directNumber > 0) return directNumber;

    return getProductionBatchSortNumberFromText(`${item.title || ""} ${item.description || ""}`);
  }

  function getProductionHistoryBatchOrderGroup(item = {}) {
    const displayTitle = getProductionHistoryDisplayTitle(item).trim().toLowerCase();
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const stageId = inferProductionStageIdFromHistory(item, item.stage || "");
    return [stageId, eventType || displayTitle].join("|");
  }

  function getProductionRecordBatchSortNumber(record = {}) {
    const directNumber = getProductionBatchNumber(record);
    if (directNumber > 0) return directNumber;

    return getProductionBatchSortNumberFromText([
      record?.batchLabel,
      record?.partialSourceLabel,
      record?.remarks,
      record?.sourceBatchSummary,
      record?.sourceBatchDetailsText
    ].filter(Boolean).join(" "));
  }

  function sortProductionSourceRecordsForMerge(records = []) {
    return [...records].filter(Boolean).sort((left, right) => {
      const leftBatch = getProductionRecordBatchSortNumber(left);
      const rightBatch = getProductionRecordBatchSortNumber(right);

      if (leftBatch > 0 && rightBatch > 0 && leftBatch !== rightBatch) return leftBatch - rightBatch;
      if (leftBatch > 0 && rightBatch <= 0) return -1;
      if (rightBatch > 0 && leftBatch <= 0) return 1;

      const leftTime = getProductionRecordRecentTimestamp(left);
      const rightTime = getProductionRecordRecentTimestamp(right);
      if (leftTime !== rightTime) return leftTime - rightTime;

      return String(getProductionSourceRecordKey(left)).localeCompare(String(getProductionSourceRecordKey(right)), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    });
  }

  function normalizeProductionHistorySourceBatchDetails(sourceBatches = []) {
    if (!Array.isArray(sourceBatches)) return [];

    return sourceBatches
      .filter((source) => source && typeof source === "object")
      .map((source, index) => {
        const batchLabel = normalizeProductionSourceBatchLabelForStage(
          source.label || source.batchLabel || `Batch ${index + 1}`
        );
        const meters = Number(source.meters || 0) || 0;
        const metersDisplay = String(source.metersDisplay || "").trim()
          || (meters > 0 ? formatProductionMeters(meters) : "");

        return {
          ...source,
          label: batchLabel,
          meters,
          metersDisplay
        };
      })
      .filter((source) => String(source.label || "").trim())
      .sort((left, right) => {
        const leftBatch = getProductionBatchSortNumberFromText(left.label);
        const rightBatch = getProductionBatchSortNumberFromText(right.label);

        if (leftBatch > 0 && rightBatch > 0 && leftBatch !== rightBatch) return leftBatch - rightBatch;
        if (leftBatch > 0 && rightBatch <= 0) return -1;
        if (rightBatch > 0 && leftBatch <= 0) return 1;

        return String(left.label || "").localeCompare(String(right.label || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        });
      });
  }

  function getProductionHistoryPayload(record, item = {}) {
    const historyKey = getProductionActionHistoryKey(record);
    const orderId = Number(record?.orderId || 0);
    const productionRecordId = Number(record?.productionRecordId || 0);
    const partialRecordId = isProductionPartialRecord(record) ? getProductionPartialRecordId(record) : "";

    return {
      historyKey,
      orderId: Number.isInteger(orderId) && orderId > 0 ? orderId : undefined,
      productionRecordId: Number.isInteger(productionRecordId) && productionRecordId > 0 ? productionRecordId : undefined,
      partialRecordId: partialRecordId || undefined,
      stage: item.stage || record?.stage || "",
      status: item.status || record?.status || "",
      eventType: item.eventType || "production-action",
      title: item.title || "",
      description: item.description || "",
      operators: item.operators || extractProductionHistoryOperators(item.description) || "",
      meters: item.meters || undefined,
      wasteMeters: item.wasteMeters || undefined,
      batchLabel: item.batchLabel || "",
      sourceBatches: Array.isArray(item.sourceBatches) ? item.sourceBatches : [],
      createdAt: item.meta || formatProductionNow()
    };
  }

  function saveProductionHistoryItemToDatabase(record, item = {}) {
    if (shouldHideAutoDeliveryFinishingCompletedHistory(item)) return;

    const payload = getProductionHistoryPayload(record, item);
    if (!payload.historyKey || !payload.title) return;

    requestProductionApi(`${PRODUCTION_API_BASE}/history`, {
      method: "POST",
      body: JSON.stringify(payload)
    }).catch((error) => {
      console.error("Production history save failed:", error);
    });
  }

  function saveProductionHistorySnapshot(record, historyItems = []) {
    const historyKey = getProductionActionHistoryKey(record);
    if (!historyKey) return;

    const normalizedItems = historyItems
      .map(normalizeProductionHistoryItem)
      .filter(Boolean)
      .map((item) => ({
        ...item,
        historyKey,
        stage: item.stage || record?.stage || "",
        status: item.status || record?.status || ""
      }));

    const historyMap = getStoredProductionActionHistory();
    historyMap[historyKey] = normalizedItems.slice(-100);
    saveStoredProductionActionHistory(historyMap);

    normalizedItems.forEach((item) => saveProductionHistoryItemToDatabase(record, item));
    record.actionHistory = historyMap[historyKey];
  }

  function appendProductionActionHistory(record, title, description, meta = formatProductionNow(), details = {}) {
    const historyKey = getProductionActionHistoryKey(record);
    if (!historyKey) return;

    const cleanTitle = String(title || "").trim();
    const cleanDescription = String(description || "").trim();
    const cleanMeta = String(meta || formatProductionNow()).trim();

    if (!cleanTitle) return;

    const historyMap = getStoredProductionActionHistory();
    const currentHistory = Array.isArray(historyMap[historyKey]) ? historyMap[historyKey] : [];
    const historyItem = normalizeProductionHistoryItem({
      historyKey,
      title: cleanTitle,
      description: cleanDescription,
      meta: cleanMeta,
      stage: inferProductionStageIdFromHistory({
        title: cleanTitle,
        description: cleanDescription,
        stage: details.stage || record?.stage || "",
        eventType: details.eventType || "production-action"
      }, record?.stage || ""),
      status: details.status || record?.status || "",
      eventType: details.eventType || "production-action",
      operators: details.operators || extractProductionHistoryOperators(cleanDescription) || "",
      meters: details.meters || "",
      wasteMeters: details.wasteMeters || "",
      batchLabel: details.batchLabel || extractProductionBatchLabelFromText(`${cleanTitle} ${cleanDescription}`) || "",
      sourceBatches: normalizeProductionHistorySourceBatchDetails(details.sourceBatches)
    });

    if (!historyItem) return;
    if (shouldHideAutoDeliveryFinishingCompletedHistory(historyItem)) return;

    const isDuplicate = currentHistory.some((item) => (
      String(item?.title || "") === historyItem.title &&
      String(item?.description || "") === historyItem.description &&
      String(item?.meta || "") === historyItem.meta
    ));

    if (!isDuplicate) {
      currentHistory.push(historyItem);
    }

    historyMap[historyKey] = currentHistory.slice(-100);

    /*
      If this is a partial/container record, also mirror the item under the order id.
      Delivery details read history by order id, while partial records have their own
      local history key. Without this mirror, Finishing events can disappear once the
      item reaches Deliveries.
    */
    const orderHistoryKey = String(record?.orderId || "").trim();
    if (orderHistoryKey && orderHistoryKey !== historyKey) {
      addProductionHistoryItemToMap(historyMap, orderHistoryKey, { ...historyItem });
      normalizeProductionHistoryMap(historyMap);
    }

    saveStoredProductionActionHistory(historyMap);
    record.actionHistory = historyMap[historyKey];
    saveProductionHistoryItemToDatabase(record, historyItem);
  }

  function persistProductionStageRecord(record) {
    if (isProductionPartialRecord(record)) {
      persistProductionPartialRecord(record);
      return;
    }

    if (!record?.orderId) return;

    if (record.productionRecordId) {
      requestProductionApi(`${PRODUCTION_API_BASE}/records/${encodeURIComponent(record.productionRecordId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage: record.stage || defaultProductionStage,
          status: record.status || "pending",
          convertedMeters: Number(record.convertedMeters || 0) || undefined,
          printingMaterial: record.printingMaterial === "—" ? "" : record.printingMaterial,
          laminationMaterial: record.laminationMaterial === "—" ? "" : record.laminationMaterial,
          assignedTo: record.assignedTo === "Unassigned" ? "" : record.assignedTo,
          remarks: record.remarks || "",
          holdReason: record.holdReason || "",
          completedStages: Array.isArray(record.completedStages) ? record.completedStages : ["Issue Order"]
        })
      }).catch((error) => {
        console.error("Production record update failed:", error);
      });
    }

    const storedRecords = getStoredProductionStageRecords();
    storedRecords[String(record.orderId)] = {
      stage: record.stage || defaultProductionStage,
      status: record.status || "pending",
      assignedTo: record.assignedTo || "Unassigned",
      orderAssignedTo: getProductionAssignedToDisplay(record),
      originalAssignedTo: getProductionAssignedToDisplay(record),
      assignToRole: getProductionRecordAssignmentRole(record),
      dateEntered: record.dateEntered || "—",
      remarks: record.remarks || "",
      holdReason: record.holdReason || "",
      completedStages: Array.isArray(record.completedStages) ? record.completedStages : ["Issue Order"],
      convertedMeters: record.convertedMeters || "",
      convertedMetersDisplay: record.convertedMetersDisplay || "",
      updatedAtDisplay: record.updatedAtDisplay || record.dateEntered || "—",
      productionUpdatedAtValue: record.productionUpdatedAtValue || Date.now(),
      takenAtValue: record.takenAtValue || "",
      printingProducedMeters: record.printingProducedMeters || "",
      printingCompletedAt: record.printingCompletedAt || "",
      startingMeters: record.startingMeters || "",
      lastProducedMeters: record.lastProducedMeters || "",
      lastWasteMeters: record.lastWasteMeters || "",
      lastCompletedOperator: record.lastCompletedOperator || "",
      batchNumber: record.batchNumber || "",
      partialBatchNumber: record.partialBatchNumber || "",
      originalStageMeters: record.originalStageMeters || "",
      originalStageMetersDisplay: record.originalStageMetersDisplay || ""
    };

    saveStoredProductionStageRecords(storedRecords);
  }

  function getProductionNotificationRecordSignature(record) {
    if (!record) return "";

    const sourceRecordIds = Array.isArray(record.sourceRecordIds)
      ? record.sourceRecordIds.join(",")
      : "";
    const sourceBatchDetails = Array.isArray(record.sourceBatchDetails)
      ? record.sourceBatchDetails
          .map((source) => [source.id, source.label, source.metersDisplay, source.completedAt, source.sourceStage].filter(Boolean).join(":"))
          .join("|")
      : "";

    const signatureParts = [
      record.sourceType,
      record.partialKind,
      record.orderId,
      record.productionRecordId,
      record.partialRecordId,
      record.joNumber,
      record.poNumber,
      record.stage,
      record.status,
      record.batchNumber,
      record.partialBatchNumber,
      record.orderCreatedAtValue,
      record.orderUpdatedAtValue,
      record.productionUpdatedAtValue,
      record.takenAtValue,
      record.orderDate,
      record.updatedAtDisplay,
      record.dateEntered,
      record.convertedMeters,
      record.convertedMetersDisplay,
      record.balanceMeters,
      record.startingMeters,
      record.lastProducedMeters,
      record.lastWasteMeters,
      record.sourceBatchSummary,
      record.sourceBatchDetailsText,
      sourceRecordIds,
      sourceBatchDetails,
      record.remarks,
      record.holdReason
    ];

    return signatureParts
      .map((part) => String(part ?? "").trim())
      .filter((part) => part && part !== "—")
      .join("~");
  }

  function getProductionNotificationContextKey(stageId = activeProductionStage) {
    return stageId === 'all' ? 'prod-status' : `production-stage:${stageId || defaultProductionStage}`;
  }

  function getProductionNotificationRecordBaseKey(record, stageId = activeProductionStage) {
    if (!record) return "";

    const folderStatus = getRecordFolderStatus(record, stageId);
    const recordStage = record.stage || defaultProductionStage;
    const recordId = String(record.id || record.partialRecordId || record.productionRecordId || record.orderId || "").trim();
    const contextKey = getProductionNotificationContextKey(stageId);

    if (!recordId) return "";
    return `${contextKey}|${recordId}|${recordStage}|${folderStatus}`;
  }

  function getProductionNotificationRecordKey(record, stageId = activeProductionStage) {
    if (!record) return "";

    const baseKey = getProductionNotificationRecordBaseKey(record, stageId);
    if (!baseKey) return "";

    const signature = getProductionNotificationRecordSignature(record);
    return signature ? `${baseKey}|${signature}` : baseKey;
  }

  function getProductionNotificationFolderStatuses(stageId = activeProductionStage) {
    const stageText = String(stageId || activeProductionStage || "").trim();

    if (stageText === 'finishing' && isFinishingStageView()) {
      return Object.keys(finishingFolderDetails);
    }

    return ["pending", "ongoing", "hold"];
  }

  function isProductionStatusNotificationRecord(record, stageId = activeProductionStage) {
    if (!record) return false;
    if (!["orders-pending", "production-stage", "production-partial"].includes(record.sourceType)) return false;

    const folderStatus = getRecordFolderStatus(record, stageId);
    return getProductionNotificationFolderStatuses(stageId).includes(folderStatus);
  }

  function isProductionStatusUnreadRecord(record, readRecordIds = getProductionStatusReadRecordIds(), stageId = activeProductionStage) {
    if (!isProductionStatusNotificationRecord(record, stageId)) return false;

    const notificationKey = getProductionNotificationRecordKey(record, stageId);
    return notificationKey && !readRecordIds.has(notificationKey);
  }

  function countProductionStatusUnreadRecords(records, stageId = activeProductionStage) {
    const readRecordIds = getProductionStatusReadRecordIds();
    const unreadKeys = new Set();

    records.forEach((record) => {
      if (!isProductionStatusUnreadRecord(record, readRecordIds, stageId)) return;
      const notificationKey = getProductionNotificationRecordKey(record, stageId);
      if (notificationKey) unreadKeys.add(notificationKey);
    });

    return unreadKeys.size;
  }

  function markProductionStatusRecordAsRead(recordId, { rerender = true, stageId = activeProductionStage } = {}) {
    const cleanRecordId = String(recordId || "").trim();
    if (!cleanRecordId) return;

    const record = findRecord(cleanRecordId);
    if (!record) return;

    /*
      Read notifications must stay separated by context:
      - Prod.Status uses the "all" notification key only.
      - Production stage pages use the actual stage key only.
      This prevents opening an item in Prod.Status from clearing the Production/stage notification.
    */
    const targetStageId = stageId || activeProductionStage;
    if (!targetStageId) return;
    if (!isProductionStatusNotificationRecord(record, targetStageId)) return;

    const notificationKey = getProductionNotificationRecordKey(record, targetStageId);
    if (!notificationKey) return;

    const readRecordIds = getProductionStatusReadRecordIds();
    if (readRecordIds.has(notificationKey)) return;

    readRecordIds.add(notificationKey);
    saveProductionStatusReadRecordIds(readRecordIds);
    updateProductionReceivingCounts();

    if (rerender) {
      renderProductionReceivingList();
    }
  }

  function markProductionStatusRecordAsUnread(record, { rerender = false, stageId = null } = {}) {
    if (!record) return;

    const readRecordIds = getProductionStatusReadRecordIds();
    const stageTargets = new Set([
      stageId || record.stage || activeProductionStage,
      'all'
    ]);
    let hasChanges = false;

    stageTargets.forEach((targetStageId) => {
      if (!targetStageId) return;
      if (!isProductionStatusNotificationRecord(record, targetStageId)) return;

      const notificationKey = getProductionNotificationRecordKey(record, targetStageId);
      const notificationBaseKey = getProductionNotificationRecordBaseKey(record, targetStageId);
      if (!notificationKey && !notificationBaseKey) return;

      Array.from(readRecordIds).forEach((readKey) => {
        const readKeyText = String(readKey || "");
        const isSameExactKey = notificationKey && readKeyText === notificationKey;
        const isSameRecordFamily = notificationBaseKey && (readKeyText === notificationBaseKey || readKeyText.startsWith(`${notificationBaseKey}|`));

        if (isSameExactKey || isSameRecordFamily) {
          readRecordIds.delete(readKey);
          hasChanges = true;
        }
      });
    });

    if (hasChanges) {
      saveProductionStatusReadRecordIds(readRecordIds);
    }

    updateProductionReceivingCounts();

    if (rerender) {
      renderProductionReceivingList();
    }
  }

  function isProductionStatusView() {
    return activeProductionStage === 'all';
  }

  function syncProductionStatusViewMode() {
    configureProductionTabsForActiveStage();

    const isStatusView = isProductionStatusView();
    const isFinishingView = isFinishingStageView();

    productionStageView.classList.toggle('is-production-status-view', isStatusView);
    productionStageView.classList.toggle('is-finishing-stage-view', isFinishingView);

    if (isStatusView) {
      activeProductionReceivingStatus = 'ongoing';
    } else if (isFinishingView) {
      if (!isFinishingFolderStatus(activeProductionReceivingStatus)) {
        activeProductionReceivingStatus = defaultFinishingFolderStatus;
      }
    } else if (!statusDetails[activeProductionReceivingStatus]) {
      activeProductionReceivingStatus = 'pending';
    }

    tabButtons.forEach((button) => {
      const isMergedProductionStatusTab = isStatusView && button.dataset.prTab === 'ongoing';
      const shouldHideInStatusView = isStatusView && button.dataset.prTab !== 'ongoing';
      const label = button.querySelector('.pr-tab-label');

      button.hidden = shouldHideInStatusView || button.classList.contains('pr-folder-tab-unused');
      button.setAttribute('aria-hidden', String(button.hidden));
      button.classList.toggle('pr-status-merged-tab', isMergedProductionStatusTab);

      if (label) {
        label.textContent = isMergedProductionStatusTab
          ? 'All Items'
          : getProductionTabLabel(button.dataset.prTab);
      }
    });
  }

  /* ===== DELIVERIES VIEW MODULE - ISOLATED ===== */
  const deliveryView = document.querySelector('[data-view="deliveries"]');
  const deliveryTabs = deliveryView ? Array.from(deliveryView.querySelectorAll('[data-delivery-tab]')) : [];
  const deliveryList = document.getElementById('deliveryList');
  const deliverySearchInput = document.getElementById('deliverySearchInput');
  const deliveryClearBtn = document.getElementById('deliveryClearBtn');
  const deliveryDateRangeBtn = document.getElementById('deliveryDateRangeBtn');
  const deliveryDateModal = document.getElementById('deliveryDateModal');
  const deliveryDateFromInput = document.getElementById('deliveryDateFrom');
  const deliveryDateToInput = document.getElementById('deliveryDateTo');
  const deliveryDateApplyBtn = document.getElementById('deliveryDateApply');
  const deliveryDateClearBtn = document.getElementById('deliveryDateClear');
  const deliveryRefreshBtn = document.getElementById('deliveryRefreshBtn');
  const deliveryDetailsModal = document.getElementById('deliveryDetailsModal');
  const deliveryDetailsModalTitle = document.getElementById('deliveryDetailsModalTitle');
  const deliveryDetailsModalSubTitle = document.getElementById('deliveryDetailsModalSubTitle');
  const deliveryDetailsModalBody = document.getElementById('deliveryDetailsModalBody');
  const deliveryDetailsPrimaryAction = document.getElementById('deliveryDetailsPrimaryAction');

  let activeDeliveryTab = 'delivery';
  let deliverySearchText = '';
  let deliveryDateFrom = '';
  let deliveryDateTo = '';
  let deliveryOrdersByStatus = { delivery: [], delivered: [] };
  let isDeliveryLoading = false;
  let deliveryLoadError = '';
  let latestDeliverySignature = '';

  function createDeliverySignature(data = {}) {
    return JSON.stringify({
      delivery: (data.delivery || []).map((order) => ({
        id: order?.id ?? '',
        status: order?.orderStatus ?? '',
        updatedAt: order?.updatedAt ?? '',
        movedToDeliveryAt: order?.movedToDeliveryAt ?? '',
        deliveredAt: order?.deliveredAt ?? ''
      })),
      delivered: (data.delivered || []).map((order) => ({
        id: order?.id ?? '',
        status: order?.orderStatus ?? '',
        updatedAt: order?.updatedAt ?? '',
        deliveredAt: order?.deliveredAt ?? ''
      }))
    });
  }

  function formatDeliveryQuantity(order = {}) {
    return `${order?.quantity ?? '—'} ${order?.unit || ''}`.trim();
  }

  function getDeliveryStatusLabel(status) {
    return String(status || '').toLowerCase() === 'delivered' ? 'Delivered' : 'For Delivery';
  }

  function getDeliveryProcessLabel(order = {}) {
    const type = String(order.deliveryProcessType || order.delivery_process_type || '').toLowerCase();
    if (type === 'bagging') return 'Bagging';
    if (type === 'weighing') return 'Weighing';
    return '—';
  }

  function getDeliverySpecificFields(order = {}) {
    const type = String(order.deliveryProcessType || order.delivery_process_type || '').toLowerCase();

    if (type === 'bagging') {
      return [
        ['No. of Bags', formatProductionCompactNumber(order.deliveryBags ?? order.delivery_bags)],
        ['Pcs per Bag', formatProductionCompactNumber(order.deliveryPcsPerBag ?? order.delivery_pcs_per_bag)]
      ];
    }

    return [
      ['No. of Rolls', formatProductionCompactNumber(order.deliveryRolls ?? order.delivery_rolls)],
      ['Total Kgs', `${formatProductionCompactNumber(order.deliveryTotalKgs ?? order.delivery_total_kgs)} kgs`]
    ];
  }

  function createDeliveryField(label, value, className = '') {
    return `
      <div class="pr-field${className ? ` ${className}` : ''}">
        <span>${escapeProductionHTML(label)}</span>
        <strong>${escapeProductionHTML(value || '—')}</strong>
      </div>
    `;
  }

  function getAllDeliveryOrders() {
    return [
      ...(deliveryOrdersByStatus.delivery || []),
      ...(deliveryOrdersByStatus.delivered || [])
    ];
  }

  function findDeliveryOrder(orderId) {
    return getAllDeliveryOrders().find((order) => String(order.id) === String(orderId));
  }

  function getDeliveryDateValue(order = {}) {
    const rawDate = String(order.deliveryDate || order.delivery_date || '').trim();
    const match = rawDate.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (!match) return '';
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function updateDeliveryDateRangeSummary() {
    const hasDateRange = Boolean(deliveryDateFrom || deliveryDateTo);
    deliveryDateRangeBtn?.classList.toggle('has-active-date', hasDateRange);
  }

  function openDeliveryDateRangeModal() {
    if (!deliveryDateModal) return;

    if (deliveryDateFromInput) deliveryDateFromInput.value = deliveryDateFrom;
    if (deliveryDateToInput) deliveryDateToInput.value = deliveryDateTo;

    deliveryDateModal.classList.add('show');
    deliveryDateModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    deliveryDateFromInput?.focus();
  }

  function closeDeliveryDateRangeModal() {
    if (!deliveryDateModal) return;

    deliveryDateModal.classList.remove('show');
    deliveryDateModal.setAttribute('aria-hidden', 'true');

    if (
      !modalBackdrop?.classList.contains('show') &&
      !dateModalBackdrop?.classList.contains('show') &&
      !deliveryDetailsModal?.classList.contains('show')
    ) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function clearDeliveryDateRange({ keepModalOpen = false } = {}) {
    deliveryDateFrom = '';
    deliveryDateTo = '';

    if (deliveryDateFromInput) deliveryDateFromInput.value = '';
    if (deliveryDateToInput) deliveryDateToInput.value = '';

    updateDeliveryDateRangeSummary();
    renderDeliveryList();

    if (!keepModalOpen) closeDeliveryDateRangeModal();
  }

  function getFilteredDeliveryOrders() {
    const search = deliverySearchText.trim().toLowerCase();
    const orders = deliveryOrdersByStatus[activeDeliveryTab] || [];

    return orders
      .filter((order) => {
        const recordDate = getDeliveryDateValue(order);
        const matchesDateFrom = !deliveryDateFrom || recordDate >= deliveryDateFrom;
        const matchesDateTo = !deliveryDateTo || recordDate <= deliveryDateTo;

        if (!matchesDateFrom || !matchesDateTo) return false;
        if (!search) return true;

        return [
          order.poNumber,
          order.joNumber,
          order.client,
          order.item,
          formatDeliveryQuantity(order),
          getDeliveryProcessLabel(order),
          order.deliveryDate
        ].some((value) => String(value || '').toLowerCase().includes(search));
      })
      .sort((first, second) => {
        const firstTime = new Date(first.deliveredAt || first.movedToDeliveryAt || first.updatedAt || first.createdAt || 0).getTime();
        const secondTime = new Date(second.deliveredAt || second.movedToDeliveryAt || second.updatedAt || second.createdAt || 0).getTime();
        return (Number.isFinite(secondTime) ? secondTime : 0) - (Number.isFinite(firstTime) ? firstTime : 0);
      });
  }

  function updateDeliveryTabCounters() {
    deliveryTabs.forEach((tab) => {
      const status = tab.dataset.deliveryTab || 'delivery';
      const count = (deliveryOrdersByStatus[status] || []).length;
      const counter = tab.querySelector('.pr-tab-count');

      tab.classList.toggle('active', status === activeDeliveryTab);
      tab.setAttribute('aria-selected', String(status === activeDeliveryTab));
      if (counter) counter.textContent = count > 99 ? '99+' : String(count);
    });
  }

  function createDeliveryOrderCard(order = {}) {
    const status = String(order.orderStatus || '').toLowerCase();
    const isDelivered = status === 'delivered';
    const deliveryFields = getDeliverySpecificFields(order);

    return `
      <article class="pr-record-card delivery-record-card" data-delivery-order-id="${escapeProductionHTML(order.id)}">
        <div class="pr-record-top">
          <div class="pr-record-title">
            <div class="pr-record-title-line">
              <strong>${escapeProductionHTML(order.item || '—')}</strong>
              <em class="delivery-status-pill ${isDelivered ? 'delivered' : 'for-delivery'}">${escapeProductionHTML(getDeliveryStatusLabel(status))}</em>
            </div>
          </div>

          <div class="pr-due-date">
            <span>Delivery Date</span>
            <strong>${escapeProductionHTML(formatProductionDateForDisplay(order.deliveryDate))}</strong>
          </div>
        </div>

        <div class="pr-record-grid pr-stage-input-grid">
          ${createDeliveryField('P.O. Number', order.poNumber)}
          ${createDeliveryField('J.O. Number', order.joNumber)}
          ${createDeliveryField('Client', order.client)}
          ${createDeliveryField('Quantity', formatDeliveryQuantity(order))}
          ${createDeliveryField('Process', getDeliveryProcessLabel(order))}
          ${deliveryFields.map(([label, value]) => createDeliveryField(label, value)).join('')}
          ${isDelivered
            ? createDeliveryField('Date Delivered', formatProductionDateForDisplay(order.deliveredAt || order.updatedAt))
            : createDeliveryField('Moved To Delivery', formatProductionDateTimeForDisplay(order.movedToDeliveryAt || order.updatedAt))}
        </div>

        <div class="pr-card-actions">
          <button class="pr-action-btn" type="button" data-delivery-details="${escapeProductionHTML(order.id)}">View Details</button>
          ${isDelivered ? '' : `<button class="pr-action-btn success" type="button" data-delivery-mark-delivered="${escapeProductionHTML(order.id)}">Mark Delivered</button>`}
        </div>
      </article>
    `;
  }

  function renderDeliveryList() {
    if (!deliveryList) return;

    updateDeliveryTabCounters();

    if (isDeliveryLoading) {
      deliveryList.innerHTML = `
        <div class="pr-empty-state">
          <div>
            <strong>Loading deliveries...</strong>
            <span>Fetching the latest delivery records.</span>
          </div>
        </div>
      `;
      return;
    }

    if (deliveryLoadError) {
      deliveryList.innerHTML = `
        <div class="pr-empty-state">
          <div>
            <strong>Delivery records could not be loaded.</strong>
            <span>${escapeProductionHTML(deliveryLoadError)}</span>
          </div>
        </div>
      `;
      return;
    }

    const orders = getFilteredDeliveryOrders();
    if (!orders.length) {
      const isDelivered = activeDeliveryTab === 'delivered';
      deliveryList.innerHTML = `
        <div class="pr-empty-state">
          <div>
            <strong>${isDelivered ? 'No delivered orders' : 'No for delivery orders'}</strong>
            <span>${isDelivered ? 'Delivered orders will appear here.' : 'Items moved from Finishing will appear here.'}</span>
          </div>
        </div>
      `;
      return;
    }

    deliveryList.innerHTML = orders.map(createDeliveryOrderCard).join('');

    window.requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent('system:delivery-list-rendered'));
    });
  }

  async function loadDeliveryOrders({ silent = false, forceRender = false } = {}) {
    if (!deliveryView || !deliveryList) return;

    if (!silent) {
      isDeliveryLoading = true;
      deliveryLoadError = '';
      renderDeliveryList();
    }

    try {
      const [forDeliveryData, deliveredData] = await Promise.all([
        requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}?${new URLSearchParams({ status: 'delivery' })}`),
        requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}?${new URLSearchParams({ status: 'delivered' })}`)
      ]);

      const nextData = {
        delivery: Array.isArray(forDeliveryData?.orders) ? forDeliveryData.orders : [],
        delivered: Array.isArray(deliveredData?.orders) ? deliveredData.orders : []
      };
      const nextSignature = createDeliverySignature(nextData);

      if (silent && !forceRender && nextSignature === latestDeliverySignature) {
        return;
      }

      deliveryOrdersByStatus = nextData;
      latestDeliverySignature = nextSignature;
      deliveryLoadError = '';
    } catch (error) {
      if (silent) {
        console.warn('Delivery refresh failed:', error?.message || error);
        return;
      }

      deliveryOrdersByStatus = { delivery: [], delivered: [] };
      deliveryLoadError = error?.message || 'Unable to load delivery records.';
    } finally {
      if (!silent) isDeliveryLoading = false;
      renderDeliveryList();
    }
  }

  function createDeliveryDetailCard(label, value, className = '') {
    return `
      <div class="delivery-detail-card${className ? ` ${className}` : ''}">
        <span>${escapeProductionHTML(label)}</span>
        <strong>${escapeProductionHTML(value || '—')}</strong>
      </div>
    `;
  }


  function getDeliveryHistoryRecord(order = {}) {
    return {
      ...order,
      id: `delivery-${order.id || ""}`,
      orderId: order.id,
      productionRecordId: order.productionRecordId || "",
      stage: "delivery",
      status: String(order.orderStatus || "").toLowerCase(),
      sourceType: "delivery-order",
      orderDate: formatProductionDateTimeForDisplay(order.createdAt || order.orderCreatedAt || ""),
      orderCreatedAtValue: order.createdAt || order.orderCreatedAt || "",
      actionHistory: getProductionActionHistory({ orderId: order.id })
    };
  }

  function isDeliveryMovementHistoryItem(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = String(item.title || "").trim().toLowerCase();
    const description = String(item.description || "").trim().toLowerCase();
    const stage = String(item.stage || "").trim().toLowerCase();

    return stage === "delivery"
      || ["moved-to-delivery", "move-to-delivery", "delivery", "delivered"].includes(eventType)
      || title.includes("moved to delivery")
      || title.includes("move to delivery")
      || title.includes("item delivered")
      || title === "delivered"
      || description.includes("marked as delivered")
      || description.includes("moved to for delivery")
      || description.includes("moved to delivery");
  }

  function shouldHideDeliveryHistoryItem(item = {}) {
    const title = String(item.title || "").trim().toLowerCase();
    const description = String(item.description || "").trim().toLowerCase();
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();

    /*
      getProductionHistoryItems() is built for production stages only. Delivery records
      use stage="delivery", so the generic production fallback can create a fake
      "Pending / Current production status" row. Hide that only in Deliveries.
    */
    if (shouldHideAutoDeliveryFinishingCompletedHistory(item)) return true;

    return title === "pending"
      && description === "current production status."
      && !eventType;
  }

  function createDeliveryFallbackHistoryItems(order = {}) {
    const status = String(order.orderStatus || order.order_status || "").trim().toLowerCase();
    const items = [];

    const addDeliveryHistory = (title, description, meta, details = {}) => {
      const cleanTitle = String(title || "").trim();
      const cleanMeta = String(meta || "").trim();
      if (!cleanTitle || !cleanMeta) return;

      items.push({
        title: cleanTitle,
        description: String(description || "").trim(),
        meta: cleanMeta,
        stage: "delivery",
        status: String(details.status || status || "delivery").trim(),
        eventType: String(details.eventType || "").trim(),
        operators: "",
        meters: "",
        wasteMeters: "",
        batchLabel: "",
        sourceBatches: []
      });
    };

    addDeliveryHistory(
      "Moved to Delivery",
      "Item moved to Deliveries and is ready for delivery processing.",
      order.movedToDeliveryAt || order.moved_to_delivery_at || "",
      { status: "delivery", eventType: "moved-to-delivery" }
    );

    if (status === "delivered" || order.deliveredAt || order.delivered_at) {
      addDeliveryHistory(
        "Item Delivered",
        "Item was marked as delivered from Deliveries.",
        order.deliveredAt || order.delivered_at || order.updatedAt || order.updated_at || "",
        { status: "delivered", eventType: "delivered" }
      );
    }

    return items;
  }

  function getDeliveryHistoryDedupeKey(item = {}) {
    const title = String(item.title || "").trim().toLowerCase();
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const metaDate = String(item.meta || item.createdAt || item.created_at || "").trim().slice(0, 16);
    const status = String(item.status || item.stageStatus || item.stage_status || "").trim().toLowerCase();

    if (title.includes("item delivered") || eventType === "delivered" || status === "delivered") {
      return "delivery:item-delivered";
    }

    if (title.includes("moved to delivery") || eventType.includes("delivery") || status === "delivery") {
      return "delivery:moved-to-delivery";
    }

    return `${title}|${eventType}|${metaDate}`;
  }

  function mergeDeliveryHistoryItems(primaryItems = [], fallbackItems = []) {
    const seen = new Set();
    const mergedItems = [];

    [...primaryItems, ...fallbackItems].forEach((item) => {
      const normalizedItem = normalizeProductionHistoryItem(item);
      if (!normalizedItem || shouldHideDeliveryHistoryItem(normalizedItem)) return;

      const dedupeKey = getDeliveryHistoryDedupeKey(normalizedItem);
      if (seen.has(dedupeKey)) return;

      seen.add(dedupeKey);
      mergedItems.push(normalizedItem);
    });

    return mergedItems;
  }

  function getDeliveryHistoryItemsForDisplay(order = {}) {
    const historyRecord = getDeliveryHistoryRecord(order);
    const rawHistoryItems = getProductionHistoryItems(historyRecord).filter((item) => !shouldHideDeliveryHistoryItem(item));
    const productionHistoryItems = rawHistoryItems.filter((item) => !isDeliveryMovementHistoryItem(item));
    const savedDeliveryHistoryItems = rawHistoryItems.filter(isDeliveryMovementHistoryItem);
    const fallbackDeliveryHistoryItems = createDeliveryFallbackHistoryItems(order);
    const deliveryHistoryItems = mergeDeliveryHistoryItems(savedDeliveryHistoryItems, fallbackDeliveryHistoryItems);

    /*
      Keep production stages in their existing workflow order, then always place
      delivery movement at the end so Delivered items do not lose their trace.
    */
    return [
      ...productionHistoryItems,
      ...deliveryHistoryItems
    ];
  }

  function createDeliveryHistoryHTML(order = {}) {
    const historyRecord = getDeliveryHistoryRecord(order);
    const rawHistoryItems = getDeliveryHistoryItemsForDisplay(order);

    if (!rawHistoryItems.length) {
      return `
        <div class="pr-production-history wide delivery-item-history">
          <div class="pr-history-head">
            <div>
              <span>Item History</span>
              <small>Production and delivery movement trace.</small>
            </div>
            <strong>0</strong>
          </div>
          <div class="pr-empty-state delivery-history-empty">
            <div>
              <strong>No item history yet</strong>
              <span>History will appear here once the item moves through production and deliveries.</span>
            </div>
          </div>
        </div>
      `;
    }

    const combinedHistoryItems = rawHistoryItems.filter(isProductionCombinedHistoryItem);
    const historyItems = combinedHistoryItems.length
      ? rawHistoryItems.filter((item) => !shouldHideProductionHistoryItemInsideCombinedBatches(item, combinedHistoryItems))
      : rawHistoryItems;
    const starterDetailStageSet = new Set(
      historyItems
        .filter((historyItem) => {
          const title = getProductionHistoryDisplayTitle(historyItem).toLowerCase();
          return (title.includes("on-going") || title.includes("ongoing"))
            && (getProductionHistoryOperators(historyItem) || Number(historyItem?.meters || 0) > 0);
        })
        .map((historyItem) => inferProductionStageIdFromHistory(historyItem, historyItem.stage || ""))
        .filter(Boolean)
    );

    return `
      <div class="pr-production-history wide delivery-item-history">
        <div class="pr-history-head">
          <div>
            <span>Item History</span>
            <small>Production and delivery movement trace.</small>
          </div>
          <strong>${historyItems.length}</strong>
        </div>
        <div class="pr-history-list">
          ${historyItems
            .map((item) => createProductionHistoryTimelineItemHTML(historyRecord, item, starterDetailStageSet, rawHistoryItems))
            .join("")}
        </div>
      </div>
    `;
  }

  function createDeliveryHistoryLoadingHTML() {
    return `
      <div class="pr-production-history wide delivery-item-history is-loading">
        <div class="pr-history-head">
          <div>
            <span>Item History</span>
            <small>Loading production and delivery trace...</small>
          </div>
          <strong>...</strong>
        </div>
        <div class="pr-empty-state delivery-history-empty">
          <div>
            <strong>Loading item history...</strong>
            <span>Please wait while the latest item history is loaded.</span>
          </div>
        </div>
      </div>
    `;
  }

  async function loadDeliveryDetailsHistory(order = {}) {
    const historyContainer = document.getElementById('deliveryDetailsHistoryContainer');
    const orderId = Number(order?.id || 0);

    if (!historyContainer || !Number.isInteger(orderId) || orderId <= 0) return;

    try {
      const historyData = await requestProductionApi(`${PRODUCTION_API_BASE}/history?${new URLSearchParams({ orderId: String(orderId) })}`);
      const historyRows = Array.isArray(historyData?.history) ? historyData.history : [];
      mergeProductionActionHistoryFromApi(historyRows);

      if (String(deliveryDetailsModal?.dataset.deliveryOrderId || '') !== String(orderId)) return;
      historyContainer.innerHTML = createDeliveryHistoryHTML(order);
    } catch (error) {
      if (String(deliveryDetailsModal?.dataset.deliveryOrderId || '') !== String(orderId)) return;
      /* Keep delivery movement visible even if the history endpoint fails. */
      historyContainer.innerHTML = createDeliveryHistoryHTML(order);
    }
  }

  function openDeliveryDetailsModal(orderId) {
    const order = findDeliveryOrder(orderId);
    if (!order || !deliveryDetailsModal || !deliveryDetailsModalBody) return;

    const status = String(order.orderStatus || '').toLowerCase();
    const isDelivered = status === 'delivered';
    const deliveryFields = getDeliverySpecificFields(order);

    if (deliveryDetailsModalTitle) deliveryDetailsModalTitle.textContent = order.item || 'Delivery Details';
    if (deliveryDetailsModalSubTitle) deliveryDetailsModalSubTitle.textContent = `${order.poNumber || '—'} • ${order.joNumber || '—'}`;

    deliveryDetailsModal.dataset.deliveryOrderId = order.id;
    if (deliveryDetailsPrimaryAction) {
      deliveryDetailsPrimaryAction.hidden = isDelivered;
      deliveryDetailsPrimaryAction.disabled = false;
      deliveryDetailsPrimaryAction.textContent = 'Mark as Delivered';
    }

    deliveryDetailsModalBody.innerHTML = `
      <div class="delivery-detail-grid">
        ${createDeliveryDetailCard('Status', getDeliveryStatusLabel(status))}
        ${createDeliveryDetailCard('Delivery Date', formatProductionDateForDisplay(order.deliveryDate))}
        ${createDeliveryDetailCard('P.O. Number', order.poNumber)}
        ${createDeliveryDetailCard('J.O. Number', order.joNumber)}
        ${createDeliveryDetailCard('Client', order.client)}
        ${createDeliveryDetailCard('Quantity', formatDeliveryQuantity(order))}
        ${createDeliveryDetailCard('Process', getDeliveryProcessLabel(order))}
        ${deliveryFields.map(([label, value]) => createDeliveryDetailCard(label, value)).join('')}
        ${createDeliveryDetailCard('Moved To Delivery', formatProductionDateTimeForDisplay(order.movedToDeliveryAt || order.updatedAt))}
        ${isDelivered ? createDeliveryDetailCard('Date Delivered', formatProductionDateTimeForDisplay(order.deliveredAt || order.updatedAt)) : ''}
        ${createDeliveryDetailCard('Item', order.item, 'wide')}
      </div>
      <div id="deliveryDetailsHistoryContainer" class="delivery-details-history-container">
        ${createDeliveryHistoryLoadingHTML()}
      </div>
    `;

    loadDeliveryDetailsHistory(order);

    resetProductionDetailsModalPosition(deliveryDetailsModal, deliveryDetailsModalBody);
    deliveryDetailsModal.classList.add('show');
    deliveryDetailsModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    resetProductionDetailsModalPosition(deliveryDetailsModal, deliveryDetailsModalBody);

    document.dispatchEvent(new CustomEvent('system:delivery-record-opened', {
      detail: { orderId: order.id }
    }));
  }

  function closeDeliveryDetailsModal() {
    if (!deliveryDetailsModal) return;

    deliveryDetailsModal.classList.remove('show');
    deliveryDetailsModal.setAttribute('aria-hidden', 'true');
    deliveryDetailsModal.dataset.deliveryOrderId = '';

    if (
      !modalBackdrop?.classList.contains('show') &&
      !dateModalBackdrop?.classList.contains('show') &&
      !deliveryDateModal?.classList.contains('show')
    ) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  async function markDeliveryOrderAsDelivered(orderId) {
    if (!orderId) return;

    await requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'delivered' })
    });

    document.dispatchEvent(new CustomEvent('system:delivery-records-updated'));
    document.dispatchEvent(new CustomEvent('system:overview-refresh'));
    document.dispatchEvent(new CustomEvent('system:notifications-refresh'));
    await loadDeliveryOrders({ forceRender: true });
  }

  function initDeliveryView() {
    if (!deliveryView) return;

    deliveryTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        activeDeliveryTab = tab.dataset.deliveryTab || 'delivery';
        renderDeliveryList();
        document.dispatchEvent(new CustomEvent('system:reset-default-position'));
      });
    });

    deliverySearchInput?.addEventListener('input', (event) => {
      deliverySearchText = event.target.value;
      renderDeliveryList();
    });

    deliveryDateRangeBtn?.addEventListener('click', openDeliveryDateRangeModal);

    deliveryDateApplyBtn?.addEventListener('click', () => {
      deliveryDateFrom = deliveryDateFromInput?.value || '';
      deliveryDateTo = deliveryDateToInput?.value || '';

      updateDeliveryDateRangeSummary();
      renderDeliveryList();
      closeDeliveryDateRangeModal();
    });

    deliveryDateClearBtn?.addEventListener('click', () => {
      clearDeliveryDateRange({ keepModalOpen: true });
    });

    deliveryDateModal?.querySelector('.delivery-date-modal-close')?.addEventListener('click', closeDeliveryDateRangeModal);

    deliveryClearBtn?.addEventListener('click', () => {
      deliverySearchText = '';
      if (deliverySearchInput) deliverySearchInput.value = '';
      clearDeliveryDateRange();
      renderDeliveryList();
    });

    deliveryRefreshBtn?.addEventListener('click', () => loadDeliveryOrders({ forceRender: true }));

    deliveryList?.addEventListener('click', async (event) => {
      const detailsButton = event.target.closest('[data-delivery-details]');
      const deliveredButton = event.target.closest('[data-delivery-mark-delivered]');

      if (detailsButton) {
        openDeliveryDetailsModal(detailsButton.dataset.deliveryDetails);
        return;
      }

      if (deliveredButton) {
        deliveredButton.disabled = true;
        deliveredButton.textContent = 'Marking...';
        try {
          await markDeliveryOrderAsDelivered(deliveredButton.dataset.deliveryMarkDelivered);
        } catch (error) {
          deliveredButton.disabled = false;
          deliveredButton.textContent = 'Mark Delivered';
          alert(error?.message || 'Unable to mark this order as delivered.');
        }
      }
    });

    deliveryDetailsModal?.querySelector('.delivery-details-close')?.addEventListener('click', closeDeliveryDetailsModal);
    deliveryDetailsModal?.querySelector('.delivery-details-cancel')?.addEventListener('click', closeDeliveryDetailsModal);
    deliveryDetailsPrimaryAction?.addEventListener('click', async () => {
      const orderId = deliveryDetailsModal?.dataset.deliveryOrderId;
      if (!orderId) return;

      deliveryDetailsPrimaryAction.disabled = true;
      deliveryDetailsPrimaryAction.textContent = 'Marking...';

      try {
        await markDeliveryOrderAsDelivered(orderId);
        closeDeliveryDetailsModal();
      } catch (error) {
        deliveryDetailsPrimaryAction.disabled = false;
        deliveryDetailsPrimaryAction.textContent = 'Mark as Delivered';
        alert(error?.message || 'Unable to mark this order as delivered.');
      }
    });

    document.addEventListener('click', (event) => {
      const deliveryLink = event.target.closest('[data-view-target="deliveries"]');
      if (!deliveryLink) return;
      window.setTimeout(() => loadDeliveryOrders({ forceRender: true }), 0);
    });

    document.addEventListener('system:delivery-records-updated', () => loadDeliveryOrders({ silent: true, forceRender: true }));

    updateDeliveryDateRangeSummary();
  }

  function getStageLabel(stageId) {
    if (stageId === 'all') return 'Production';
    if (stageId === 'deliveries') return 'Deliveries';
    if (stageId === 'completed') return 'Complete Production';
    return productionStageMap[stageId]?.label || 'Production';
  }

  function getNextStageLabel(stageId) {
    const nextStage = productionStageMap[stageId]?.next;
    return nextStage ? getStageLabel(nextStage) : 'Deliveries';
  }

  function getActualStatusDetails(record) {
    return statusDetails[record?.status] || statusDetails.pending;
  }

  function getProductionCurrentStatusLabel(record) {
    const details = getActualStatusDetails(record);
    const stageId = record?.stage || (record?.sourceType === "orders-pending" ? defaultProductionStage : "");

    if (stageId && productionStageMap[stageId]) {
      return `${getStageLabel(stageId)} • ${details.label}`;
    }

    return details.label;
  }

  function createProductionStatusPill(record) {
    const details = getActualStatusDetails(record);
    const stageId = record?.stage || (record?.sourceType === "orders-pending" ? defaultProductionStage : "");
    const stageStatusClass = stageId && productionStageMap[stageId]
      ? ` pr-stage-status-${stageId}`
      : "";

    return `<em class="pr-status-pill ${details.pillClass}${stageStatusClass}">${escapeProductionHTML(getProductionCurrentStatusLabel(record))}</em>`;
  }

  function isProductionStarterHistoryEvent(item = {}) {
    const eventType = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
    const title = String(item?.title || "").trim().toLowerCase();

    return eventType === "take-order"
      || eventType === "stage-started"
      || eventType === "stage-resumed"
      || title === "take order"
      || title.startsWith("start ")
      || title.startsWith("resume ");
  }

  function getProductionStarterStageId(item = {}, fallbackStageId = "") {
    const eventType = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
    const title = String(item?.title || "").trim().toLowerCase();

    if (eventType === "take-order" || title === "take order") return defaultProductionStage;

    return inferProductionStageIdFromHistory(item, fallbackStageId || defaultProductionStage);
  }

  function getProductionCurrentStatusMeta(record = {}, actionHistory = []) {
    const fallbackMeta = getProductionHistoryDateTime(record, record.updatedAtDisplay || record.dateEntered);
    const status = String(record?.status || "").trim().toLowerCase();

    if (record?.sourceType === "orders-pending") return fallbackMeta;

    const normalizedHistory = (Array.isArray(actionHistory) ? actionHistory : [])
      .map(normalizeProductionHistoryItem)
      .filter(Boolean);

    if (!normalizedHistory.length) return fallbackMeta;

    if (status === "pending") {
      const latestMeaningfulHistory = [...sortProductionHistoryItems(normalizedHistory)].reverse().find((history) => {
        const eventType = String(history?.eventType || history?.event_type || "").trim().toLowerCase();
        const title = String(history?.title || "").trim().toLowerCase();
        return eventType === "stage-completed"
          || eventType === "batches-combined"
          || title.includes(" completed")
          || title === "batches combined";
      });

      return latestMeaningfulHistory?.meta || fallbackMeta;
    }

    if (["ongoing", "hold"].includes(status)) {
      const currentStageId = String(record?.stage || "").trim();
      const latestStarterHistory = [...sortProductionHistoryItems(normalizedHistory)].reverse().find((history) => {
        const historyStageId = getProductionStarterStageId(history, currentStageId);
        return historyStageId === currentStageId && isProductionStarterHistoryEvent(history);
      });

      return latestStarterHistory?.meta || fallbackMeta;
    }

    return fallbackMeta;
  }

  function getProductionCurrentStatusHistoryDetails(record = {}, actionHistory = []) {
    const stageId = String(record?.stage || (record?.sourceType === "orders-pending" ? defaultProductionStage : "")).trim();
    const status = String(record?.status || "").trim().toLowerCase();

    if (!stageId || !["ongoing", "hold"].includes(status)) {
      return {};
    }

    const eventMatchesStatus = (history = {}) => {
      const eventType = String(history?.eventType || history?.event_type || "").trim().toLowerCase();
      const title = String(history?.title || "").trim().toLowerCase();

      if (status === "ongoing") {
        return eventType === "take-order"
          || eventType === "stage-started"
          || eventType === "stage-resumed"
          || title === "take order"
          || title.startsWith("start ")
          || title.startsWith("resume ");
      }

      if (status === "hold") {
        return eventType === "stage-hold" || title.startsWith("hold ");
      }

      return false;
    };

    const sortedHistory = sortProductionHistoryItems(
      (Array.isArray(actionHistory) ? actionHistory : [])
        .map(normalizeProductionHistoryItem)
        .filter(Boolean)
    );

    const matchedHistory = [...sortedHistory].reverse().find((history) => {
      const historyStageId = inferProductionStageIdFromHistory(history, stageId);
      return historyStageId === stageId && eventMatchesStatus(history);
    });

    if (!matchedHistory) return {};

    return {
      stage: stageId,
      status,
      eventType: "current-status",
      operators: getProductionHistoryOperators(matchedHistory),
      meters: Number(matchedHistory.meters || 0) || "",
      batchLabel: getProductionHistoryBatchLabel(matchedHistory)
    };
  }

  function getProductionHistoryItems(record) {
    if (!record) return [];

    const historyItems = [];
    const addHistory = (title, description, meta = "", details = {}) => {
      const cleanTitle = String(title || "").trim();
      const cleanDescription = String(description || "").trim();
      const cleanMeta = String(meta || "").trim();

      if (!cleanTitle) return;
      if (shouldHideAutoDeliveryFinishingCompletedHistory({
        title: cleanTitle,
        description: cleanDescription,
        meta: cleanMeta,
        stage: details.stage || record?.stage || "",
        eventType: details.eventType || ""
      })) return;
      if (historyItems.some((item) => item.title === cleanTitle && item.description === cleanDescription && item.meta === cleanMeta)) return;

      const inferredStage = inferProductionStageIdFromHistory({
        title: cleanTitle,
        description: cleanDescription,
        stage: details.stage || "",
        eventType: details.eventType || ""
      }, record?.stage || "");
      const resolvedBatchLabel = String(details.batchLabel || "").trim()
        || extractProductionBatchLabelFromText(`${cleanTitle} ${cleanDescription}`);

      historyItems.push({
        title: cleanTitle,
        description: cleanDescription,
        meta: cleanMeta,
        stage: inferredStage,
        status: String(details.status || "").trim(),
        eventType: String(details.eventType || "").trim(),
        operators: getProductionHistoryOperators({ ...details, description: cleanDescription }),
        meters: Number(details.meters || 0) || "",
        wasteMeters: Number(details.wasteMeters || 0) || "",
        batchLabel: resolvedBatchLabel,
        sourceBatches: normalizeProductionHistorySourceBatchDetails(details.sourceBatches),
        _sortIndex: historyItems.length
      });
    };

    const completedStages = Array.isArray(record.completedStages) ? record.completedStages : [];

    const issueOrderMeta = record.orderDate || formatProductionDateTimeForDisplay(record.orderCreatedAtValue) || "";

    addHistory(
      "Issue Order",
      "Order was issued and is waiting for production.",
      issueOrderMeta
    );

    const rawActionHistory = Array.isArray(record.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);
    const actionHistory = rawActionHistory.filter((historyItem) => {
      if (shouldHideAutoDeliveryFinishingCompletedHistory(historyItem)) return false;
      if (shouldHideProductionHistoryItemForRecord(record, historyItem)) return false;
      if (shouldHideStaleCompletedHistoryForActiveRecord(record, historyItem)) return false;
      return true;
    });
    const actionHistoryTitles = new Set(
      actionHistory
        .map((history) => String(history?.title || "").trim().toLowerCase())
        .filter(Boolean)
    );

    if (record.sourceType === "production-stage" && !actionHistoryTitles.has("take order")) {
      addHistory(
        "Take Order",
        "Printing started.",
        record.dateEntered || "",
        { stage: defaultProductionStage, status: "ongoing", eventType: "take-order", operators: getProductionOperatorDisplay(record) }
      );
    }

    if (isProductionContainerRecord(record)) {
      const inheritedSourceRecords = getProductionContainerSourceRecords(record);
      const inheritedSourceHistory = getProductionSourceHistoryForContainer(inheritedSourceRecords, record.stage);

      inheritedSourceHistory.forEach((history) => {
        addHistory(
          history?.title,
          history?.description,
          String(history?.meta || "").trim(),
          history || {}
        );
      });
    }

    actionHistory.forEach((history) => {
      addHistory(
        history?.title,
        history?.description,
        String(history?.meta || "").trim(),
        history || {}
      );

      if (isProductionStarterHistoryEvent(history)) {
        const starterStageId = getProductionStarterStageId(history, record?.stage || defaultProductionStage);
        const starterOperators = getProductionHistoryOperators(history);
        const starterMeters = Number(history?.meters || 0) || 0;

        if (starterStageId && productionStageMap[starterStageId]) {
          addHistory(
            `${getStageLabel(starterStageId)} • Ongoing`,
            `${getStageLabel(starterStageId)} is in progress.`,
            String(history?.meta || "").trim(),
            {
              ...history,
              stage: starterStageId,
              status: "ongoing",
              eventType: "current-status",
              operators: starterOperators,
              meters: starterMeters,
              batchLabel: getProductionHistoryBatchLabel(history)
            }
          );
        }
      }
    });

    completedStages.forEach((stageName) => {
      const cleanStageName = String(stageName || "").trim();
      if (!cleanStageName || cleanStageName === "Issue Order") return;

      const completedStageId = inferProductionStageIdFromHistory({
        title: `${cleanStageName} Completed`,
        description: `${cleanStageName} was completed.`,
        stage: "",
        eventType: "stage-completed"
      }, "");
      const currentStageId = String(record?.stage || "").trim();
      const currentStatus = String(record?.status || "").trim().toLowerCase();

      if (!shouldKeepCompletedStageForCurrentRecord(cleanStageName, currentStageId, currentStatus)) {
        return;
      }

      // A partial/batch item that is still pending/ongoing/hold in its current
      // stage must not show a fallback "Stage Completed" row for that same
      // stage. That row belongs only to the batch/run that has already left
      // the stage.
      if (isProductionPartialRecord(record)
        && completedStageId
        && completedStageId === currentStageId
        && ["pending", "ongoing", "hold"].includes(currentStatus)) {
        return;
      }

      const completedTitle = `${cleanStageName} Completed`;
      if (actionHistoryTitles.has(completedTitle.toLowerCase())) return;

      addHistory(
        completedTitle,
        `${cleanStageName} was completed.`,
        getProductionHistoryDateTime(record, record.updatedAtDisplay || record.dateEntered),
        { stage: completedStageId || "", eventType: "stage-completed" }
      );
    });

    if (record.status === "completed") {
      addHistory(
        "Production Completed",
        "Production was completed.",
        getProductionHistoryDateTime(record, record.updatedAtDisplay || record.dateEntered)
      );
    } else if (record.sourceType === "orders-pending") {
      addHistory(
        "Waiting for Take Order",
        "Waiting for Printing to take the order.",
        issueOrderMeta || record.dateEntered || ""
      );
    } else {
      const statusDescriptionMap = {
        pending: `${getStageLabel(record.stage)} is waiting to start.`,
        ongoing: `${getStageLabel(record.stage)} is in progress.`,
        hold: `${getStageLabel(record.stage)} is on hold.`
      };

      const currentStatusTitle = getProductionCurrentStatusLabel(record);
      const hasExistingCurrentStatusHistory = historyItems.some((historyItem) => {
        const historyTitle = String(historyItem?.title || "").trim().toLowerCase();
        return historyTitle === String(currentStatusTitle || "").trim().toLowerCase();
      });

      if (!hasExistingCurrentStatusHistory) {
        addHistory(
          currentStatusTitle,
          statusDescriptionMap[record.status] || record.remarks || "Current production status.",
          getProductionCurrentStatusMeta(record, actionHistory),
          getProductionCurrentStatusHistoryDetails(record, actionHistory)
        );
      }
    }

    return sortProductionHistoryItems(historyItems).map(({ _sortIndex, ...historyItem }) => historyItem);
  }

  function isProductionCombinedHistoryItem(item = {}) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const title = getProductionHistoryDisplayTitle(item).trim().toLowerCase();
    return eventType === "batches-combined" || title === "batches combined";
  }

  function areProductionNestedBatchLabelsSame(leftLabel = "", rightLabel = "") {
    const leftNumber = getProductionBatchSortNumberFromText(leftLabel);
    const rightNumber = getProductionBatchSortNumberFromText(rightLabel);

    if (leftNumber > 0 && rightNumber > 0) return leftNumber === rightNumber;

    const leftText = normalizeProductionSourceBatchLabelForStage(leftLabel).trim().toLowerCase();
    const rightText = normalizeProductionSourceBatchLabelForStage(rightLabel).trim().toLowerCase();

    return Boolean(leftText && rightText && leftText === rightText);
  }

  function getProductionCombinedSourceStageId(combinedItem = {}, source = {}) {
    const directStage = String(source.sourceStageId || source.sourceStage || "").trim().toLowerCase();
    if (directStage && productionStageMap[directStage]) return directStage;

    const combinedStage = String(combinedItem.stage || "").trim().toLowerCase();
    const previousStage = getProductionContainerSourceStageId(combinedStage);
    if (previousStage) return previousStage;

    return inferProductionStageIdFromHistory(combinedItem, combinedItem.stage || "");
  }

  function getProductionCombinedSourceLabel(source = {}, index = 0) {
    return normalizeProductionSourceBatchLabelForStage(
      source.label || source.batchLabel || `Batch ${index + 1}`
    );
  }

  function getProductionCombinedSplitTitle(combinedItem = {}, sources = []) {
    const firstSource = Array.isArray(sources) && sources.length ? sources[0] : {};
    const sourceStageId = getProductionCombinedSourceStageId(combinedItem, firstSource);
    const sourceStageLabel = getStageLabel(sourceStageId || inferProductionStageIdFromHistory(combinedItem, combinedItem.stage || ""));

    return `Split during ${sourceStageLabel || "Stage"}`;
  }

  function getProductionCombinedBatchNestedItems(combinedItem = {}, source = {}, sourceIndex = 0, allHistoryItems = []) {
    const expectedLabel = getProductionCombinedSourceLabel(source, sourceIndex);
    const sourceStageId = getProductionCombinedSourceStageId(combinedItem, source);

    const exactStageItems = allHistoryItems.filter((historyItem) => {
      if (!historyItem || isProductionCombinedHistoryItem(historyItem)) return false;

      const batchLabel = getProductionHistoryBatchLabel(historyItem);
      if (!batchLabel || !areProductionNestedBatchLabelsSame(batchLabel, expectedLabel)) return false;

      const itemStageId = inferProductionStageIdFromHistory(historyItem, historyItem.stage || "");
      return sourceStageId ? itemStageId === sourceStageId : true;
    });

    const fallbackItems = exactStageItems.length ? exactStageItems : allHistoryItems.filter((historyItem) => {
      if (!historyItem || isProductionCombinedHistoryItem(historyItem)) return false;

      const batchLabel = getProductionHistoryBatchLabel(historyItem);
      return Boolean(batchLabel && areProductionNestedBatchLabelsSame(batchLabel, expectedLabel));
    });

    const seen = new Set();
    return sortProductionHistoryItems(fallbackItems).filter((historyItem) => {
      const key = [
        getProductionHistoryDisplayTitle(historyItem),
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

  function shouldHideProductionHistoryItemInsideCombinedBatches(item = {}, combinedItems = []) {
    if (!combinedItems.length || !item || isProductionCombinedHistoryItem(item)) return false;

    const itemBatchLabel = getProductionHistoryBatchLabel(item);
    if (!itemBatchLabel) return false;

    const itemStageId = inferProductionStageIdFromHistory(item, item.stage || "");

    return combinedItems.some((combinedItem) => {
      const sources = normalizeProductionHistorySourceBatchDetails(
        Array.isArray(combinedItem.sourceBatches) && combinedItem.sourceBatches.length
          ? combinedItem.sourceBatches
          : []
      );

      return sources.some((source, index) => {
        const expectedLabel = getProductionCombinedSourceLabel(source, index);
        if (!areProductionNestedBatchLabelsSame(itemBatchLabel, expectedLabel)) return false;

        const sourceStageId = getProductionCombinedSourceStageId(combinedItem, source);
        return sourceStageId ? itemStageId === sourceStageId : true;
      });
    });
  }

  function createProductionCompactNestedHistoryItemHTML(record, item = {}, starterDetailStageSet = new Set()) {
    const displayTitle = getProductionHistoryDisplayTitle(item);
    const itemStageId = isProductionStarterHistoryEvent(item)
      ? getProductionStarterStageId(item, record?.stage || defaultProductionStage)
      : inferProductionStageIdFromHistory(item, item.stage || record?.stage || defaultProductionStage);
    const shouldMoveStarterDetailsToCurrentStatus = isProductionStarterHistoryEvent(item)
      && starterDetailStageSet.has(itemStageId);
    const operators = shouldMoveStarterDetailsToCurrentStatus ? "" : getProductionHistoryOperators(item);
    const cleanDescription = cleanProductionHistoryDescription(item.description, item);
    const meters = shouldMoveStarterDetailsToCurrentStatus ? 0 : Number(item.meters || 0);
    const wasteMeters = Number(item.wasteMeters || 0);
    const metaDisplay = item.meta && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(item.meta).trim())
      ? formatProductionDateTimeForDisplay(item.meta)
      : String(item.meta || "").trim();
    const historyTags = [
      operators ? `<small class="operator-tag">Operator/s · ${escapeProductionHTML(operators)}</small>` : "",
      meters > 0 ? `<small class="meters-tag">Meters · ${escapeProductionHTML(formatProductionMeters(meters))}</small>` : "",
      wasteMeters > 0 ? `<small class="waste-tag">Waste · ${escapeProductionHTML(formatProductionMeters(wasteMeters))}</small>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="pr-combined-batch-nested-item">
        <strong>${escapeProductionHTML(displayTitle)}</strong>
        ${cleanDescription ? `<span>${escapeProductionHTML(cleanDescription)}</span>` : ""}
        ${historyTags ? `<div class="pr-history-tags">${historyTags}</div>` : ""}
        ${metaDisplay ? `<time>${escapeProductionHTML(metaDisplay)}</time>` : ""}
      </article>
    `;
  }

  function createProductionCombinedBatchNestedHistoryHTML(record, combinedItem = {}, allHistoryItems = [], starterDetailStageSet = new Set()) {
    const sources = normalizeProductionHistorySourceBatchDetails(
      Array.isArray(combinedItem.sourceBatches) && combinedItem.sourceBatches.length
        ? combinedItem.sourceBatches
        : (Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [])
    );

    if (sources.length < 2) return "";

    const batchSections = sources.map((source, index) => {
      const label = getProductionCombinedSourceLabel(source, index);
      const items = getProductionCombinedBatchNestedItems(combinedItem, source, index, allHistoryItems);
      const metersDisplay = String(source.metersDisplay || "").trim()
        || (Number(source.meters || 0) > 0 ? formatProductionMeters(source.meters) : "");

      if (!items.length) return "";

      return `
        <section class="pr-combined-batch-group">
          <header>
            <strong>${escapeProductionHTML(label)}</strong>
            ${metersDisplay ? `<span>${escapeProductionHTML(metersDisplay)}</span>` : ""}
          </header>
          <div class="pr-combined-batch-group-list">
            ${items.map((item) => createProductionCompactNestedHistoryItemHTML(record, item, starterDetailStageSet)).join("")}
          </div>
        </section>
      `;
    }).filter(Boolean).join("");

    if (!batchSections) return "";

    const cleanDescription = cleanProductionHistoryDescription(combinedItem.description, combinedItem);
    const combinedBatchDetails = sources
      .map((source) => formatProductionCombinedBatchLineDetail(source))
      .filter(Boolean);
    const combinedBatchLine = combinedBatchDetails.length
      ? `Combined · ${combinedBatchDetails.join(" + ")}`
      : "";
    const meters = Number(combinedItem.meters || 0);
    const metaDisplay = combinedItem.meta && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(combinedItem.meta).trim())
      ? formatProductionDateTimeForDisplay(combinedItem.meta)
      : String(combinedItem.meta || "").trim();
    const combinedTags = [
      combinedBatchLine ? `<small class="combined-tag">${escapeProductionHTML(combinedBatchLine)}</small>` : "",
      meters > 0 ? `<small class="meters-tag">Meters · ${escapeProductionHTML(formatProductionMeters(meters))}</small>` : ""
    ].filter(Boolean).join("");

    return `
      <div class="pr-combined-batch-history">
        ${batchSections}
        <article class="pr-combined-batch-final-item">
          <strong>Batches Combined</strong>
          ${cleanDescription ? `<span>${escapeProductionHTML(cleanDescription)}</span>` : ""}
          ${combinedTags ? `<div class="pr-history-tags">${combinedTags}</div>` : ""}
          ${metaDisplay ? `<time>${escapeProductionHTML(metaDisplay)}</time>` : ""}
        </article>
      </div>
    `;
  }

  function createProductionHistoryTimelineItemHTML(record, item = {}, starterDetailStageSet = new Set(), allHistoryItems = []) {
    const eventType = String(item.eventType || item.event_type || "").trim().toLowerCase();
    const displayTitle = getProductionHistoryDisplayTitle(item);
    const itemStageId = isProductionStarterHistoryEvent(item)
      ? getProductionStarterStageId(item, record?.stage || defaultProductionStage)
      : inferProductionStageIdFromHistory(item, item.stage || record?.stage || defaultProductionStage);
    const shouldMoveStarterDetailsToCurrentStatus = isProductionStarterHistoryEvent(item)
      && starterDetailStageSet.has(itemStageId);
    const operators = shouldMoveStarterDetailsToCurrentStatus ? "" : getProductionHistoryOperators(item);
    const cleanDescription = cleanProductionHistoryDescription(item.description, item);
    const meters = shouldMoveStarterDetailsToCurrentStatus ? 0 : Number(item.meters || 0);
    const wasteMeters = Number(item.wasteMeters || 0);
    const batchLabel = getProductionHistoryBatchLabel(item);
    const isCombinedHistory = isProductionCombinedHistoryItem(item);
    const combinedSourceBatches = normalizeProductionHistorySourceBatchDetails(
      Array.isArray(item.sourceBatches) && item.sourceBatches.length
        ? item.sourceBatches
        : (isCombinedHistory && Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : [])
    );
    const combinedBatchDetails = isCombinedHistory
      ? combinedSourceBatches
          .map((source) => formatProductionCombinedBatchLineDetail(source))
          .filter(Boolean)
      : [];
    const combinedBatchLine = combinedBatchDetails.length
      ? `Combined · ${combinedBatchDetails.join(" + ")}`
      : "";
    const batchHistoryClass = batchLabel ? " is-batch-history" : "";
    const metaDisplay = item.meta && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(item.meta).trim())
      ? formatProductionDateTimeForDisplay(item.meta)
      : String(item.meta || "").trim();
    const historyTags = [
      !isCombinedHistory && operators ? `<small class="operator-tag">Operator/s · ${escapeProductionHTML(operators)}</small>` : "",
      !isCombinedHistory && combinedBatchLine ? `<small class="combined-tag">${escapeProductionHTML(combinedBatchLine)}</small>` : "",
      !isCombinedHistory && meters > 0 ? `<small class="meters-tag">Meters · ${escapeProductionHTML(formatProductionMeters(meters))}</small>` : "",
      !isCombinedHistory && wasteMeters > 0 ? `<small class="waste-tag">Waste · ${escapeProductionHTML(formatProductionMeters(wasteMeters))}</small>` : "",
      !isCombinedHistory && batchLabel ? `<small class="batch-tag">${escapeProductionHTML(batchLabel)}</small>` : ""
    ].filter(Boolean).join("");
    const nestedBatchHistory = isCombinedHistory
      ? createProductionCombinedBatchNestedHistoryHTML(record, item, allHistoryItems, starterDetailStageSet)
      : "";
    const cardTitle = isCombinedHistory ? getProductionCombinedSplitTitle(item, combinedSourceBatches) : displayTitle;
    const cardDescription = isCombinedHistory ? "" : cleanDescription;
    const cardMetaDisplay = isCombinedHistory ? "" : metaDisplay;

    return `
      <article class="pr-history-item${isCombinedHistory ? " is-combined-history" : ""}${batchHistoryClass}">
        <i></i>
        <div class="pr-history-card">
          <div class="pr-history-title-row">
            <strong>${escapeProductionHTML(cardTitle)}</strong>
          </div>
          ${cardDescription ? `<span>${escapeProductionHTML(cardDescription)}</span>` : ""}
          ${historyTags ? `<div class="pr-history-tags">${historyTags}</div>` : ""}
          ${nestedBatchHistory}
          ${cardMetaDisplay ? `<time>${escapeProductionHTML(cardMetaDisplay)}</time>` : ""}
        </div>
      </article>
    `;
  }

  function createProductionHistoryHTML(record) {
    const rawHistoryItems = getProductionHistoryItems(record);
    if (!rawHistoryItems.length) return "";

    const combinedHistoryItems = rawHistoryItems.filter(isProductionCombinedHistoryItem);
    const historyItems = combinedHistoryItems.length
      ? rawHistoryItems.filter((item) => !shouldHideProductionHistoryItemInsideCombinedBatches(item, combinedHistoryItems))
      : rawHistoryItems;

    return `
      <div class="pr-production-history wide">
        <div class="pr-history-head">
          <div>
            <span>Production History</span>
            <small>Stage movement, operators, meters, and batch trace.</small>
          </div>
          <strong>${historyItems.length}</strong>
        </div>
        <div class="pr-history-list">
          ${(() => {
            const starterDetailStageSet = new Set(
              historyItems
                .filter((historyItem) => {
                  const title = getProductionHistoryDisplayTitle(historyItem).toLowerCase();
                  return (title.includes("on-going") || title.includes("ongoing"))
                    && (getProductionHistoryOperators(historyItem) || Number(historyItem?.meters || 0) > 0);
                })
                .map((historyItem) => inferProductionStageIdFromHistory(historyItem, historyItem.stage || ""))
                .filter(Boolean)
            );

            return historyItems
              .map((item) => createProductionHistoryTimelineItemHTML(record, item, starterDetailStageSet, rawHistoryItems))
              .join("");
          })()}
        </div>
      </div>
    `;
  }

  function getActiveStage() {
    return isProductionStatusView() ? null : productionStageMap[activeProductionStage];
  }

  function closeMobileSidebarAfterProductionClick() {
    if (window.innerWidth > 768) return;

    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    sidebar?.classList.remove('open');
    sidebarBackdrop?.classList.remove('show');
    document.body.classList.remove('mobile-menu-open');
    document.documentElement.classList.remove('mobile-menu-open');
  }

  function showProductionView() {
    if (typeof window.showView === 'function') {
      window.showView('production-receiving');
      return;
    }

    document.querySelectorAll('[data-view]').forEach((section) => {
      section.classList.toggle('active-view', section.dataset.view === 'production-receiving');
    });

    document.querySelectorAll('[data-view-target]').forEach((link) => {
      link.classList.toggle('active', link.dataset.viewTarget === 'production-receiving');
    });

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.dispatchEvent(new CustomEvent('system:reset-default-position'));
  }

  function updateProductionTopbarTitle() {
    if (!topbarTitle) return;
    topbarTitle.textContent = isProductionStatusView() ? 'Production Status' : getStageLabel(activeProductionStage);
  }

  function setProductionDropdownOpen(isOpen) {
    productionNavGroup?.classList.toggle('is-open', isOpen);
    productionNavParent?.setAttribute('aria-expanded', String(isOpen));
    productionSubNav?.setAttribute('aria-hidden', String(!isOpen));
  }

  function updateProductionNavigation({ openDropdown = false } = {}) {
    const isProductionViewActive = productionStageView.classList.contains('active-view');
    const isProductionStatusActive = isProductionViewActive && isProductionStatusView();
    const isProductionStageActive = isProductionViewActive && !isProductionStatusView();
    const shouldMarkProductionActive = isProductionStageActive || openDropdown;

    productionStatusNavLink?.classList.toggle('active', isProductionStatusActive);

    productionNavGroup?.classList.toggle('is-active', shouldMarkProductionActive);
    productionNavParent?.classList.toggle('active', shouldMarkProductionActive);

    if (openDropdown) {
      setProductionDropdownOpen(true);
    }

    productionStageLinks.forEach((link) => {
      const isActiveStageLink = isProductionStageActive && link.dataset.productionStageLink === activeProductionStage;
      link.classList.toggle('active', isActiveStageLink);
      link.setAttribute('aria-current', isActiveStageLink ? 'page' : 'false');
    });

    if (isProductionViewActive || openDropdown) updateProductionTopbarTitle();
  }

  function setActiveProductionStage(stageId, { resetStatus = true, revealView = true, openDropdown = false } = {}) {
    if (stageId !== 'all' && !productionStageMap[stageId]) return;

    activeProductionStage = stageId;
    if (stageId === 'all') {
      if (resetStatus || !statusDetails[activeProductionReceivingStatus]) {
        activeProductionReceivingStatus = 'pending';
      }
    } else if (resetStatus) {
      activeProductionReceivingStatus = getDefaultProductionTabStatus(stageId);
    }

    if (revealView) {
      showProductionView();
      scheduleProductionReceivingRefresh();
    }

    updateProductionNavigation({ openDropdown });
    updateProductionReceivingCounts();
    updateDateRangeSummary();
    renderProductionReceivingList();
  }

  function showProductionStatusView({ resetStatus = true, revealView = true, openDropdown = false } = {}) {
    setActiveProductionStage('all', { resetStatus, revealView, openDropdown });
  }

  function handleProductionParentClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    const isDropdownOpen = productionNavGroup?.classList.contains('is-open');
    const shouldOpenDropdown = !isDropdownOpen;
    const isCurrentProductionStageView = productionStageView.classList.contains('active-view') && !isProductionStatusView();

    if (!isCurrentProductionStageView) {
      setActiveProductionStage(defaultProductionStage, {
        resetStatus: true,
        revealView: true,
        openDropdown: true
      });
      return;
    }

    setProductionDropdownOpen(shouldOpenDropdown);
    updateProductionNavigation({ openDropdown: shouldOpenDropdown });
  }

  function updateProductionReceivingFolderState() {
    const board = productionStageView.querySelector('.pr-board');
    const visibleTabs = Array.from(tabButtons).filter((button) => !button.hidden);
    const activeIndex = visibleTabs.findIndex((button) => button.dataset.prTab === activeProductionReceivingStatus);

    if (!board || activeIndex < 0) return;

    board.classList.remove('active-tab-first', 'active-tab-middle', 'active-tab-last');

    if (visibleTabs.length <= 1 || activeIndex === 0) {
      board.classList.add('active-tab-first');
    } else if (activeIndex === visibleTabs.length - 1) {
      board.classList.add('active-tab-last');
    } else {
      board.classList.add('active-tab-middle');
    }
  }

  function updateDateRangeSummary() {
    const hasDateRange = Boolean(productionReceivingDateFrom || productionReceivingDateTo);
    dateRangeButton?.classList.toggle('has-active-date', hasDateRange);
  }

  function openDateRangeModal() {
    if (!dateModalBackdrop) return;

    if (dateFromInput) dateFromInput.value = productionReceivingDateFrom;
    if (dateToInput) dateToInput.value = productionReceivingDateTo;

    dateModalBackdrop.classList.add('show');
    dateModalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    dateFromInput?.focus();
  }

  function closeDateRangeModal() {
    if (!dateModalBackdrop) return;

    dateModalBackdrop.classList.remove('show');
    dateModalBackdrop.setAttribute('aria-hidden', 'true');

    if (!modalBackdrop?.classList.contains('show')) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function clearProductionReceivingDateRange({ keepModalOpen = false } = {}) {
    productionReceivingDateFrom = '';
    productionReceivingDateTo = '';

    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';

    updateDateRangeSummary();
    renderProductionReceivingList();

    if (!keepModalOpen) closeDateRangeModal();
  }

  function escapeProductionHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getProductionAuthToken() {
    return localStorage.getItem("dashboardAuthToken") || "";
  }

  async function requestProductionApi(url, options = {}) {
    const authToken = getProductionAuthToken();

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": getProductionNotificationUserId(),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
      throw new Error(data?.error || "Production data request failed.");
    }

    return data;
  }

  function formatProductionDateForDisplay(value) {
    if (!value) return "—";

    const [year, month, day] = String(value).split("-").map(Number);
    if (year && month && day) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      }).format(new Date(year, month - 1, day));
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(parsed);
  }

  function formatProductionDateTimeForDisplay(value) {
    if (!value) return "—";

    const rawValue = String(value).trim();
    const normalizedValue = rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T");
    const parsed = new Date(normalizedValue);

    if (Number.isNaN(parsed.getTime())) {
      return formatProductionDateForDisplay(rawValue);
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(parsed);
  }



  function getProductionHistoryDateTime(record, preferredValue = "") {
    const candidates = [
      preferredValue,
      record?.orderDate,
      record?.dateEntered,
      record?.updatedAtDisplay
    ];

    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (text && text !== "—") return text;
    }

    return "";
  }

  function getProductionTodayDateKey() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const map = {};
    parts.forEach((part) => {
      if (part.type !== "literal") map[part.type] = part.value;
    });

    return `${map.year}-${map.month}-${map.day}`;
  }

  function normalizeProductionDateKey(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";

    const isoMatch = rawValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) return "";

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  function dateKeyToUtcTime(dateKey) {
    const normalizedDateKey = normalizeProductionDateKey(dateKey);
    const [year, month, day] = normalizedDateKey.split("-").map(Number);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day);
  }

  function getProductionDeliveryAlert(record) {
    const deliveryDateKey = String(record?.deliveryDateValue || record?.deliveryDate || "").trim();
    const deliveryTime = dateKeyToUtcTime(deliveryDateKey);
    const todayTime = dateKeyToUtcTime(getProductionTodayDateKey());

    if (deliveryTime === null || todayTime === null) {
      return {
        type: "normal",
        label: "",
        cardClass: "",
        boxClass: "",
        pillClass: ""
      };
    }

    const dayDifference = Math.round((deliveryTime - todayTime) / 86400000);

    if (dayDifference < 0) {
      return {
        type: "overdue",
        label: "Overdue",
        cardClass: "pr-alert-due",
        boxClass: "pr-due-alert",
        pillClass: "due"
      };
    }

    if (dayDifference === 0) {
      return {
        type: "due-today",
        label: "Due today",
        cardClass: "pr-alert-due",
        boxClass: "pr-due-alert",
        pillClass: "due"
      };
    }

    if (dayDifference <= 5) {
      return {
        type: "critical",
        label: "Critical",
        cardClass: "pr-alert-critical",
        boxClass: "pr-critical-alert",
        pillClass: "critical"
      };
    }

    return {
      type: "normal",
      label: "",
      cardClass: "",
      boxClass: "",
      pillClass: ""
    };
  }

  function formatProductionQuantity(order) {
    const quantity = order?.quantity ?? "—";
    const unit = order?.unit || "";
    return `${quantity} ${unit}`.trim();
  }

  function mapOrderToProductionRecord(order) {
    const orderId = String(order?.id ?? "").trim();

    return {
      id: `order-${orderId}`,
      orderId,
      productionRecordId: "",
      sourceType: "orders-pending",
      stage: defaultProductionStage,
      status: "pending",
      poNumber: order?.poNumber || "—",
      joNumber: order?.joNumber || "—",
      client: order?.client || "—",
      item: order?.item || "—",
      quantity: formatProductionQuantity(order),
      unit: order?.unit || "",
      orderUnit: order?.unit || "",
      originalUnit: order?.unit || "",
      convertedMeters: "",
      deliveryDate: formatProductionDateForDisplay(order?.deliveryDate),
      deliveryDateValue: order?.deliveryDate || "",
      orderDate: formatProductionDateTimeForDisplay(order?.createdAt),
      updatedAtDisplay: formatProductionDateTimeForDisplay(order?.updatedAt || order?.createdAt),
      orderCreatedAtValue: order?.createdAt || "",
      orderUpdatedAtValue: order?.updatedAt || order?.createdAt || "",
      printingMaterial: order?.printingMaterial || "—",
      laminationMaterial: order?.laminationMaterial || "—",
      assignedTo: order?.assignTo || "Unassigned",
      orderAssignedTo: order?.assignTo || "Unassigned",
      originalAssignedTo: order?.assignTo || "Unassigned",
      assignToRole: normalizeProductionUserRole(order?.assignToRole || order?.assign_to_role || ""),
      dateEntered: formatProductionDateTimeForDisplay(order?.createdAt),
      remarks: "Pending order from Orders tab. Waiting to enter production.",
      holdReason: "",
      completedStages: ["Issue Order"],
      actionHistory: getProductionActionHistory({ orderId })
    };
  }

  function formatProductionMeters(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return "—";

    return `${numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} mts`;
  }

  function mapProductionApiRecord(record) {
    const productionId = String(record?.id ?? "").trim();
    const orderId = String(record?.orderId ?? "").trim();
    const storedRecord = getStoredProductionStageRecords()[orderId] || {};
    const storedCompletedStages = Array.isArray(storedRecord.completedStages) && storedRecord.completedStages.length
      ? storedRecord.completedStages
      : null;
    const apiCompletedStages = Array.isArray(record?.completedStages) && record.completedStages.length
      ? record.completedStages
      : ["Issue Order"];
    /*
      IMPORTANT:
      For real production records coming from the database, API status/stage must win.
      Older localStorage snapshots can still contain the order as pending. If localStorage
      wins here, Happy/Lockkey users can lose the item after Take Order because their
      own browser keeps showing the stale pending snapshot while Admin sees the DB record.
    */
    const apiStage = record?.stage || "";
    const apiStatus = record?.stageStatus || record?.status || "";
    const resolvedStage = apiStage || storedRecord.stage || defaultProductionStage;
    const resolvedStatus = apiStatus || storedRecord.status || "pending";
    const resolvedConvertedMeters = record?.convertedMeters || storedRecord.convertedMeters || "";
    const resolvedUpdatedAt = record?.updatedAt || storedRecord.productionUpdatedAtValue || "";
    const resolvedTakenAt = record?.takenAt || storedRecord.takenAtValue || "";
    const resolvedUpdatedDisplay = formatProductionDateTimeForDisplay(record?.updatedAt || record?.takenAt || record?.orderUpdatedAt)
      || storedRecord.updatedAtDisplay;
    const resolvedDateEntered = formatProductionDateTimeForDisplay(record?.takenAt) || storedRecord.dateEntered;
    const resolvedCompletedStages = sanitizeProductionCompletedStagesForRecord(
      storedCompletedStages || apiCompletedStages,
      resolvedStage,
      resolvedStatus
    );

    return {
      id: `production-${productionId}`,
      orderId,
      productionRecordId: productionId,
      sourceType: "production-stage",
      stage: resolvedStage,
      status: resolvedStatus,
      poNumber: record?.poNumber || "—",
      joNumber: record?.joNumber || "—",
      client: record?.client || "—",
      item: record?.item || "—",
      quantity: `${record?.quantity ?? "—"} ${record?.unit || ""}`.trim(),
      unit: record?.unit || storedRecord.unit || "",
      orderUnit: record?.unit || storedRecord.orderUnit || storedRecord.originalUnit || "",
      originalUnit: storedRecord.originalUnit || storedRecord.orderUnit || record?.unit || "",
      convertedMeters: resolvedConvertedMeters,
      convertedMetersDisplay: storedRecord.convertedMetersDisplay || formatProductionMeters(resolvedConvertedMeters || record?.convertedMeters),
      deliveryDate: formatProductionDateForDisplay(record?.deliveryDate),
      deliveryDateValue: record?.deliveryDate || "",
      orderDate: formatProductionDateTimeForDisplay(record?.orderCreatedAt),
      updatedAtDisplay: resolvedUpdatedDisplay,
      orderCreatedAtValue: record?.orderCreatedAt || "",
      orderUpdatedAtValue: record?.orderUpdatedAt || "",
      productionUpdatedAtValue: resolvedUpdatedAt,
      takenAtValue: resolvedTakenAt,
      printingMaterial: record?.printingMaterial || "—",
      laminationMaterial: record?.laminationMaterial || "—",
      assignedTo: storedRecord.assignedTo || record?.assignedTo || "Unassigned",
      orderAssignedTo: storedRecord.orderAssignedTo || record?.orderAssignedTo || record?.assignTo || record?.originalAssignedTo || "Unassigned",
      originalAssignedTo: storedRecord.originalAssignedTo || storedRecord.orderAssignedTo || record?.orderAssignedTo || record?.assignTo || "Unassigned",
      assignToRole: normalizeProductionUserRole(
        record?.assignToRole
          || record?.assign_to_role
          || record?.orderAssignToRole
          || record?.order_assign_to_role
          || record?.assignedUserRole
          || record?.assigned_user_role
          || storedRecord.assignToRole
          || storedRecord.assign_to_role
          || ""
      ),
      dateEntered: resolvedDateEntered,
      remarks: storedRecord.remarks || record?.remarks || "Order has been taken and moved to Printing.",
      holdReason: storedRecord.holdReason || record?.holdReason || "",
      completedStages: resolvedCompletedStages,
      actionHistory: getProductionActionHistory({ orderId, productionRecordId: productionId }),
      printingProducedMeters: storedRecord.printingProducedMeters || "",
      printingCompletedAt: storedRecord.printingCompletedAt || "",
      startingMeters: storedRecord.startingMeters || "",
      lastProducedMeters: storedRecord.lastProducedMeters || "",
      lastWasteMeters: storedRecord.lastWasteMeters || "",
      lastCompletedOperator: storedRecord.lastCompletedOperator || "",
      batchNumber: storedRecord.batchNumber || "",
      partialBatchNumber: storedRecord.partialBatchNumber || "",
      originalStageMeters: storedRecord.originalStageMeters || "",
      originalStageMetersDisplay: storedRecord.originalStageMetersDisplay || ""
    };
  }

  async function loadProductionReceivingRecords({ silent = false, forceRender = false } = {}) {
    let shouldRenderProductionList = true;

    if (!silent) {
      isProductionReceivingLoading = true;
      productionReceivingLoadError = "";
      renderProductionReceivingList();
    }

    try {
      const pendingQuery = new URLSearchParams({ status: "pending" });
      const deliveryQuery = new URLSearchParams({ status: "delivery" });
      const deliveredQuery = new URLSearchParams({ status: "delivered" });
      const [pendingData, productionData, historyData, deliveryData, deliveredData] = await Promise.all([
        requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}?${pendingQuery}`),
        requestProductionApi(`${PRODUCTION_API_BASE}/records`),
        requestProductionApi(`${PRODUCTION_API_BASE}/history`).catch(() => ({ history: [] })),
        requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}?${deliveryQuery}`).catch(() => ({ orders: [] })),
        requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}?${deliveredQuery}`).catch(() => ({ orders: [] }))
      ]);

      setProductionActionHistoryFromApi(Array.isArray(historyData?.history) ? historyData.history : []);

      const pendingOrders = Array.isArray(pendingData?.orders) ? pendingData.orders : [];
      const productionRecords = Array.isArray(productionData?.records) ? productionData.records : [];
      const deliveryOrderIds = new Set([
        ...(Array.isArray(deliveryData?.orders) ? deliveryData.orders : []),
        ...(Array.isArray(deliveredData?.orders) ? deliveredData.orders : [])
      ].map((order) => String(order?.id || "").trim()).filter(Boolean));
      const pendingProductionRecords = pendingOrders.map(mapOrderToProductionRecord);
      const activeProductionRecords = productionRecords
        .filter((record) => !["delivery", "delivered", "cancelled"].includes(String(record?.orderStatus || record?.order_status || "").trim().toLowerCase()))
        .map(mapProductionApiRecord);
      const orderAssignedToByOrderId = new Map();
      const orderAssignToRoleByOrderId = new Map();

      [...pendingProductionRecords, ...activeProductionRecords].forEach((record) => {
        const orderId = String(record?.orderId || "").trim();
        const assignedTo = getProductionAssignedToDisplay(record);
        const assignToRole = getProductionRecordAssignmentRole(record);

        if (orderId && assignedTo && assignedTo !== "Unassigned" && assignedTo !== "—") {
          orderAssignedToByOrderId.set(orderId, assignedTo);
        }

        if (orderId && assignToRole) {
          orderAssignToRoleByOrderId.set(orderId, assignToRole);
        }
      });

      const partialRecords = Object.values(getStoredProductionPartialRecords())
        .map((record) => {
          const orderId = String(record?.orderId || "").trim();
          const assignedToFromOrder = orderId ? orderAssignedToByOrderId.get(orderId) : "";
          const assignToRoleFromOrder = orderId ? orderAssignToRoleByOrderId.get(orderId) : "";

          return normalizeProductionPartialRecord({
            ...record,
            assignToRole: record?.assignToRole || record?.assign_to_role || assignToRoleFromOrder || "",
            orderAssignedTo: record?.orderAssignedTo || record?.originalAssignedTo || assignedToFromOrder || "Unassigned",
            originalAssignedTo: record?.originalAssignedTo || record?.orderAssignedTo || assignedToFromOrder || "Unassigned"
          });
        })
        .filter((record) => {
          if (!record || record.status === "completed" || !productionStageMap[record.stage]) return false;
          const orderId = String(record?.orderId || "").trim();
          return !orderId || !deliveryOrderIds.has(orderId);
        });

      const scopedProductionRecords = filterProductionRecordsByAssignmentScope([
        ...pendingProductionRecords,
        ...activeProductionRecords,
        ...partialRecords
      ]);

      const nextRecords = filterProductionRecordsByAssignmentScope(buildProductionPendingContainers(scopedProductionRecords));
      const nextSignature = createProductionRecordsSignature(nextRecords);

      if (silent && !forceRender && nextSignature === latestProductionRecordsSignature) {
        productionReceivingLoadError = "";
        shouldRenderProductionList = false;
        return;
      }

      productionReceivingRecords = nextRecords;
      latestProductionRecordsSignature = nextSignature;
      productionReceivingLoadError = "";
    } catch (error) {
      if (silent) {
        console.warn("Production live refresh failed:", error?.message || error);
        shouldRenderProductionList = false;
        return;
      }

      productionReceivingRecords = [];
      productionReceivingLoadError = error?.message || "Unable to load production data.";
    } finally {
      if (!silent) isProductionReceivingLoading = false;

      if (!shouldRenderProductionList) return;

      updateProductionReceivingCounts();

      if (silent) {
        preserveProductionListScroll(() => renderProductionReceivingList());
      } else {
        renderProductionReceivingList();
      }
    }
  }

  function isProductionAutoRefreshBlocked() {
    const blockingSelectors = [
      '.pr-modal-backdrop.show',
      '#productionTakeOrderModal.show',
      '#productionMoveStageModal.show',
      '#productionFinishingDeliveryModal.show',
      '#deliveryDetailsModal.show',
      '#productionReceivingDateModal.show'
    ];

    if (blockingSelectors.some((selector) => document.querySelector(selector))) return true;

    const activeElement = document.activeElement;
    if (!activeElement) return false;

    return Boolean(activeElement.closest?.('.production-receiving-view input, .production-receiving-view textarea, .production-receiving-view select'));
  }

  function scheduleProductionReceivingRefresh() {
    clearTimeout(productionReceivingRefreshTimer);
    productionReceivingRefreshTimer = setTimeout(() => {
      if (isProductionAutoRefreshBlocked()) return;
      loadProductionReceivingRecords({ silent: true });
    }, 250);
  }

  function getRecordFolderStatus(record, stageId = activeProductionStage, options = {}) {
    const useFinishingFolders = options.useFinishingFolders !== false;

    if (useFinishingFolders && stageId === 'finishing' && activeProductionStage === 'finishing' && !isProductionStatusView()) {
      return getFinishingFolderStatus(record);
    }

    return record?.status || 'pending';
  }

  function getStageRecords(stageId = activeProductionStage) {
    const validStatuses = ['pending', 'ongoing', 'hold'];

    if (stageId === 'all') {
      return productionReceivingRecords.filter((record) => {
        if (record.hiddenByContainerId || isProductionContainerSourceLocked(record)) return false;
        if (!productionStageMap[record.stage]) return false;
        if (!validStatuses.includes(record.status)) return false;

        return ["orders-pending", "production-stage", "production-partial"].includes(record.sourceType);
      });
    }

    return productionReceivingRecords.filter((record) => {
      if (record.hiddenByContainerId || isProductionContainerSourceLocked(record)) return false;
      if (!productionStageMap[record.stage]) return false;
      if (record.stage !== stageId) return false;
      if (!validStatuses.includes(record.status)) return false;

      if (record.sourceType === "orders-pending") {
        return stageId === defaultProductionStage && record.status === "pending";
      }

      return record.sourceType === "production-stage" || record.sourceType === "production-partial";
    });
  }

  function getRecordsByStatus(status) {
    return getStageRecords().filter((record) => getRecordFolderStatus(record) === status);
  }
  function cloneProductionUnifiedRecord(record) {
    if (!record) return null;

    const stageId = record.stage || defaultProductionStage;
    const folderStatus = getRecordFolderStatus(record, stageId);
    const actionHistory = Array.isArray(record.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);
    const sourceSummary = getProductionSourceBatchSummary(record) || record.sourceBatchSummary || "";
    const sourceDetailsText = getProductionSourceBatchDetailsText(record) || record.sourceBatchDetailsText || "";
    const batchLabel = getProductionDisplayBatchLabel(record);
    const overviewBatchLabel = getProductionBatchLabel(record);
    const sortTimestamp = getProductionRecordRecentTimestamp(record);

    return {
      ...record,
      id: record.id,
      unifiedRecordId: record.id,
      unifiedSortTimestamp: sortTimestamp,
      overviewSourceType: "unified-production-source",
      overviewStageLabel: getStageLabel(stageId),
      overviewStatusLabel: getProductionTabLabel(folderStatus),
      stage: stageId,
      status: folderStatus,
      batchLabel,
      displayBatchLabel: batchLabel,
      overviewBatchLabel,
      sourceBatchSummary: sourceSummary,
      sourceBatchDetailsText: sourceDetailsText,
      groupedSourceLabel: getProductionGroupedSourceLabel(record),
      actionHistory
    };
  }

  function getUnifiedProductionRecords({ stageId = "all", status = "all" } = {}) {
    const records = sortProductionRecordsRecentFirst(getStageRecords(stageId))
      .map(cloneProductionUnifiedRecord)
      .filter(Boolean);

    if (!status || status === "all") return records;
    return records.filter((record) => getRecordFolderStatus(record, record.stage) === status);
  }

  function getProductionStatusListRecords({ status = "all" } = {}) {
    const records = getUnifiedProductionRecords({ stageId: "all", status: "all" })
      .filter((record) => productionStageMap[record.stage] && ["pending", "ongoing", "hold"].includes(record.status));

    if (!status || status === "all") return sortProductionRecordsRecentFirst(records);
    return sortProductionRecordsRecentFirst(records.filter((record) => record.status === status));
  }

  function publishUnifiedProductionRecords() {
    const records = getUnifiedProductionRecords({ stageId: "all" });
    const productionStatusListRecords = getProductionStatusListRecords({ status: "all" });

    window.unifiedProductionRecords = records;
    window.productionUnifiedRecords = records;
    window.getUnifiedProductionRecords = (options = {}) => getUnifiedProductionRecords(options);

    /* Active Orders in Overview must mirror this exact Production Status source. */
    window.productionStatusListRecords = productionStatusListRecords;
    window.getProductionStatusListRecords = (options = {}) => getProductionStatusListRecords(options);

    /* Backward compatible names used by older Overview patches. */
    window.productionStatusOverviewRecords = productionStatusListRecords;
    window.getProductionStatusOverviewRecords = (options = {}) => getProductionStatusListRecords(options);

    document.dispatchEvent(new CustomEvent(UNIFIED_PRODUCTION_SOURCE_EVENT, {
      detail: { records: productionStatusListRecords }
    }));

    document.dispatchEvent(new CustomEvent('system:production-status-list-records-updated', {
      detail: { records: productionStatusListRecords }
    }));

    document.dispatchEvent(new CustomEvent('system:production-status-overview-records-updated', {
      detail: { records: productionStatusListRecords }
    }));
  }

  function getProductionStatusOverviewRecords() {
    return getProductionStatusListRecords({ status: "all" });
  }

  function publishProductionStatusOverviewRecords() {
    publishUnifiedProductionRecords();
  }


  function parseProductionSortTimestamp(value) {
    if (!value) return 0;

    const rawValue = String(value).trim();
    if (!rawValue || rawValue === "—") return 0;

    const normalizedValue = rawValue
      .replace(/\s+at\s+/i, " ")
      .replace(/^(Started|Updated|Created|Completed):\s*/i, "")
      .replace(/(AM|PM)$/i, (match) => match.toUpperCase());

    const isoLikeValue = normalizedValue.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/)
      ? normalizedValue.replace(" ", "T")
      : normalizedValue;

    const parsed = new Date(isoLikeValue).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getProductionLatestHistoryTimestamp(record) {
    const actionHistory = Array.isArray(record?.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);

    if (!Array.isArray(actionHistory) || !actionHistory.length) return 0;

    return actionHistory.reduce((latestTime, history) => {
      const historyTime = parseProductionSortTimestamp(history?.meta);
      return historyTime > latestTime ? historyTime : latestTime;
    }, 0);
  }

  function getProductionRecordRecentTimestamp(record) {
    const candidateValues = [
      getProductionLatestHistoryTimestamp(record),
      record?.productionUpdatedAtValue,
      record?.takenAtValue,
      record?.orderUpdatedAtValue,
      record?.orderCreatedAtValue,
      record?.updatedAtDisplay,
      record?.dateEntered,
      record?.orderDate
    ];

    for (const value of candidateValues) {
      const timestamp = typeof value === "number" ? value : parseProductionSortTimestamp(value);
      if (timestamp > 0) return timestamp;
    }

    const numericId = Number(String(record?.id || "").match(/\d+/g)?.pop() || 0);
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

  function getFilteredRecords() {
    const search = productionReceivingSearchText.trim().toLowerCase();
    const baseRecords = isProductionStatusView()
      ? getProductionStatusListRecords({ status: 'all' })
      : getRecordsByStatus(activeProductionReceivingStatus);

    const filteredRecords = baseRecords.filter((record) => {
      const matchesSearch = !search || [
        record.poNumber,
        record.joNumber,
        record.client,
        record.item,
        record.quantity,
        record.deliveryDate,
        getStageLabel(record.stage),
        getNextStageLabel(record.stage),
        record.assignedTo,
        record.sourceBatchSummary,
        record.sourceBatchDetailsText,
        getProductionSourceBatchSummary(record),
        getProductionSourceBatchDetailsText(record)
      ].some((value) => String(value).toLowerCase().includes(search));

      const recordDate = record.deliveryDateValue || '';
      const matchesDateFrom = !productionReceivingDateFrom || recordDate >= productionReceivingDateFrom;
      const matchesDateTo = !productionReceivingDateTo || recordDate <= productionReceivingDateTo;

      return matchesSearch && matchesDateFrom && matchesDateTo;
    });

    return sortProductionRecordsRecentFirst(filteredRecords);
  }


  function isManualStartPendingRecord(record) {
    if (
      !(record?.sourceType === "production-stage" || record?.sourceType === "production-partial") ||
      record?.status !== "pending"
    ) {
      return false;
    }

    return record?.stage !== defaultProductionStage || isProductionPartialRecord(record);
  }

  function getPreviousProductionStage(stageId) {
    const currentStageIndex = productionStages.findIndex((stage) => stage.id === stageId);
    return currentStageIndex > 0 ? productionStages[currentStageIndex - 1] : null;
  }

  function extractMetersFromText(value) {
    const text = String(value || "");
    const match = text.match(/([\d,]+(?:\.\d+)?)\s*(?:mts|meters?)/i);
    if (!match) return 0;

    const numericValue = Number(match[1].replaceAll(",", ""));
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function getStageCompletionHistory(record, stageLabel) {
    const wantedTitle = `${stageLabel} Completed`.toLowerCase();
    const actionHistory = Array.isArray(record?.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);

    return [...actionHistory].reverse().find((history) => {
      const title = String(history?.title || "").trim().toLowerCase();
      return title === wantedTitle;
    }) || null;
  }

  function getStageStartHistory(record) {
    const stageLabel = getStageLabel(record?.stage);
    const wantedTitle = `Start ${stageLabel}`.toLowerCase();
    const actionHistory = Array.isArray(record?.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);

    return [...actionHistory].reverse().find((history) => {
      const title = String(history?.title || "").trim().toLowerCase();
      return title === wantedTitle;
    }) || null;
  }

  function getEnteredMetersDetails(record) {
    const startHistory = getStageStartHistory(record);
    const startingMeters = Number(record?.startingMeters || 0);
    const historyMeters = extractMetersFromText(startHistory?.description);
    const convertedMeters = Number(record?.convertedMeters || 0);
    const meters = Number.isFinite(startingMeters) && startingMeters > 0
      ? startingMeters
      : Number.isFinite(historyMeters) && historyMeters > 0
        ? historyMeters
        : Number.isFinite(convertedMeters) && convertedMeters > 0
          ? convertedMeters
          : 0;

    return {
      meters,
      metersDisplay: meters > 0 ? formatProductionMeters(meters) : "—"
    };
  }

  function getStartedDateTimeDetails(record) {
    const startHistory = getStageStartHistory(record);
    const startedAt = startHistory?.meta || record?.dateEntered || record?.updatedAtDisplay || "—";

    return getProductionHistoryDateTime(record, startedAt);
  }

  function getPrintingOutputDetails(record) {
    const printingHistory = getStageCompletionHistory(record, "Printing");
    const storedMeters = Number(record?.printingProducedMeters || 0);
    const historyMeters = extractMetersFromText(printingHistory?.description);
    const meters = Number.isFinite(storedMeters) && storedMeters > 0 ? storedMeters : historyMeters;

    return {
      meters,
      metersDisplay: meters > 0 ? formatProductionMeters(meters) : "—",
      completedAt: record?.printingCompletedAt || printingHistory?.meta || "—"
    };
  }

  function getStageInputDetails(record) {
    if (isProductionPartialRecord(record)) {
      const partialMeters = Number(record?.convertedMeters || record?.balanceMeters || record?.partialBalanceMeters || 0);
      const safePartialMeters = Number.isFinite(partialMeters) && partialMeters > 0 ? partialMeters : 0;
      const partialSourceLabel = record?.partialSourceLabel || (record?.partialKind === "balance" ? "Balance" : getPreviousProductionStage(record?.stage)?.label || "Previous Stage");
      const partialWasteMeters = Number(record?.lastWasteMeters || 0);
      const partialOperator = String(record?.lastCompletedOperator || "").trim();

      return {
        previousStageId: record?.partialSourceStage || getPreviousProductionStage(record?.stage)?.id || "partial",
        previousStageLabel: partialSourceLabel,
        meters: safePartialMeters,
        metersDisplay: safePartialMeters > 0 ? formatProductionMeters(safePartialMeters) : "—",
        completedAt: record?.dateEntered || record?.updatedAtDisplay || "—",
        wasteMeters: Number.isFinite(partialWasteMeters) && partialWasteMeters > 0 ? partialWasteMeters : 0,
        wasteDisplay: Number.isFinite(partialWasteMeters) && partialWasteMeters > 0 ? formatProductionMeters(partialWasteMeters) : "—",
        operator: partialOperator
      };
    }

    const previousStage = getPreviousProductionStage(record?.stage);
    const previousStageLabel = previousStage ? previousStage.label : "Printing";
    const previousStageCompletion = getStageCompletionHistory(record, previousStageLabel);
    const printingOutput = previousStage?.id === "printing" ? getPrintingOutputDetails(record) : null;
    const lastProducedMeters = Number(record?.lastProducedMeters || 0);
    const convertedMeters = Number(record?.convertedMeters || 0);
    const historyMeters = extractMetersFromText(previousStageCompletion?.description);
    const meters = Number.isFinite(lastProducedMeters) && lastProducedMeters > 0
      ? lastProducedMeters
      : printingOutput && Number(printingOutput.meters || 0) > 0
        ? Number(printingOutput.meters)
        : Number.isFinite(historyMeters) && historyMeters > 0
          ? historyMeters
          : Number.isFinite(convertedMeters) && convertedMeters > 0
            ? convertedMeters
            : 0;

    const wasteMeters = Number(record?.lastWasteMeters || 0);
    const operator = String(record?.lastCompletedOperator || "").trim();

    return {
      previousStageId: previousStage?.id || "printing",
      previousStageLabel,
      meters,
      metersDisplay: meters > 0 ? formatProductionMeters(meters) : "—",
      completedAt: printingOutput?.completedAt || previousStageCompletion?.meta || record?.updatedAtDisplay || record?.dateEntered || "—",
      wasteMeters: Number.isFinite(wasteMeters) && wasteMeters > 0 ? wasteMeters : 0,
      wasteDisplay: Number.isFinite(wasteMeters) && wasteMeters > 0 ? formatProductionMeters(wasteMeters) : "—",
      operator
    };
  }


  function getOriginalOrderAssignedTo(record) {
    const possibleValues = [
      record?.orderAssignedTo,
      record?.originalAssignedTo,
      record?.addOrderAssignedTo,
      record?.initialAssignedTo
    ];

    for (const value of possibleValues) {
      const cleanValue = String(value || "").trim();
      if (cleanValue && cleanValue !== "Unassigned" && cleanValue !== "—") return cleanValue;
    }

    if (record?.sourceType === "orders-pending") {
      const cleanAssignedTo = String(record?.assignedTo || "").trim();
      if (cleanAssignedTo && cleanAssignedTo !== "Unassigned" && cleanAssignedTo !== "—") return cleanAssignedTo;
    }

    return "—";
  }

  function getProductionAssignedToDisplay(record) {
    const assignedTo = getOriginalOrderAssignedTo(record);
    return assignedTo && assignedTo !== "—" ? assignedTo : "Unassigned";
  }

  function getProductionOperatorDisplay(record) {
    const operator = String(record?.assignedTo || "").trim();
    if (!operator || operator === "Unassigned" || operator === "—") return "";

    if (record?.sourceType === "orders-pending") return "";

    return operator;
  }

  function getProductionOperatorInputValue(record) {
    const operator = getProductionOperatorDisplay(record);
    return operator || "";
  }

  function isPrintingPartialBalanceRecord(record) {
    return record?.stage === defaultProductionStage
      && record?.status === "pending"
      && isProductionPartialRecord(record)
      && record?.partialKind === "balance";
  }

  function getLatestPartialRunDetails(record) {
    const actionHistory = Array.isArray(record?.actionHistory)
      ? record.actionHistory
      : getProductionActionHistory(record);
    const latestRunHistory = [...actionHistory].reverse().find((history) => {
      const title = String(history?.title || "").toLowerCase();
      return title.includes("printing completed") || title.includes("start printing");
    });
    const historyOperatorMatch = String(latestRunHistory?.description || "").match(/Operator\/s:\s*([^.]*)/i);
    const historyOperator = historyOperatorMatch?.[1]?.trim() || "";

    const assignedTo = getOriginalOrderAssignedTo(record);

    const printingMaterial = String(
      record?.lastRunPrintingMaterial
      || record?.latestRunPrintingMaterial
      || record?.printingMaterial
      || "—"
    ).trim();

    const laminationMaterial = String(
      record?.lastRunLaminationMaterial
      || record?.latestRunLaminationMaterial
      || record?.laminationMaterial
      || "—"
    ).trim();

    return {
      assignedTo: assignedTo || "—",
      printingMaterial: printingMaterial || "—",
      laminationMaterial: laminationMaterial || "—"
    };
  }

  function shouldHideStageWasteOperatorDetails(record) {
    const stageId = String(record?.stage || '').toLowerCase();
    return stageId === 'lamination' || stageId === 'slitting';
  }

  function shouldHideStageOperatorDetails(record) {
    const stageId = String(record?.stage || '').toLowerCase();
    const folderStatus = getRecordFolderStatus(record);

    return stageId === 'lamination'
      || stageId === 'slitting'
      || (stageId === 'rewinding' && folderStatus === 'pending');
  }

  function createStageRecordGrid(record) {
    if (isManualStartPendingRecord(record)) {
      const stageInput = getStageInputDetails(record);
      const isBalanceRecord = isProductionPartialRecord(record) && record.partialKind === "balance";
      const metersLabel = isBalanceRecord ? "Balance Meters" : "Meters";
      const balanceBadge = isBalanceRecord ? '<em class="pr-balance-badge">Balance</em>' : '';
      const assignedToDisplay = getProductionAssignedToDisplay(record);

      return `
        <div class="pr-record-grid pr-stage-input-grid">
          <div class="pr-field">
            <span>PO Number</span>
            <strong>${escapeProductionHTML(record.poNumber)}</strong>
          </div>
          <div class="pr-field">
            <span>JO Number</span>
            <strong>${escapeProductionHTML(record.joNumber)}</strong>
          </div>
          <div class="pr-field">
            <span>Client</span>
            <strong>${escapeProductionHTML(record.client)}</strong>
          </div>
          <div class="pr-field">
            <span>Assigned To</span>
            <strong>${escapeProductionHTML(assignedToDisplay)}</strong>
          </div>
          <div class="pr-field">
            <span>${escapeProductionHTML(metersLabel)}</span>
            <strong>${escapeProductionHTML(stageInput.metersDisplay)} ${balanceBadge}</strong>
          </div>
          ${record.holdReason ? `
            <div class="pr-field wide">
              <span>Hold Reason</span>
              <strong>${escapeProductionHTML(record.holdReason)}</strong>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (record?.status === "ongoing") {
      const enteredMeters = getEnteredMetersDetails(record);

      return `
        <div class="pr-record-grid pr-ongoing-record-grid">
          <div class="pr-field">
            <span>PO Number</span>
            <strong>${escapeProductionHTML(record.poNumber)}</strong>
          </div>
          <div class="pr-field">
            <span>JO Number</span>
            <strong>${escapeProductionHTML(record.joNumber)}</strong>
          </div>
          <div class="pr-field">
            <span>Client</span>
            <strong>${escapeProductionHTML(record.client)}</strong>
          </div>
          <div class="pr-field">
            <span>Assigned To</span>
            <strong>${escapeProductionHTML(getProductionAssignedToDisplay(record))}</strong>
          </div>
          <div class="pr-field">
            <span>Entered Meters</span>
            <strong>${escapeProductionHTML(enteredMeters.metersDisplay)}</strong>
          </div>
        </div>
      `;
    }

    return `
      <div class="pr-record-grid">
        <div class="pr-field">
          <span>PO Number</span>
          <strong>${escapeProductionHTML(record.poNumber)}</strong>
        </div>
        <div class="pr-field">
          <span>JO Number</span>
          <strong>${escapeProductionHTML(record.joNumber)}</strong>
        </div>
        <div class="pr-field">
          <span>Client</span>
          <strong>${escapeProductionHTML(record.client)}</strong>
        </div>
        <div class="pr-field">
          <span>Assigned To</span>
          <strong>${escapeProductionHTML(getProductionAssignedToDisplay(record))}</strong>
        </div>
        <div class="pr-field">
          <span>${record.sourceType === "production-stage" ? "Meters" : "Quantity"}</span>
          <strong>${escapeProductionHTML(record.sourceType === "production-stage" ? (record.convertedMetersDisplay || formatProductionMeters(record.convertedMeters)) : record.quantity)}</strong>
        </div>
        ${record.holdReason ? `
          <div class="pr-field wide">
            <span>Hold Reason</span>
            <strong>${escapeProductionHTML(record.holdReason)}</strong>
          </div>
        ` : ''}
      </div>
    `;
  }

  function createProductionDetailsFields(record, modalDeliveryAlert, modalDeliveryAlertClass) {
    const statusField = `
      <div class="pr-modal-field">
        <span>Status</span>
        <strong>${createProductionStatusPill(record)}</strong>
      </div>
    `;
    const identityFields = `
      <div class="pr-modal-field">
        <span>PO Number</span>
        <strong>${escapeProductionHTML(record.poNumber)}</strong>
      </div>
      <div class="pr-modal-field">
        <span>JO Number</span>
        <strong>${escapeProductionHTML(record.joNumber)}</strong>
      </div>
      <div class="pr-modal-field">
        <span>Client</span>
        <strong>${escapeProductionHTML(record.client)}</strong>
      </div>
      <div class="pr-modal-field wide">
        <span>Item</span>
        <strong>${escapeProductionHTML(record.item)}</strong>
      </div>
      <div class="pr-modal-field">
        <span>Assigned To</span>
        <strong>${escapeProductionHTML(getProductionAssignedToDisplay(record))}</strong>
      </div>
    `;
    const deliveryDateField = `
      <div class="pr-modal-field pr-modal-delivery-date${modalDeliveryAlertClass}" data-pr-alert="${escapeProductionHTML(modalDeliveryAlert.type)}">
        <span>Delivery Date</span>
        <strong>
          <b>${escapeProductionHTML(record.deliveryDate)}</b>
          ${modalDeliveryAlert.label ? `<em class="pr-delivery-alert-pill ${modalDeliveryAlert.pillClass}">${escapeProductionHTML(modalDeliveryAlert.label)}</em>` : ''}
        </strong>
      </div>
    `;
    const materialRow = (printingMaterial = record.printingMaterial, laminationMaterial = record.laminationMaterial) => `
      <div class="pr-modal-material-row">
        <div class="pr-modal-field">
          <span>Printing Material</span>
          <strong>${escapeProductionHTML(printingMaterial || "—")}</strong>
        </div>
        <div class="pr-modal-field">
          <span>Lamination Material</span>
          <strong>${escapeProductionHTML(laminationMaterial || "—")}</strong>
        </div>
      </div>
    `;
    const holdReasonField = record.holdReason ? `
      <div class="pr-modal-field wide">
        <span>Hold Reason</span>
        <strong>${escapeProductionHTML(record.holdReason)}</strong>
      </div>
    ` : '';
    const remarksField = record.remarks ? `
      <div class="pr-modal-field wide">
        <span>Remarks</span>
        <strong>${escapeProductionHTML(record.remarks)}</strong>
      </div>
    ` : '';

    if (isManualStartPendingRecord(record)) {
      const stageInput = getStageInputDetails(record);
      const isBalanceRecord = isProductionPartialRecord(record) && record.partialKind === "balance";
      const isPrintingBalanceRecord = isPrintingPartialBalanceRecord(record);
      const latestPartialRunDetails = isPrintingBalanceRecord ? getLatestPartialRunDetails(record) : null;
      const metersLabel = isBalanceRecord ? "Balance Meters" : "Meters";
      const balanceBadge = isBalanceRecord ? '<em class="pr-balance-badge">Balance</em>' : '';
      const batchLabel = getProductionDisplayBatchLabel(record);
      const batchField = batchLabel ? `
        <div class="pr-modal-field">
          <span>Batch</span>
          <strong><em class="pr-batch-badge">${escapeProductionHTML(batchLabel)}</em></strong>
        </div>
      ` : '';
      const originalMetersField = shouldShowProductionOriginalMeters(record) ? `
        <div class="pr-modal-field">
          <span>Original Meters</span>
          <strong>${escapeProductionHTML(getProductionOriginalStageMetersDisplay(record))}</strong>
        </div>
      ` : '';
      const sourceBatchesField = shouldShowProductionPendingSourceBatches(record) ? `
        <div class="pr-modal-field wide pr-source-batches-field">
          <span>Source Batches</span>
          <strong>${escapeProductionHTML(getProductionSourceBatchDetailsText(record))}</strong>
        </div>
      ` : '';
      const previousCompletedAtField = !isPrintingBalanceRecord ? `
        <div class="pr-modal-field">
          <span>${escapeProductionHTML(stageInput.previousStageLabel)} Completed At</span>
          <strong>${escapeProductionHTML(stageInput.completedAt)}</strong>
        </div>
      ` : '';
      const printingMaterial = latestPartialRunDetails?.printingMaterial || record.printingMaterial;
      const laminationMaterial = latestPartialRunDetails?.laminationMaterial || record.laminationMaterial;

      return `
        ${statusField}
        ${identityFields}
        <div class="pr-modal-field">
          <span>${escapeProductionHTML(metersLabel)}</span>
          <strong>${escapeProductionHTML(stageInput.metersDisplay)} ${balanceBadge}</strong>
        </div>
        ${originalMetersField}
        ${batchField}
        ${sourceBatchesField}
        ${deliveryDateField}
        ${previousCompletedAtField}
        ${materialRow(printingMaterial, laminationMaterial)}
        ${holdReasonField}
        ${remarksField}
      `;
    }

    if (record?.status === "ongoing") {
      const enteredMeters = getEnteredMetersDetails(record);
      const startedAt = getStartedDateTimeDetails(record);
      const stageInput = getStageInputDetails(record);
      const hideWasteOperator = shouldHideStageWasteOperatorDetails(record);
      const hideOperator = shouldHideStageOperatorDetails(record);
      const batchLabel = getProductionDisplayBatchLabel(record);
      const batchField = batchLabel ? `
        <div class="pr-modal-field">
          <span>Batch</span>
          <strong><em class="pr-batch-badge">${escapeProductionHTML(batchLabel)}</em></strong>
        </div>
      ` : '';
      const originalMetersField = shouldShowProductionOriginalMeters(record) ? `
        <div class="pr-modal-field">
          <span>Original Meters</span>
          <strong>${escapeProductionHTML(getProductionOriginalStageMetersDisplay(record))}</strong>
        </div>
      ` : '';
      const operatorDisplay = getProductionOperatorDisplay(record);
      const operatorField = !hideOperator && operatorDisplay ? `
        <div class="pr-modal-field">
          <span>Operator/s</span>
          <strong>${escapeProductionHTML(operatorDisplay)}</strong>
        </div>
      ` : '';
      const wasteField = !hideWasteOperator && stageInput.wasteMeters > 0 ? `
        <div class="pr-modal-field">
          <span>Waste</span>
          <strong>${escapeProductionHTML(stageInput.wasteDisplay)}</strong>
        </div>
      ` : '';

      return `
        ${statusField}
        ${identityFields}
        <div class="pr-modal-field">
          <span>Entered Meters</span>
          <strong>${escapeProductionHTML(enteredMeters.metersDisplay)}</strong>
        </div>
        ${originalMetersField}
        ${batchField}
        <div class="pr-modal-field">
          <span>Started At</span>
          <strong>${escapeProductionHTML(startedAt)}</strong>
        </div>
        ${deliveryDateField}
        ${materialRow()}
        ${operatorField}
        ${wasteField}
        ${holdReasonField}
        ${remarksField}
      `;
    }

    const fallbackBatchLabel = getProductionDisplayBatchLabel(record);
    const fallbackBatchField = fallbackBatchLabel ? `
      <div class="pr-modal-field">
        <span>Batch</span>
        <strong><em class="pr-batch-badge">${escapeProductionHTML(fallbackBatchLabel)}</em></strong>
      </div>
    ` : '';
    const quantityOrMetersField = record.sourceType === "production-stage" ? `
      <div class="pr-modal-field">
        <span>Meters</span>
        <strong>${escapeProductionHTML(record.convertedMetersDisplay || formatProductionMeters(record.convertedMeters))}</strong>
      </div>
    ` : `
      <div class="pr-modal-field">
        <span>Quantity</span>
        <strong>${escapeProductionHTML(record.quantity)}</strong>
      </div>
    `;
    const orderDateField = record.orderDate ? `
      <div class="pr-modal-field">
        <span>Order Date</span>
        <strong>${escapeProductionHTML(record.orderDate)}</strong>
      </div>
    ` : '';

    return `
      ${statusField}
      ${identityFields}
      ${quantityOrMetersField}
      ${fallbackBatchField}
      ${deliveryDateField}
      ${orderDateField}
      ${materialRow()}
      ${holdReasonField}
      ${remarksField}
    `;
  }

  function updateProductionReceivingCounts() {
    ensureProductionTabStructure();

    const stageRecords = getStageRecords();
    const productionStatusRecords = getStageRecords('all');
    const isStatusView = isProductionStatusView();
    const visibleProductionStatusRecords = isStatusView
      ? getProductionStatusListRecords({ status: 'all' })
      : stageRecords;
    const visibleProductionStatusUnreadCount = isStatusView
      ? countProductionStatusUnreadRecords(visibleProductionStatusRecords, 'all')
      : 0;

    const activeTabStatuses = Array.from(tabButtons)
      .filter((button) => !button.hidden && !button.classList.contains('pr-folder-tab-unused'))
      .map((button) => button.dataset.prTab)
      .filter(Boolean);

    const counts = isStatusView
      ? {
          pending: 0,
          ongoing: visibleProductionStatusRecords.length,
          hold: 0
        }
      : activeTabStatuses.reduce((map, status) => {
          map[status] = stageRecords.filter((record) => getRecordFolderStatus(record) === status).length;
          return map;
        }, {});

    const unreadCounts = isStatusView
      ? {
          pending: 0,
          ongoing: visibleProductionStatusUnreadCount,
          hold: 0
        }
      : activeTabStatuses.reduce((map, status) => {
          map[status] = countProductionStatusUnreadRecords(
            stageRecords.filter((record) => getRecordFolderStatus(record) === status),
            activeProductionStage
          );
          return map;
        }, {});

    const productionStagesUnreadCount = productionStages.reduce((total, stage) => {
      const records = getStageRecords(stage.id);
      return total + countProductionStatusUnreadRecords(records, stage.id);
    }, 0);
    const productionStatusUnreadCount = countProductionStatusUnreadRecords(productionStatusRecords, 'all');

    setProductionNotificationBadge(productionStatusSidebarNotificationBadge, productionStatusUnreadCount);
    setProductionNotificationBadge(productionSidebarNotificationBadge, productionStagesUnreadCount);

    Object.entries(counts).forEach(([status, count]) => {
      const tabButton = productionStageView.querySelector(`[data-pr-tab="${status}"]`);
      setProductionTabCounter(tabButton, count);
    });

    Object.entries(unreadCounts).forEach(([status, count]) => {
      const tabButton = productionStageView.querySelector(`[data-pr-tab="${status}"]`);
      setProductionTabNotification(tabButton, count);
    });

    productionStageCountBadges.forEach((badge) => {
      const stageId = badge.dataset.productionStageCount;
      const stageRecordsForBadge = getStageRecords(stageId);
      const stageItemCount = stageRecordsForBadge.length;
      const stageUnreadCount = countProductionStatusUnreadRecords(stageRecordsForBadge, stageId);
      const stageLink = badge.closest('[data-production-stage-link]');

      let unreadBadge = stageLink?.querySelector('[data-production-stage-notification]');
      if (stageLink && !unreadBadge) {
        unreadBadge = document.createElement('span');
        unreadBadge.className = 'production-sub-unread';
        unreadBadge.setAttribute('data-production-stage-notification', 'true');
        unreadBadge.hidden = true;
        stageLink.appendChild(unreadBadge);
      }

      badge.textContent = stageItemCount > 99 ? '99+' : String(stageItemCount);
      badge.hidden = false;
      badge.dataset.itemCount = String(stageItemCount);
      badge.dataset.notificationCount = String(stageUnreadCount);
      badge.classList.remove('has-notification', 'notification-nav-badge');

      if (unreadBadge) {
        unreadBadge.textContent = stageUnreadCount > 99 ? '99+' : String(stageUnreadCount);
        unreadBadge.hidden = stageUnreadCount <= 0;
      }

      stageLink?.classList.toggle('has-notification', stageUnreadCount > 0);
    });

    publishProductionStatusOverviewRecords();
  }

  function getActionButtons(record) {
    const currentStageLabel = getStageLabel(record.stage);
    const canUpdateProduction = productionCurrentUserCanUpdateProduction();

    if (isProductionStatusView() || !canUpdateProduction) {
      return `
        <button class="pr-action-btn" type="button" data-pr-details="${escapeProductionHTML(record.id)}">View Details</button>
      `;
    }

    if (record.sourceType === "orders-pending") {
      return `
        <button class="pr-action-btn" type="button" data-pr-details="${escapeProductionHTML(record.id)}">View Details</button>
        <button class="pr-action-btn primary take-order" type="button" data-pr-take="${escapeProductionHTML(record.id)}">Take Order</button>
      `;
    }

    if (isFinishingReadyForDeliveryRecord(record)) {
      return `
        <button class="pr-action-btn" type="button" data-pr-details="${escapeProductionHTML(record.id)}">View Details</button>
        <button class="pr-action-btn success" type="button" data-pr-delivery="${escapeProductionHTML(record.id)}">Move to Delivery</button>
      `;
    }

    if (record.status === 'pending') {
      return `
        <button class="pr-action-btn" type="button" data-pr-details="${escapeProductionHTML(record.id)}">View Details</button>
        <button class="pr-action-btn primary" type="button" data-pr-start="${escapeProductionHTML(record.id)}">Start ${currentStageLabel}</button>
      `;
    }

    if (record.status === 'ongoing') {
      return `
        <button class="pr-action-btn" type="button" data-pr-details="${escapeProductionHTML(record.id)}">View Details</button>
        <button class="pr-action-btn warning" type="button" data-pr-hold="${escapeProductionHTML(record.id)}">Hold ${escapeProductionHTML(currentStageLabel)}</button>
        <button class="pr-action-btn success" type="button" data-pr-move="${escapeProductionHTML(record.id)}">Finish ${escapeProductionHTML(currentStageLabel)}</button>
      `;
    }

    return `
      <button class="pr-action-btn" type="button" data-pr-details="${escapeProductionHTML(record.id)}">View Details</button>
      <button class="pr-action-btn success" type="button" data-pr-resume="${escapeProductionHTML(record.id)}">Resume ${currentStageLabel}</button>
    `;
  }

  function createRecordCard(record) {
    const deliveryAlert = getProductionDeliveryAlert(record);
    const alertCardClass = deliveryAlert.cardClass ? ` ${deliveryAlert.cardClass}` : "";
    const alertBoxClass = deliveryAlert.boxClass ? ` ${deliveryAlert.boxClass}` : "";

    const hasUnreadNotification = isProductionStatusUnreadRecord(record);
    const unreadCardClass = hasUnreadNotification ? ' pr-has-unread' : '';
    const newBadge = hasUnreadNotification ? '<span class="notification-card-badge new">NEW</span>' : '';
    const statusCardClass = isProductionStatusView() ? ' pr-production-status-card' : '';
    const statusCardDetailsAttribute = isProductionStatusView()
      ? ` data-pr-card-details="${escapeProductionHTML(record.id)}" role="button" tabindex="0" aria-label="View details for ${escapeProductionHTML(record.item)}"`
      : '';

    const cardBatchLabel = getProductionDisplayBatchLabel(record);
    const cardBatchBadge = cardBatchLabel ? `
      <div class="pr-record-title-meta">
        <span class="pr-card-batch-badge">${escapeProductionHTML(cardBatchLabel)}</span>
      </div>
    ` : '';
    const sourceBatchMeta = '';

    const productionStatusGrid = `
      <div class="pr-record-grid pr-production-status-grid">
        <div class="pr-field pr-current-status-field">
          <span>Status</span>
          <strong>${createProductionStatusPill(record)}</strong>
        </div>
        <div class="pr-field">
          <span>PO Number</span>
          <strong>${escapeProductionHTML(record.poNumber)}</strong>
        </div>
        <div class="pr-field">
          <span>JO Number</span>
          <strong>${escapeProductionHTML(record.joNumber)}</strong>
        </div>
      </div>
    `;

    const stageGrid = createStageRecordGrid(record);

    return `
      <article class="pr-record-card${statusCardClass}${alertCardClass}${unreadCardClass}" data-pr-record-id="${escapeProductionHTML(record.id)}" data-pr-alert="${escapeProductionHTML(deliveryAlert.type)}"${statusCardDetailsAttribute}>
        <div class="pr-record-top">
          <div class="pr-record-title">
            <div class="pr-record-title-line">
              <strong>${escapeProductionHTML(record.item)}</strong>
              ${newBadge}
            </div>
            ${cardBatchBadge}
            ${sourceBatchMeta}
          </div>

          <div class="pr-due-date${alertBoxClass}">
            <span>Delivery Date</span>
            <strong>${escapeProductionHTML(record.deliveryDate)}</strong>
            ${deliveryAlert.label ? `<em class="pr-delivery-alert-pill ${deliveryAlert.pillClass}">${escapeProductionHTML(deliveryAlert.label)}</em>` : ''}
          </div>
        </div>

        ${isProductionStatusView() ? productionStatusGrid : stageGrid}

        ${isProductionStatusView() ? '' : `
          <div class="pr-card-actions">
            ${getActionButtons(record)}
          </div>
        `}
      </article>
    `;
  }

  function renderProductionReceivingList() {
    if (!listContainer) return;

    syncProductionStatusViewMode();

    const filteredRecords = getFilteredRecords();
    const details = isProductionStatusView()
      ? {
          emptyTitle: 'No active production items',
          emptyText: 'Pending, ongoing, and on-hold production items will appear here.'
        }
      : getProductionFolderDetails(activeProductionReceivingStatus);
    tabButtons.forEach((button) => {
      const isActive = !button.hidden && button.dataset.prTab === activeProductionReceivingStatus;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    updateProductionReceivingFolderState();
    updateProductionNavigation();

    if (isProductionReceivingLoading) {
      listContainer.innerHTML = `
        <div class="pr-empty-state">
          <div>
            <strong>Loading production data...</strong>
            <span>Fetching the latest orders and production records.</span>
          </div>
        </div>
      `;
      return;
    }

    if (productionReceivingLoadError) {
      listContainer.innerHTML = `
        <div class="pr-empty-state">
          <div>
            <strong>Production data could not be loaded.</strong>
            <span>${escapeProductionHTML(productionReceivingLoadError)}</span>
          </div>
        </div>
      `;
      return;
    }

    if (!filteredRecords.length) {
      listContainer.innerHTML = `
        <div class="pr-empty-state">
          <div>
            <strong>${escapeProductionHTML(details?.emptyTitle || 'No items found')}</strong>
            <span>${escapeProductionHTML(details?.emptyText || 'Items will appear here once available.')}</span>
          </div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filteredRecords.map(createRecordCard).join('');
  }

  function formatProductionNow() {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date());
  }

  function findRecord(recordId) {
    return productionReceivingRecords.find((record) => String(record.id) === String(recordId));
  }

  function getMaterialInputValue(value) {
    const text = String(value || "").trim();
    return text === "—" ? "" : text;
  }

  function getTakeOrderModal() {
    let takeModal = document.getElementById('productionTakeOrderModal');
    if (takeModal) return takeModal;

    takeModal = document.createElement('div');
    takeModal.className = 'pr-modal-backdrop pr-take-order-modal-backdrop';
    takeModal.id = 'productionTakeOrderModal';
    takeModal.setAttribute('aria-hidden', 'true');
    takeModal.innerHTML = `
      <section class="pr-modal pr-take-order-modal" role="dialog" aria-modal="true" aria-labelledby="productionTakeOrderModalTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="productionTakeOrderModalTitle">Take Order</h3>
          </div>

          <button class="pr-modal-close pr-take-order-close" type="button" aria-label="Close take order modal">
            <span>×</span>
          </button>
        </header>

        <div class="pr-modal-body" id="productionTakeOrderModalBody"></div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary pr-take-order-cancel" type="button">Cancel</button>
          <button class="pr-action-btn primary" id="productionTakeOrderSubmit" type="button">Take Order</button>
        </footer>
      </section>
    `;

    document.body.appendChild(takeModal);

    takeModal.querySelector('.pr-take-order-close')?.addEventListener('click', closeTakeOrderModal);
    takeModal.querySelector('.pr-take-order-cancel')?.addEventListener('click', closeTakeOrderModal);
    takeModal.querySelector('#productionTakeOrderSubmit')?.addEventListener('click', submitTakeOrderModal);

    return takeModal;
  }

  function openTakeOrderModal(recordId) {
    const record = findRecord(recordId);
    const takeModal = getTakeOrderModal();
    const modalBody = takeModal.querySelector('#productionTakeOrderModalBody');
    const submitButton = takeModal.querySelector('#productionTakeOrderSubmit');

    if (!record || !modalBody || !submitButton) return;

    takeModal.dataset.takeRecordId = record.id;
    submitButton.disabled = false;
    submitButton.textContent = 'Take Order';

    modalBody.innerHTML = `
      <div class="pr-take-order-summary">
        <strong>${escapeProductionHTML(record.item)}</strong>
        <span>${escapeProductionHTML(record.poNumber)} • ${escapeProductionHTML(record.joNumber)} • ${escapeProductionHTML(record.client)}</span>
      </div>

      <div class="pr-take-order-form">
        <label class="pr-form-field pr-form-field-required">
          <span>Converted to meters</span>
          <input id="productionTakeOrderMeters" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter meters" autocomplete="off">
        </label>

        <label class="pr-form-field pr-form-field-full">
          <span>Operator/s</span>
          <input id="productionTakeOrderOperators" type="text" value="${escapeProductionHTML(getProductionOperatorInputValue(record))}" placeholder="Enter operator/s">
        </label>

        <label class="pr-form-field">
          <span>Printing Material</span>
          <input id="productionTakeOrderPrintingMaterial" type="text" value="${escapeProductionHTML(getMaterialInputValue(record.printingMaterial))}" placeholder="Printing material">
        </label>

        <label class="pr-form-field">
          <span>Lamination Material</span>
          <input id="productionTakeOrderLaminationMaterial" type="text" value="${escapeProductionHTML(getMaterialInputValue(record.laminationMaterial))}" placeholder="Lamination material">
        </label>
      </div>

      <div class="pr-form-feedback" id="productionTakeOrderFeedback" hidden></div>
    `;

    takeModal.classList.add('show');
    takeModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    setTimeout(() => takeModal.querySelector('#productionTakeOrderMeters')?.focus(), 0);
  }

  function closeTakeOrderModal() {
    const takeModal = document.getElementById('productionTakeOrderModal');
    if (!takeModal) return;

    takeModal.classList.remove('show');
    takeModal.setAttribute('aria-hidden', 'true');
    takeModal.dataset.takeRecordId = '';

    if (!modalBackdrop?.classList.contains('show') && !dateModalBackdrop?.classList.contains('show')) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function setTakeOrderFeedback(message) {
    const feedback = document.getElementById('productionTakeOrderFeedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  async function submitTakeOrderModal() {
    const takeModal = document.getElementById('productionTakeOrderModal');
    const submitButton = document.getElementById('productionTakeOrderSubmit');
    const recordId = takeModal?.dataset.takeRecordId;
    const record = findRecord(recordId);

    if (!takeModal || !submitButton || !record) return;

    const metersInput = document.getElementById('productionTakeOrderMeters');
    const operatorsInput = document.getElementById('productionTakeOrderOperators');
    const printingInput = document.getElementById('productionTakeOrderPrintingMaterial');
    const laminationInput = document.getElementById('productionTakeOrderLaminationMaterial');
    const convertedMeters = Number(metersInput?.value || 0);

    if (!Number.isFinite(convertedMeters) || convertedMeters <= 0) {
      setTakeOrderFeedback('Enter converted meters.');
      metersInput?.focus();
      return;
    }

    setTakeOrderFeedback('');
    submitButton.disabled = true;
    submitButton.textContent = 'Taking order...';

    try {
      const data = await requestProductionApi(`${PRODUCTION_API_BASE}/take-order`, {
        method: 'POST',
        body: JSON.stringify({
          orderId: record.orderId,
          convertedMeters,
          assignedTo: operatorsInput?.value || '',
          printingMaterial: printingInput?.value || '',
          laminationMaterial: laminationInput?.value || ''
        })
      });

      const productionRecord = mapProductionApiRecord(data?.record);
      const originalAssignedTo = getOriginalOrderAssignedTo(record);
      if (!getProductionRecordAssignmentRole(productionRecord)) {
        productionRecord.assignToRole = getProductionRecordAssignmentRole(record);
      }

      /* Force the freshly taken DB record into Printing / Ongoing immediately.
         This also overwrites any stale browser snapshot for the same order. */
      productionRecord.stage = data?.record?.stage || productionRecord.stage || defaultProductionStage;
      productionRecord.status = data?.record?.stageStatus || data?.record?.status || productionRecord.status || "ongoing";
      productionRecord.assignToRole = getProductionRecordAssignmentRole(productionRecord) || getProductionRecordAssignmentRole(record);

      productionRecord.orderAssignedTo = productionRecord.orderAssignedTo && productionRecord.orderAssignedTo !== "Unassigned"
        ? productionRecord.orderAssignedTo
        : originalAssignedTo;
      productionRecord.originalAssignedTo = productionRecord.originalAssignedTo && productionRecord.originalAssignedTo !== "Unassigned"
        ? productionRecord.originalAssignedTo
        : originalAssignedTo;
      persistProductionStageRecord(productionRecord);
      productionReceivingRecords = productionReceivingRecords
        .filter((item) => String(item.id) !== String(record.id) && String(item.orderId) !== String(record.orderId))
        .concat(productionRecord);

      markProductionStatusRecordAsUnread(productionRecord, {
        rerender: false,
        stageId: productionRecord.stage || defaultProductionStage
      });

      closeTakeOrderModal();
      updateProductionReceivingCounts();
      renderProductionReceivingList();
      scheduleProductionReceivingRefresh();
      dispatchProductionOverviewRefresh();
    } catch (error) {
      setTakeOrderFeedback(error?.message || 'Unable to take order.');
      submitButton.disabled = false;
      submitButton.textContent = 'Take Order';
    }
  }


  function getStartStageModal() {
    let startModal = document.getElementById('productionStartStageModal');
    if (startModal) return startModal;

    startModal = document.createElement('div');
    startModal.className = 'pr-modal-backdrop pr-start-stage-modal-backdrop';
    startModal.id = 'productionStartStageModal';
    startModal.setAttribute('aria-hidden', 'true');
    startModal.innerHTML = `
      <section class="pr-modal pr-start-stage-modal" role="dialog" aria-modal="true" aria-labelledby="productionStartStageModalTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="productionStartStageModalTitle">Start Production Stage</h3>
          </div>

          <button class="pr-modal-close pr-start-stage-close" type="button" aria-label="Close start stage modal">
            <span>×</span>
          </button>
        </header>

        <div class="pr-modal-body" id="productionStartStageModalBody"></div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary pr-start-stage-cancel" type="button">Cancel</button>
          <button class="pr-action-btn primary" id="productionStartStageSubmit" type="button">Start Production Stage</button>
        </footer>
      </section>
    `;

    document.body.appendChild(startModal);

    startModal.querySelector('.pr-start-stage-close')?.addEventListener('click', closeStartStageModal);
    startModal.querySelector('.pr-start-stage-cancel')?.addEventListener('click', closeStartStageModal);
    startModal.querySelector('#productionStartStageSubmit')?.addEventListener('click', submitStartStageModal);

    return startModal;
  }

  function shouldUseFullBalanceMetersOnStart(record) {
    return record?.stage === defaultProductionStage
      && record?.status === "pending"
      && isProductionPartialRecord(record)
      && record?.partialKind === "balance";
  }

  function openStartStageModal(recordId) {
    const record = findRecord(recordId);
    if (!record) return;

    const startModal = getStartStageModal();
    const modalTitle = startModal.querySelector('#productionStartStageModalTitle');
    const modalBody = startModal.querySelector('#productionStartStageModalBody');
    const submitButton = startModal.querySelector('#productionStartStageSubmit');
    const stageInput = getStageInputDetails(record);
    const useFullBalanceMeters = shouldUseFullBalanceMetersOnStart(record);
    const fixedBalanceMeters = Number(stageInput.meters || 0);
    const fixedBalanceMetersDisplay = Number.isFinite(fixedBalanceMeters) && fixedBalanceMeters > 0
      ? formatProductionMeters(fixedBalanceMeters)
      : (stageInput.metersDisplay || "—");
    const startMetersMaxAttribute = Number(stageInput.meters || 0) > 0
      ? ` max="${escapeProductionHTML(stageInput.meters)}"`
      : '';

    if (!modalBody || !submitButton) return;

    if (modalTitle) modalTitle.textContent = `Start ${getStageLabel(record.stage)}`;
    startModal.dataset.startRecordId = record.id;
    startModal.dataset.requiredMeters = String(stageInput.meters || "");
    startModal.dataset.autoStartingMeters = useFullBalanceMeters ? String(fixedBalanceMeters || "") : "";
    submitButton.disabled = false;
    submitButton.textContent = `Start ${getStageLabel(record.stage)}`;

    const startStageMetersInputMarkup = useFullBalanceMeters ? `
      <div class="pr-start-stage-entered-side pr-start-stage-fixed-meters" aria-label="Starting meters">
        <span>Starting meters</span>
        <strong>${escapeProductionHTML(fixedBalanceMetersDisplay)}</strong>
      </div>
    ` : `
      <label class="pr-form-field pr-form-field-required pr-start-stage-meters-input-field">
        <span>Starting meters</span>
        <input id="productionStartStageMeters" type="number" min="0.01" step="0.01"${startMetersMaxAttribute} inputmode="decimal" placeholder="Enter starting meters" autocomplete="off">
      </label>
    `;

    const startStageMetersRowMarkup = `
      <div class="pr-start-stage-meters-row">
        <div class="pr-start-stage-entered-side" aria-label="${escapeProductionHTML(stageInput.previousStageLabel)} meters required">
          <span>${escapeProductionHTML(useFullBalanceMeters ? 'Remaining meters' : `${stageInput.previousStageLabel} meters required`)}</span>
          <strong>${escapeProductionHTML(stageInput.metersDisplay)}</strong>
        </div>
        ${startStageMetersInputMarkup}
      </div>
    `;

    const startStageMaterialFieldsMarkup = useFullBalanceMeters ? `
      <div class="pr-partial-materials-row">
        <label class="pr-form-field">
          <span>Printing Material</span>
          <input id="productionStartStagePrintingMaterial" type="text" value="${escapeProductionHTML(getMaterialInputValue(record.printingMaterial))}" placeholder="Printing material">
        </label>

        <label class="pr-form-field">
          <span>Lamination Material</span>
          <input id="productionStartStageLaminationMaterial" type="text" value="${escapeProductionHTML(getMaterialInputValue(record.laminationMaterial))}" placeholder="Lamination material">
        </label>
      </div>
    ` : '';

    modalBody.innerHTML = `
      <div class="pr-take-order-summary">
        <strong>${escapeProductionHTML(record.item)}</strong>
        <span>${escapeProductionHTML(record.poNumber)} • ${escapeProductionHTML(record.joNumber)} • ${escapeProductionHTML(record.client)}</span>
      </div>

      ${useFullBalanceMeters ? `
        <div class="pr-form-feedback pr-fixed-balance-note" role="note">
          This balance will use the remaining meters automatically.
        </div>
      ` : ''}

      <div class="pr-take-order-form pr-start-stage-meter-layout">
        ${startStageMetersRowMarkup}

        <label class="pr-form-field pr-form-field-full">
          <span>Operator/s</span>
          <input id="productionStartStageOperators" type="text" value="${escapeProductionHTML(getProductionOperatorInputValue(record))}" placeholder="Enter operator/s">
        </label>

        ${startStageMaterialFieldsMarkup}
      </div>

      <div class="pr-form-feedback" id="productionStartStageFeedback" hidden></div>
    `;

    startModal.querySelector('#productionStartStageMeters')?.addEventListener('input', () => {
      clearStartStageMetersError();
      setStartStageFeedback('');
    });

    startModal.classList.add('show');
    startModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    setTimeout(() => {
      if (useFullBalanceMeters) {
        startModal.querySelector('#productionStartStageOperators')?.focus();
        return;
      }

      startModal.querySelector('#productionStartStageMeters')?.focus();
    }, 0);
  }

  function closeStartStageModal() {
    const startModal = document.getElementById('productionStartStageModal');
    if (!startModal) return;

    startModal.classList.remove('show');
    startModal.setAttribute('aria-hidden', 'true');
    startModal.dataset.startRecordId = '';
    startModal.dataset.requiredMeters = '';
    startModal.dataset.autoStartingMeters = '';

    if (!modalBackdrop?.classList.contains('show') && !dateModalBackdrop?.classList.contains('show')) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function getHoldStageModal() {
    let holdModal = document.getElementById('productionHoldStageModal');
    if (holdModal) return holdModal;

    holdModal = document.createElement('div');
    holdModal.className = 'pr-modal-backdrop pr-hold-stage-modal-backdrop';
    holdModal.id = 'productionHoldStageModal';
    holdModal.setAttribute('aria-hidden', 'true');
    holdModal.innerHTML = `
      <section class="pr-modal pr-hold-stage-modal" role="dialog" aria-modal="true" aria-labelledby="productionHoldStageModalTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="productionHoldStageModalTitle">Hold Production Stage</h3>
          </div>

          <button class="pr-modal-close pr-hold-stage-close" type="button" aria-label="Close hold modal">
            <span>×</span>
          </button>
        </header>

        <div class="pr-modal-body" id="productionHoldStageModalBody"></div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary pr-hold-stage-cancel" type="button">Cancel</button>
          <button class="pr-action-btn warning" id="productionHoldStageSubmit" type="button">Hold Item</button>
        </footer>
      </section>
    `;

    document.body.appendChild(holdModal);

    holdModal.querySelector('.pr-hold-stage-close')?.addEventListener('click', closeHoldStageModal);
    holdModal.querySelector('.pr-hold-stage-cancel')?.addEventListener('click', closeHoldStageModal);
    holdModal.querySelector('#productionHoldStageSubmit')?.addEventListener('click', submitHoldStageModal);

    return holdModal;
  }

  function openHoldStageModal(recordId) {
    const record = findRecord(recordId);
    if (!record) return;

    const holdModal = getHoldStageModal();
    const modalTitle = holdModal.querySelector('#productionHoldStageModalTitle');
    const modalBody = holdModal.querySelector('#productionHoldStageModalBody');
    const submitButton = holdModal.querySelector('#productionHoldStageSubmit');
    const stageLabel = getStageLabel(record.stage);

    if (!modalBody || !submitButton) return;

    if (modalTitle) modalTitle.textContent = `Hold ${stageLabel}`;
    holdModal.dataset.holdRecordId = record.id;
    submitButton.disabled = false;
    submitButton.textContent = 'Hold Item';

    modalBody.innerHTML = `
      <div class="pr-take-order-summary">
        <strong>${escapeProductionHTML(record.item)}</strong>
        <span>${escapeProductionHTML(record.poNumber)} • ${escapeProductionHTML(record.joNumber)} • ${escapeProductionHTML(record.client)}</span>
      </div>

      <div class="pr-take-order-form pr-hold-stage-form">
        <label class="pr-form-field pr-form-field-required pr-form-field-full">
          <span>Reason for Hold</span>
          <textarea id="productionHoldReason" rows="4" placeholder="Enter reason why this item is on hold" autocomplete="off"></textarea>
        </label>

        <label class="pr-form-field pr-form-field-full">
          <span>Remarks</span>
          <textarea id="productionHoldRemarks" rows="3" placeholder="Optional additional notes" autocomplete="off"></textarea>
        </label>
      </div>

      <div class="pr-form-feedback" id="productionHoldStageFeedback" hidden></div>
    `;

    holdModal.querySelector('#productionHoldReason')?.addEventListener('input', () => setHoldStageFeedback(''));
    holdModal.querySelector('#productionHoldRemarks')?.addEventListener('input', () => setHoldStageFeedback(''));

    holdModal.classList.add('show');
    holdModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    setTimeout(() => holdModal.querySelector('#productionHoldReason')?.focus(), 0);
  }

  function closeHoldStageModal() {
    const holdModal = document.getElementById('productionHoldStageModal');
    if (!holdModal) return;

    holdModal.classList.remove('show');
    holdModal.setAttribute('aria-hidden', 'true');
    holdModal.dataset.holdRecordId = '';

    if (!modalBackdrop?.classList.contains('show') && !dateModalBackdrop?.classList.contains('show')) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function setHoldStageFeedback(message) {
    const feedback = document.getElementById('productionHoldStageFeedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  function submitHoldStageModal() {
    const holdModal = document.getElementById('productionHoldStageModal');
    const submitButton = document.getElementById('productionHoldStageSubmit');
    const recordId = holdModal?.dataset.holdRecordId;
    const record = findRecord(recordId);

    if (!holdModal || !submitButton || !record) return;

    const reasonInput = document.getElementById('productionHoldReason');
    const remarksInput = document.getElementById('productionHoldRemarks');
    const holdReason = String(reasonInput?.value || '').trim();
    const remarks = String(remarksInput?.value || '').trim();

    if (!holdReason) {
      setHoldStageFeedback('Enter reason for hold.');
      reasonInput?.focus();
      return;
    }

    setHoldStageFeedback('');
    submitButton.disabled = true;
    submitButton.textContent = 'Holding...';

    holdRecord(record.id, { holdReason, remarks });
    closeHoldStageModal();
  }

  function setStartStageFeedback(message) {
    const feedback = document.getElementById('productionStartStageFeedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  function clearStartStageMetersError() {
    const metersInput = document.getElementById('productionStartStageMeters');
    const field = metersInput?.closest('.pr-form-field');

    field?.classList.remove('has-field-error');
    field?.querySelectorAll('.pr-field-error').forEach((error) => error.remove());
    metersInput?.removeAttribute('aria-invalid');
    metersInput?.removeAttribute('aria-describedby');
  }

  function showStartStageMetersError(message) {
    const metersInput = document.getElementById('productionStartStageMeters');
    const field = metersInput?.closest('.pr-form-field');

    if (!field || !metersInput) return;

    clearStartStageMetersError();

    const errorId = 'productionStartStageMetersError';
    const errorBox = document.createElement('div');
    errorBox.className = 'pr-field-error';
    errorBox.id = errorId;
    errorBox.setAttribute('role', 'alert');
    errorBox.innerHTML = `
      <span class="pr-field-error-icon">!</span>
      <span>${escapeProductionHTML(message)}</span>
    `;

    field.classList.add('has-field-error');
    field.appendChild(errorBox);
    metersInput.setAttribute('aria-invalid', 'true');
    metersInput.setAttribute('aria-describedby', errorId);
  }


  function submitStartStageModal() {
    const startModal = document.getElementById('productionStartStageModal');
    const submitButton = document.getElementById('productionStartStageSubmit');
    const recordId = startModal?.dataset.startRecordId;
    const record = findRecord(recordId);
    const metersInput = document.getElementById('productionStartStageMeters');
    const operatorsInput = document.getElementById('productionStartStageOperators');
    const printingInput = document.getElementById('productionStartStagePrintingMaterial');
    const laminationInput = document.getElementById('productionStartStageLaminationMaterial');

    if (!startModal || !submitButton || !record) return;

    const autoStartingMeters = Number(startModal?.dataset.autoStartingMeters || 0);
    const useAutoStartingMeters = shouldUseFullBalanceMetersOnStart(record)
      && Number.isFinite(autoStartingMeters)
      && autoStartingMeters > 0;
    const startingMeters = useAutoStartingMeters ? autoStartingMeters : Number(metersInput?.value || 0);
    const stageInput = getStageInputDetails(record);
    const requiredMeters = Number(stageInput.meters || 0);

    clearStartStageMetersError();
    setStartStageFeedback('');

    if (!Number.isFinite(startingMeters) || startingMeters <= 0) {
      if (useAutoStartingMeters) {
        setStartStageFeedback('Remaining meters are missing.');
        return;
      }

      showStartStageMetersError('Enter starting meters.');
      metersInput?.focus();
      return;
    }

    if (requiredMeters > 0 && startingMeters - requiredMeters > 0.0001) {
      if (useAutoStartingMeters) {
        setStartStageFeedback('Remaining meters are invalid.');
        return;
      }

      showStartStageMetersError('Cannot exceed required meters.');
      metersInput?.focus();
      metersInput?.select?.();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = `Starting ${getStageLabel(record.stage)}...`;
    startRecord(record.id, {
      startingMeters,
      requiredMeters,
      assignedTo: operatorsInput?.value || '',
      printingMaterial: printingInput?.value || '',
      laminationMaterial: laminationInput?.value || ''
    });
    closeStartStageModal();
  }

  function createProductionBalanceRecord(record, balanceMeters, startedMeters, availableMeters, startedAt, balanceBatchNumber = 0, originalStageMeters = 0) {
    const balanceRecordId = createProductionPartialRecordId(record);
    const stageLabel = getStageLabel(record.stage);
    const balanceMetersText = formatProductionMeters(balanceMeters);
    const startedMetersText = formatProductionMeters(startedMeters);
    const availableMetersText = formatProductionMeters(availableMeters);
    const safeBalanceBatchNumber = Number(balanceBatchNumber || 0);
    const balanceBatchLabel = Number.isFinite(safeBalanceBatchNumber) && safeBalanceBatchNumber > 0
      ? `Batch ${Math.floor(safeBalanceBatchNumber)}`
      : "";
    const safeOriginalStageMeters = Number(originalStageMeters || availableMeters || 0);
    const originalMetersText = Number.isFinite(safeOriginalStageMeters) && safeOriginalStageMeters > 0
      ? formatProductionMeters(safeOriginalStageMeters)
      : "";
    const existingHistory = Array.isArray(record.actionHistory) ? record.actionHistory : getProductionActionHistory(record);
    const balanceCarryForwardHistory = getProductionHistoryCarryForwardForBalance(record, existingHistory);
    const balanceHistory = [
      ...balanceCarryForwardHistory,
      {
        title: `${stageLabel} Balance`,
        description: `${balanceMetersText} remained pending after ${startedMetersText} was started from ${availableMetersText}.`,
        meta: startedAt,
        stage: record.stage,
        status: "pending",
        eventType: "balance-created",
        meters: balanceMeters,
        batchLabel: balanceBatchLabel
      }
    ];

    const balanceRecord = normalizeProductionPartialRecord({
      ...record,
      id: balanceRecordId,
      partialRecordId: balanceRecordId,
      partialParentId: record.partialRecordId || record.id,
      partialKind: "balance",
      partialSourceStage: record.stage,
      partialSourceLabel: "Balance",
      sourceType: "production-partial",
      productionRecordId: "",
      status: "pending",
      stage: record.stage,
      convertedMeters: balanceMeters,
      convertedMetersDisplay: balanceMetersText,
      balanceMeters,
      batchNumber: Number.isFinite(safeBalanceBatchNumber) && safeBalanceBatchNumber > 0 ? Math.floor(safeBalanceBatchNumber) : "",
      partialBatchNumber: Number.isFinite(safeBalanceBatchNumber) && safeBalanceBatchNumber > 0 ? Math.floor(safeBalanceBatchNumber) : "",
      originalStageMeters: Number.isFinite(safeOriginalStageMeters) && safeOriginalStageMeters > 0 ? safeOriginalStageMeters : "",
      originalStageMetersDisplay: originalMetersText || "",
      startingMeters: "",
      assignedTo: "Unassigned",
      orderAssignedTo: getOriginalOrderAssignedTo(record),
      originalAssignedTo: getOriginalOrderAssignedTo(record),
      lastRunAssignedTo: record.assignedTo && record.assignedTo !== "Unassigned" ? record.assignedTo : (record.lastCompletedOperator || ""),
      latestRunAssignedTo: record.assignedTo && record.assignedTo !== "Unassigned" ? record.assignedTo : (record.lastCompletedOperator || ""),
      lastRunPrintingMaterial: record.printingMaterial || "—",
      latestRunPrintingMaterial: record.printingMaterial || "—",
      lastRunLaminationMaterial: record.laminationMaterial || "—",
      latestRunLaminationMaterial: record.laminationMaterial || "—",
      dateEntered: startedAt,
      updatedAtDisplay: startedAt,
      holdReason: "",
      remarks: `${balanceBatchLabel ? `${balanceBatchLabel} ` : ""}${stageLabel} balance remaining: ${balanceMetersText}.`,
      lastProducedMeters: "",
      lastWasteMeters: "",
      lastCompletedOperator: "",
      actionHistory: balanceHistory
    });

    saveProductionHistorySnapshot(balanceRecord, balanceHistory);

    return balanceRecord;
  }

  function startRecord(recordId, startOptions = {}) {
    const record = findRecord(recordId);
    if (!record) return;

    const startingMeters = Number(startOptions.startingMeters || 0);
    const startingMetersText = Number.isFinite(startingMeters) && startingMeters > 0
      ? formatProductionMeters(startingMeters)
      : "";
    const assignedTo = String(startOptions.assignedTo || "").trim();
    const hasPrintingMaterialInput = Object.prototype.hasOwnProperty.call(startOptions, "printingMaterial");
    const hasLaminationMaterialInput = Object.prototype.hasOwnProperty.call(startOptions, "laminationMaterial");
    const printingMaterial = String(startOptions.printingMaterial || "").trim();
    const laminationMaterial = String(startOptions.laminationMaterial || "").trim();
    const availableMeters = Number(startOptions.requiredMeters || getStageInputDetails(record).meters || 0);
    const canCreatePartialStart = record.stage !== defaultProductionStage || isProductionPartialRecord(record);
    const hasPartialStart = canCreatePartialStart && Number.isFinite(availableMeters) && availableMeters > 0 && Number.isFinite(startingMeters) && startingMeters > 0 && availableMeters - startingMeters > 0.0001;
    const balanceMeters = hasPartialStart ? availableMeters - startingMeters : 0;
    const balanceMetersText = balanceMeters > 0 ? formatProductionMeters(balanceMeters) : "";
    const availableMetersText = Number.isFinite(availableMeters) && availableMeters > 0 ? formatProductionMeters(availableMeters) : "";
    const existingBatchNumber = getProductionBatchNumber(record);
    const shouldUseBatchLabel = canCreatePartialStart && (hasPartialStart || existingBatchNumber > 0);
    const currentBatchNumber = shouldUseBatchLabel ? (existingBatchNumber || 1) : 0;
    const originalStageMeters = shouldUseBatchLabel
      ? (getProductionOriginalStageMeters(record) || availableMeters)
      : 0;
    const originalStageMetersText = originalStageMeters > 0 ? formatProductionMeters(originalStageMeters) : "";
    const currentBatchLabel = currentBatchNumber > 0 ? `Batch ${currentBatchNumber}` : "";
    const startedAt = formatProductionNow();

    if (isProductionContainerRecord(record)) {
      lockProductionContainerSourceRecords(record);
    }

    if (currentBatchNumber > 0) {
      applyProductionBatchMetadata(record, currentBatchNumber, originalStageMeters);

      if (isProductionPartialRecord(record) && record.partialKind === "balance") {
        record.partialKind = "batch";
      }

      if (record.partialKind === "container") {
        record.partialKind = "container-batch";
      }
    }

    record.status = 'ongoing';
    if (hasPrintingMaterialInput) record.printingMaterial = printingMaterial || record.printingMaterial || "—";
    if (hasLaminationMaterialInput) record.laminationMaterial = laminationMaterial || record.laminationMaterial || "—";
    record.orderAssignedTo = record.orderAssignedTo || record.originalAssignedTo || "Unassigned";
    record.originalAssignedTo = record.originalAssignedTo || record.orderAssignedTo || "Unassigned";
    record.assignedTo = assignedTo || 'Unassigned';
    record.dateEntered = startedAt;
    record.updatedAtDisplay = startedAt;
    record.startingMeters = startingMetersText ? startingMeters : (record.startingMeters || "");
    record.remarks = startingMetersText
      ? `${currentBatchLabel ? `${currentBatchLabel} • ` : ""}${getStageLabel(record.stage)} started with ${startingMetersText} starting meters${balanceMetersText ? `; balance: ${balanceMetersText}.` : '.'}`
      : `${currentBatchLabel ? `${currentBatchLabel} • ` : ""}${getStageLabel(record.stage)} started.`;
    const startHistoryDescription = [
      startingMetersText && availableMetersText
        ? `${getStageLabel(record.stage)} started with ${startingMetersText} of ${availableMetersText}.`
        : startingMetersText
          ? `${getStageLabel(record.stage)} started with ${startingMetersText}.`
          : `${getStageLabel(record.stage)} started.`,
      balanceMetersText ? `${balanceMetersText} remained pending.` : ''
    ].filter(Boolean).join(' ');
    record.holdReason = '';
    appendProductionActionHistory(
      record,
      `Start ${getStageLabel(record.stage)}`,
      startHistoryDescription,
      record.dateEntered,
      {
        eventType: "stage-started",
        operators: getProductionOperatorDisplay(record),
        meters: startingMeters,
        batchLabel: currentBatchLabel
      }
    );

    if (hasPartialStart) {
      const balanceRecord = createProductionBalanceRecord(record, balanceMeters, startingMeters, availableMeters, startedAt, currentBatchNumber + 1, originalStageMeters);
      productionReceivingRecords = productionReceivingRecords.concat(balanceRecord);
      persistProductionPartialRecord(balanceRecord);
      markProductionStatusRecordAsUnread(balanceRecord, {
        rerender: false,
        stageId: balanceRecord.stage || activeProductionStage
      });
    }

    persistProductionStageRecord(record);
    markProductionStatusRecordAsUnread(record, {
      rerender: false,
      stageId: record.stage || activeProductionStage
    });

    updateProductionReceivingCounts();
    renderProductionReceivingList();
    closeProductionReceivingModal();
    dispatchProductionOverviewRefresh();
  }

  function getFinishingDeliveryModal() {
    let deliveryModal = document.getElementById('productionFinishingDeliveryModal');
    if (deliveryModal) return deliveryModal;

    deliveryModal = document.createElement('div');
    deliveryModal.className = 'pr-modal-backdrop pr-finishing-delivery-modal-backdrop';
    deliveryModal.id = 'productionFinishingDeliveryModal';
    deliveryModal.setAttribute('aria-hidden', 'true');
    deliveryModal.innerHTML = `
      <section class="pr-modal pr-finishing-delivery-modal" role="dialog" aria-modal="true" aria-labelledby="productionFinishingDeliveryModalTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="productionFinishingDeliveryModalTitle">Move to Delivery</h3>
            <p id="productionFinishingDeliveryModalSubTitle">Complete finishing details before moving the item.</p>
          </div>

          <button class="pr-modal-close pr-finishing-delivery-close" type="button" aria-label="Close move to delivery modal">
            <span>×</span>
          </button>
        </header>

        <div class="pr-modal-body" id="productionFinishingDeliveryModalBody"></div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary pr-finishing-delivery-cancel" type="button">Cancel</button>
          <button class="pr-action-btn success" id="productionFinishingDeliverySubmit" type="button">Move to Delivery</button>
        </footer>
      </section>
    `;

    document.body.appendChild(deliveryModal);
    deliveryModal.querySelector('.pr-finishing-delivery-close')?.addEventListener('click', closeFinishingDeliveryModal);
    deliveryModal.querySelector('.pr-finishing-delivery-cancel')?.addEventListener('click', closeFinishingDeliveryModal);
    deliveryModal.querySelector('#productionFinishingDeliverySubmit')?.addEventListener('click', submitFinishingDeliveryModal);

    return deliveryModal;
  }

  function createFinishingDeliveryDetailField(label, value) {
    return `
      <div class="pr-field">
        <span>${escapeProductionHTML(label)}</span>
        <strong>${escapeProductionHTML(value || "—")}</strong>
      </div>
    `;
  }

  function openFinishingDeliveryModal(recordId) {
    const record = findRecord(recordId);
    const deliveryModal = getFinishingDeliveryModal();
    const modalBody = deliveryModal.querySelector('#productionFinishingDeliveryModalBody');
    const submitButton = deliveryModal.querySelector('#productionFinishingDeliverySubmit');
    const modalTitle = deliveryModal.querySelector('#productionFinishingDeliveryModalTitle');
    const modalSubTitle = deliveryModal.querySelector('#productionFinishingDeliveryModalSubTitle');

    if (!record || !modalBody || !submitButton) return;

    const processType = getFinishingDeliveryProcessType(record);
    const processLabel = getFinishingDeliveryProcessLabel(record);
    const inputFields = processType === 'bagging'
      ? `
        <label class="pr-form-field pr-form-field-required">
          <span>No. of Bags</span>
          <input id="finishingDeliveryBags" type="number" min="1" step="1" inputmode="numeric" placeholder="Enter no. of bags" autocomplete="off">
        </label>
        <label class="pr-form-field pr-form-field-required">
          <span>Pcs per Bag</span>
          <input id="finishingDeliveryPcsPerBag" type="number" min="1" step="1" inputmode="numeric" placeholder="Enter pcs per bag" autocomplete="off">
        </label>
      `
      : `
        <label class="pr-form-field pr-form-field-required">
          <span>No. of Rolls</span>
          <input id="finishingDeliveryRolls" type="number" min="1" step="1" inputmode="numeric" placeholder="Enter no. of rolls" autocomplete="off">
        </label>
        <label class="pr-form-field pr-form-field-required">
          <span>Total Kgs</span>
          <input id="finishingDeliveryTotalKgs" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter total kgs" autocomplete="off">
        </label>
      `;

    if (modalTitle) modalTitle.textContent = 'Move to Delivery';
    if (modalSubTitle) modalSubTitle.textContent = `${processLabel} details are required before moving to For Delivery.`;

    deliveryModal.dataset.deliveryRecordId = record.id;
    deliveryModal.dataset.deliveryProcessType = processType;
    submitButton.disabled = false;
    submitButton.textContent = 'Move to Delivery';

    modalBody.innerHTML = `
      <div class="pr-take-order-summary">
        <strong>${escapeProductionHTML(record.item)}</strong>
        <span>${escapeProductionHTML(record.poNumber)} • ${escapeProductionHTML(record.joNumber)}</span>
        <small>${escapeProductionHTML(processLabel)}</small>
      </div>

      <div class="pr-record-grid pr-stage-input-grid">
        ${createFinishingDeliveryDetailField('Client', record.client)}
        ${createFinishingDeliveryDetailField('Quantity', record.quantity)}
        ${createFinishingDeliveryDetailField('Delivery Date', record.deliveryDate)}
        ${createFinishingDeliveryDetailField('Finished From', getStageLabel(record.stage))}
      </div>

      <div class="pr-form-grid">
        ${inputFields}
      </div>

      <div class="pr-form-feedback" id="productionFinishingDeliveryFeedback" hidden></div>
    `;

    modalBody.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => setFinishingDeliveryFeedback(''));
    });

    deliveryModal.classList.add('show');
    deliveryModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    setTimeout(() => modalBody.querySelector('input')?.focus(), 0);
  }

  function closeFinishingDeliveryModal() {
    const deliveryModal = document.getElementById('productionFinishingDeliveryModal');
    if (!deliveryModal) return;

    deliveryModal.classList.remove('show');
    deliveryModal.setAttribute('aria-hidden', 'true');
    deliveryModal.dataset.deliveryRecordId = '';
    deliveryModal.dataset.deliveryProcessType = '';

    if (!modalBackdrop?.classList.contains('show') && !dateModalBackdrop?.classList.contains('show')) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function setFinishingDeliveryFeedback(message) {
    const feedback = document.getElementById('productionFinishingDeliveryFeedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  function readPositiveIntegerInput(input, label) {
    const value = Number(input?.value || 0);
    if (!Number.isInteger(value) || value <= 0) {
      return { error: `${label} is required.` };
    }

    return { value };
  }

  function readPositiveNumberInput(input, label) {
    const value = Number(input?.value || 0);
    if (!Number.isFinite(value) || value <= 0) {
      return { error: `${label} is required.` };
    }

    return { value };
  }

  function getFinishingDeliveryDetailsFromModal(deliveryModal) {
    const processType = deliveryModal?.dataset.deliveryProcessType || 'weighing';

    if (processType === 'bagging') {
      const bags = readPositiveIntegerInput(document.getElementById('finishingDeliveryBags'), 'No. of bags');
      if (bags.error) return bags;

      const pcsPerBag = readPositiveIntegerInput(document.getElementById('finishingDeliveryPcsPerBag'), 'Pcs per bag');
      if (pcsPerBag.error) return pcsPerBag;

      return {
        value: {
          processType: 'bagging',
          bags: bags.value,
          pcsPerBag: pcsPerBag.value
        }
      };
    }

    const rolls = readPositiveIntegerInput(document.getElementById('finishingDeliveryRolls'), 'No. of rolls');
    if (rolls.error) return rolls;

    const totalKgs = readPositiveNumberInput(document.getElementById('finishingDeliveryTotalKgs'), 'Total kgs');
    if (totalKgs.error) return totalKgs;

    return {
      value: {
        processType: 'weighing',
        rolls: rolls.value,
        totalKgs: totalKgs.value
      }
    };
  }

  function getFinishingDeliveryDetailsText(details = {}) {
    if (details.processType === 'bagging') {
      return `No. of bags: ${formatProductionCompactNumber(details.bags)}. Pcs per bag: ${formatProductionCompactNumber(details.pcsPerBag)}.`;
    }

    return `No. of rolls: ${formatProductionCompactNumber(details.rolls)}. Total kgs: ${formatProductionCompactNumber(details.totalKgs)} kgs.`;
  }

  async function submitFinishingDeliveryModal() {
    const deliveryModal = document.getElementById('productionFinishingDeliveryModal');
    const submitButton = document.getElementById('productionFinishingDeliverySubmit');
    const recordId = deliveryModal?.dataset.deliveryRecordId;

    if (!deliveryModal || !submitButton || !recordId) return;

    const deliveryDetails = getFinishingDeliveryDetailsFromModal(deliveryModal);
    if (deliveryDetails.error) {
      setFinishingDeliveryFeedback(deliveryDetails.error);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Moving to Delivery...';
    setFinishingDeliveryFeedback('');

    try {
      await moveFinishingRecordToDelivery(recordId, deliveryDetails.value);
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = 'Move to Delivery';
      setFinishingDeliveryFeedback(error?.message || 'Unable to move item to delivery.');
    }
  }

  async function moveFinishingRecordToDelivery(recordId, deliveryDetails = {}) {
    const record = findRecord(recordId);
    if (!record) throw new Error('Production record not found.');
    if (!record.orderId) throw new Error('Order reference is missing.');

    const movedAt = formatProductionNow();
    const detailText = getFinishingDeliveryDetailsText(deliveryDetails);
    const finishingLabel = getStageLabel('finishing');

    if (!Array.isArray(record.completedStages)) {
      record.completedStages = ["Issue Order"];
    }

    if (!record.completedStages.includes(finishingLabel)) {
      record.completedStages.push(finishingLabel);
    }

    record.status = 'completed';
    record.dateEntered = movedAt;
    record.holdReason = '';
    record.remarks = `Item moved to For Delivery. ${detailText}`;
    record.deliveryDetails = deliveryDetails;

    appendProductionActionHistory(
      record,
      'Moved to Delivery',
      `Item moved to Deliveries > For Delivery. ${detailText}`,
      movedAt,
      {
        eventType: 'moved-to-delivery',
        stage: 'delivery',
        status: 'delivery'
      }
    );

    if (record.productionRecordId && !isProductionPartialRecord(record)) {
      await requestProductionApi(`${PRODUCTION_API_BASE}/records/${encodeURIComponent(record.productionRecordId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'finishing',
          status: 'completed',
          convertedMeters: Number(record.convertedMeters || 0) || undefined,
          printingMaterial: record.printingMaterial === '—' ? '' : record.printingMaterial,
          laminationMaterial: record.laminationMaterial === '—' ? '' : record.laminationMaterial,
          assignedTo: record.assignedTo === 'Unassigned' ? '' : record.assignedTo,
          remarks: record.remarks || '',
          holdReason: '',
          completedStages: record.completedStages
        })
      });
    }

    await requestProductionApi(`${PRODUCTION_ORDERS_API_BASE}/${encodeURIComponent(record.orderId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'delivery',
        deliveryDetails
      })
    });

    if (!isProductionPartialRecord(record)) {
      persistProductionStageRecord(record);
    }

    cleanupProductionLocalRecordsAfterDelivery(record);
    productionReceivingRecords = productionReceivingRecords.filter((item) => String(item.id) !== String(recordId));

    updateProductionReceivingCounts();
    renderProductionReceivingList();
    closeFinishingDeliveryModal();
    closeProductionReceivingModal();
    dispatchProductionOverviewRefresh();
    document.dispatchEvent(new CustomEvent('system:delivery-records-updated'));
    document.dispatchEvent(new CustomEvent('system:notifications-refresh'));
    await loadDeliveryOrders({ silent: true, forceRender: true });
  }

  function getMoveStageOptions(record) {
    const currentStageIndex = productionStages.findIndex((stage) => stage.id === record?.stage);
    const nextStages = currentStageIndex >= 0 ? productionStages.slice(currentStageIndex + 1) : [];

    /*
      V14: Do not show "Complete Production" in the next-stage choices.
      Finishing has its own Move to Delivery flow, so users should only select
      real production stages here.
    */
    return nextStages.map((stage) => ({
      value: stage.id,
      label: stage.label,
      description: `Move this item to ${stage.label} pending.`
    }));
  }

  function getDefaultMoveStageValue(record) {
    const options = getMoveStageOptions(record);
    return options[0]?.value || '';
  }

  function getMoveStageModal() {
    let moveModal = document.getElementById('productionMoveStageModal');
    if (moveModal) return moveModal;

    moveModal = document.createElement('div');
    moveModal.className = 'pr-modal-backdrop pr-move-stage-modal-backdrop';
    moveModal.id = 'productionMoveStageModal';
    moveModal.setAttribute('aria-hidden', 'true');
    moveModal.innerHTML = `
      <section class="pr-modal pr-move-stage-modal" role="dialog" aria-modal="true" aria-labelledby="productionMoveStageModalTitle">
        <header class="pr-modal-head">
          <div>
            <h3 id="productionMoveStageModalTitle">Finish Stage</h3>
          </div>
        </header>

        <div class="pr-modal-body" id="productionMoveStageModalBody"></div>

        <footer class="pr-modal-footer">
          <button class="pr-modal-secondary pr-move-stage-cancel" type="button">Cancel</button>
          <button class="pr-action-btn success" id="productionMoveStageSubmit" type="button">Finish Stage</button>
        </footer>
      </section>
    `;

    document.body.appendChild(moveModal);

    moveModal.querySelector('.pr-move-stage-cancel')?.addEventListener('click', closeMoveStageModal);
    moveModal.querySelector('#productionMoveStageSubmit')?.addEventListener('click', submitMoveStageModal);

    return moveModal;
  }

  function openMoveStageModal(recordId) {
    const record = findRecord(recordId);
    const moveModal = getMoveStageModal();
    const modalBody = moveModal.querySelector('#productionMoveStageModalBody');
    const submitButton = moveModal.querySelector('#productionMoveStageSubmit');

    if (!record || !modalBody || !submitButton) return;

    const completedStageLabel = getStageLabel(record.stage);
    const modalTitle = moveModal.querySelector('#productionMoveStageModalTitle');
    const options = getMoveStageOptions(record);
    const defaultValue = getDefaultMoveStageValue(record);
    const enteredMeters = getEnteredMetersDetails(record);
    const isPrintingFinishStage = record.stage === 'printing';
    const producedMetersMaxAttribute = !isPrintingFinishStage && Number(enteredMeters.meters || 0) > 0
      ? ` max="${escapeProductionHTML(enteredMeters.meters)}"`
      : '';
    const producedMetersFieldMarkup = `
      <label class="pr-form-field pr-form-field-required pr-form-field-full${isPrintingFinishStage ? ' pr-printing-finish-produced-field' : ''}">
        <span>Meters Produced</span>
        <input id="productionMoveProducedMeters" type="number" min="0.01" step="0.01"${producedMetersMaxAttribute} inputmode="decimal" placeholder="Enter produced meters" autocomplete="off">
      </label>
    `;
    const printingMetersRowMarkup = `
      <div class="pr-printing-finish-meters-row">
        <div class="pr-printing-finish-entered-side" aria-label="Entered meters">
          <span>Entered meters</span>
          <strong>${escapeProductionHTML(enteredMeters.metersDisplay)}</strong>
        </div>
        ${producedMetersFieldMarkup}
      </div>
    `;
    const finishStageMetersRowMarkup = `
      <div class="pr-finish-stage-meters-row">
        <div class="pr-finish-stage-entered-side" aria-label="Entered meters">
          <span>Entered meters</span>
          <strong>${escapeProductionHTML(enteredMeters.metersDisplay)}</strong>
        </div>
        ${producedMetersFieldMarkup}
      </div>
    `;

    if (modalTitle) modalTitle.textContent = `Finish ${completedStageLabel}`;
    moveModal.dataset.moveRecordId = record.id;
    submitButton.disabled = false;
    submitButton.textContent = `Finish ${completedStageLabel}`;

    modalBody.innerHTML = `
      <div class="pr-take-order-summary pr-move-stage-summary">
        <strong>${escapeProductionHTML(record.item)}</strong>
        <span>${escapeProductionHTML(record.poNumber)} • ${escapeProductionHTML(record.joNumber)}</span>
      </div>

      <div class="pr-move-stage-production-form${isPrintingFinishStage ? ' pr-printing-finish-meter-layout' : ' pr-finish-stage-meter-layout'}">
        ${isPrintingFinishStage ? printingMetersRowMarkup : finishStageMetersRowMarkup}

        <label class="pr-form-field pr-form-field-full">
          <span>Operator/s</span>
          <input id="productionMoveStageOperators" type="text" value="${escapeProductionHTML(getProductionOperatorInputValue(record))}" placeholder="Enter operator/s">
        </label>
      </div>

      <div class="pr-move-stage-current">
        <span>Stage to finish</span>
        <strong>${escapeProductionHTML(completedStageLabel)}</strong>
      </div>

      <div class="pr-move-stage-options" role="radiogroup" aria-label="Next production stage">
        ${options.map((option) => `
          <label class="pr-move-stage-option">
            <input type="radio" name="productionNextStage" value="${escapeProductionHTML(option.value)}" ${option.value === defaultValue ? 'checked' : ''}>
            <span>
              <strong>${escapeProductionHTML(option.label)}</strong>
              <small>${escapeProductionHTML(option.description)}</small>
            </span>
          </label>
        `).join('')}
      </div>

      <div class="pr-form-feedback" id="productionMoveStageFeedback" hidden></div>
    `;

    moveModal.querySelector('#productionMoveProducedMeters')?.addEventListener('input', () => {
      clearMoveStageMetersError();
      setMoveStageFeedback('');
    });

    moveModal.classList.add('show');
    moveModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    setTimeout(() => moveModal.querySelector('#productionMoveProducedMeters')?.focus(), 0);
  }

  function closeMoveStageModal() {
    const moveModal = document.getElementById('productionMoveStageModal');
    if (!moveModal) return;

    moveModal.classList.remove('show');
    moveModal.setAttribute('aria-hidden', 'true');
    moveModal.dataset.moveRecordId = '';

    if (!modalBackdrop?.classList.contains('show') && !dateModalBackdrop?.classList.contains('show')) {
      document.body.classList.remove('pr-modal-open');
    }
  }

  function setMoveStageFeedback(message) {
    const feedback = document.getElementById('productionMoveStageFeedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  function clearMoveStageMetersError() {
    const metersInput = document.getElementById('productionMoveProducedMeters');
    const field = metersInput?.closest('.pr-form-field');

    field?.classList.remove('has-field-error');
    field?.querySelectorAll('.pr-field-error').forEach((error) => error.remove());
    metersInput?.removeAttribute('aria-invalid');
    metersInput?.removeAttribute('aria-describedby');
  }

  function showMoveStageMetersError(message) {
    const metersInput = document.getElementById('productionMoveProducedMeters');
    const field = metersInput?.closest('.pr-form-field');

    if (!field || !metersInput) return;

    clearMoveStageMetersError();

    const errorId = 'productionMoveProducedMetersError';
    const errorBox = document.createElement('div');
    errorBox.className = 'pr-field-error';
    errorBox.id = errorId;
    errorBox.setAttribute('role', 'alert');
    errorBox.innerHTML = `
      <span class="pr-field-error-icon">!</span>
      <span>${escapeProductionHTML(message)}</span>
    `;

    field.classList.add('has-field-error');
    field.appendChild(errorBox);
    metersInput.setAttribute('aria-invalid', 'true');
    metersInput.setAttribute('aria-describedby', errorId);
  }

  function submitMoveStageModal() {
    const moveModal = document.getElementById('productionMoveStageModal');
    const submitButton = document.getElementById('productionMoveStageSubmit');
    const recordId = moveModal?.dataset.moveRecordId;
    const selectedInput = moveModal?.querySelector('input[name="productionNextStage"]:checked');
    const metersInput = document.getElementById('productionMoveProducedMeters');
    const operatorsInput = document.getElementById('productionMoveStageOperators');

    if (!moveModal || !submitButton || !recordId) return;

    const record = findRecord(recordId);
    const producedMeters = Number(metersInput?.value || 0);
    const enteredMeters = getEnteredMetersDetails(record).meters;

    clearMoveStageMetersError();
    setMoveStageFeedback('');

    if (!Number.isFinite(producedMeters) || producedMeters <= 0) {
      showMoveStageMetersError('Enter produced meters.');
      metersInput?.focus();
      return;
    }

    if (record?.stage !== 'printing' && Number.isFinite(enteredMeters) && enteredMeters > 0 && producedMeters - enteredMeters > 0.0001) {
      showMoveStageMetersError('Cannot exceed entered meters.');
      metersInput?.focus();
      metersInput?.select?.();
      return;
    }

    const selectedNextStage = selectedInput?.value || '';
    if (!selectedNextStage) {
      setMoveStageFeedback('Choose the next stage.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = `Finishing ${getStageLabel(record?.stage)}...`;
    setMoveStageFeedback('');
    completeRecord(recordId, selectedNextStage, {
      producedMeters,
      completedOperator: operatorsInput?.value || ''
    });
  }

  function completeRecord(recordId, selectedNextStage = '', productionOutput = {}) {
    const record = findRecord(recordId);
    if (!record) return;

    const validNextStageValues = getMoveStageOptions(record).map((option) => option.value);
    const nextStage = validNextStageValues.includes(selectedNextStage)
      ? selectedNextStage
      : getDefaultMoveStageValue(record);
    const completedStageId = record.stage;
    const completedStageLabel = getStageLabel(record.stage);
    const producedMeters = Number(productionOutput.producedMeters || 0);
    const producedMetersText = Number.isFinite(producedMeters) && producedMeters > 0
      ? formatProductionMeters(producedMeters)
      : '';
    const enteredMeters = getEnteredMetersDetails(record).meters;
    const isPrintingCompletion = completedStageId === defaultProductionStage;
    const hasPrintingPartialFinish = isPrintingCompletion && Number.isFinite(enteredMeters) && enteredMeters > 0 && Number.isFinite(producedMeters) && producedMeters > 0 && enteredMeters - producedMeters > 0.0001;
    const printingBalanceMeters = hasPrintingPartialFinish ? enteredMeters - producedMeters : 0;
    const printingBalanceMetersText = printingBalanceMeters > 0 ? formatProductionMeters(printingBalanceMeters) : '';
    const existingBatchNumber = getProductionBatchNumber(record);
    const shouldUsePrintingBatchLabel = isPrintingCompletion && (hasPrintingPartialFinish || existingBatchNumber > 0);
    const currentBatchNumber = shouldUsePrintingBatchLabel ? (existingBatchNumber || 1) : existingBatchNumber;
    const printingOriginalMeters = shouldUsePrintingBatchLabel
      ? (getProductionOriginalStageMeters(record) || enteredMeters)
      : getProductionOriginalStageMeters(record);

    if (shouldUsePrintingBatchLabel) {
      applyProductionBatchMetadata(record, currentBatchNumber, printingOriginalMeters);

      if (isProductionPartialRecord(record) && record.partialKind === "balance") {
        record.partialKind = "batch";
      }
    }

    const wasteMeters = !hasPrintingPartialFinish && Number.isFinite(enteredMeters) && enteredMeters > 0 && producedMeters > 0 && enteredMeters - producedMeters > 0.0001
      ? enteredMeters - producedMeters
      : 0;
    const wasteMetersText = wasteMeters > 0 ? formatProductionMeters(wasteMeters) : '';
    const completedBatchLabel = getProductionBatchLabel(record);
    const completedOriginalMetersText = completedBatchLabel && getProductionOriginalStageMeters(record) > 0
      ? getProductionOriginalStageMetersDisplay(record)
      : "";
    const completedOperatorInput = String(productionOutput.completedOperator || "").trim();
    const completedOperator = completedOperatorInput || (record.assignedTo && record.assignedTo !== 'Unassigned'
      ? String(record.assignedTo).trim()
      : '');
    if (!Array.isArray(record.completedStages)) {
      record.completedStages = ["Issue Order"];
    }

    if (!record.completedStages.includes(completedStageLabel)) {
      record.completedStages.push(completedStageLabel);
    }

    const completedTimestamp = formatProductionNow();
    record.dateEntered = completedTimestamp;
    record.holdReason = '';

    record.orderAssignedTo = record.orderAssignedTo || record.originalAssignedTo || "Unassigned";
    record.originalAssignedTo = record.originalAssignedTo || record.orderAssignedTo || "Unassigned";

    if (completedOperator) {
      record.assignedTo = completedOperator;
    }

    if (record.stage === 'printing' && Number.isFinite(producedMeters) && producedMeters > 0) {
      record.printingProducedMeters = producedMeters;
      record.printingCompletedAt = completedTimestamp;
    }

    record.lastProducedMeters = Number.isFinite(producedMeters) && producedMeters > 0 ? producedMeters : '';
    record.lastWasteMeters = wasteMeters > 0 ? wasteMeters : '';
    record.lastCompletedOperator = completedOperator;

    const completionDescription = [
      `${completedStageLabel} was completed${producedMetersText ? ` for ${producedMetersText}` : ''}.`,
      printingBalanceMetersText ? `${printingBalanceMetersText} remained in ${getStageLabel(defaultProductionStage)}.` : '',
      wasteMetersText ? `Waste recorded: ${wasteMetersText}.` : '',
      nextStage === 'completed'
        ? 'Production is complete.'
        : `Item is ready for ${getStageLabel(nextStage)}.`
    ].filter(Boolean).join(' ');

    appendProductionActionHistory(
      record,
      `${completedStageLabel} Completed`,
      completionDescription,
      completedTimestamp,
      {
        eventType: "stage-completed",
        operators: completedOperator,
        meters: producedMeters,
        wasteMeters,
        batchLabel: completedBatchLabel,
        sourceBatches: Array.isArray(record.sourceBatchDetails) ? record.sourceBatchDetails : []
      }
    );

    const printingBalanceRecord = hasPrintingPartialFinish
      ? createProductionBalanceRecord(
          record,
          printingBalanceMeters,
          producedMeters,
          enteredMeters,
          completedTimestamp,
          currentBatchNumber + 1,
          printingOriginalMeters || enteredMeters
        )
      : null;

    if (nextStage === 'completed') {
      record.status = 'completed';
      record.remarks = completionDescription;
    } else {
      record.stage = nextStage;
      record.status = 'pending';
      record.convertedMeters = Number.isFinite(producedMeters) && producedMeters > 0 ? producedMeters : record.convertedMeters;
      record.convertedMetersDisplay = Number.isFinite(producedMeters) && producedMeters > 0 ? formatProductionMeters(producedMeters) : record.convertedMetersDisplay;
      record.startingMeters = "";
      record.assignedTo = 'Unassigned';
      record.remarks = completionDescription;

      if (isProductionPartialRecord(record)) {
        record.sourceType = "production-partial";
        record.partialKind = "batch";
        record.partialSourceStage = completedStageId;
        record.partialSourceLabel = completedStageLabel;
        record.productionRecordId = "";
      }
    }

    persistProductionStageRecord(record);

    if (printingBalanceRecord) {
      productionReceivingRecords = productionReceivingRecords.concat(printingBalanceRecord);
      persistProductionPartialRecord(printingBalanceRecord);
      markProductionStatusRecordAsUnread(printingBalanceRecord, {
        rerender: false,
        stageId: printingBalanceRecord.stage || defaultProductionStage
      });
    }

    if (record.status !== 'completed') {
      markProductionStatusRecordAsUnread(record, {
        rerender: false,
        stageId: record.stage || activeProductionStage
      });
    }

    updateProductionReceivingCounts();
    renderProductionReceivingList();
    closeMoveStageModal();
    closeProductionReceivingModal();
    dispatchProductionOverviewRefresh();
  }

  function holdRecord(recordId, holdDetails = {}) {
    const record = findRecord(recordId);
    if (!record) return;

    const holdTimestamp = formatProductionNow();
    const stageLabel = getStageLabel(record.stage);
    const holdReason = String(holdDetails.holdReason || '').trim() || `${stageLabel} was placed on hold.`;
    const holdRemarks = String(holdDetails.remarks || '').trim();
    const holdDescription = [
      `Hold reason: ${holdReason}`,
      holdRemarks ? `Remarks: ${holdRemarks}` : ''
    ].filter(Boolean).join(' ');

    record.status = 'hold';
    record.dateEntered = holdTimestamp;
    record.holdReason = holdReason;
    record.remarks = holdRemarks || `${stageLabel} is on hold. Reason: ${holdReason}`;
    appendProductionActionHistory(
      record,
      `Hold ${stageLabel}`,
      holdDescription,
      holdTimestamp,
      { eventType: "stage-hold" }
    );
    persistProductionStageRecord(record);
    markProductionStatusRecordAsUnread(record, {
      rerender: false,
      stageId: record.stage || activeProductionStage
    });

    updateProductionReceivingCounts();
    renderProductionReceivingList();
    closeProductionReceivingModal();
    dispatchProductionOverviewRefresh();
  }

  function resumeRecord(recordId) {
    const record = findRecord(recordId);
    if (!record) return;

    const resumeTimestamp = formatProductionNow();

    record.status = 'ongoing';
    record.dateEntered = resumeTimestamp;
    record.holdReason = '';
    record.remarks = `${getStageLabel(record.stage)} resumed.`;
    appendProductionActionHistory(
      record,
      `Resume ${getStageLabel(record.stage)}`,
      `${getStageLabel(record.stage)} resumed.`,
      resumeTimestamp,
      { eventType: "stage-resumed" }
    );
    persistProductionStageRecord(record);
    markProductionStatusRecordAsUnread(record, {
      rerender: false,
      stageId: record.stage || activeProductionStage
    });

    updateProductionReceivingCounts();
    renderProductionReceivingList();
    closeProductionReceivingModal();
    dispatchProductionOverviewRefresh();
  }

  function getModalAction(record) {
    if (isProductionStatusView() || record.sourceType === "orders-pending" || !productionCurrentUserCanUpdateProduction()) return null;

    if (record.status === 'pending') {
      if (isFinishingReadyForDeliveryRecord(record)) {
        return {
          label: 'Move to Delivery',
          className: 'success',
          handler: () => openFinishingDeliveryModal(record.id)
        };
      }

      if (isManualStartPendingRecord(record)) return null;

      return {
        label: `Start ${getStageLabel(record.stage)}`,
        className: 'primary',
        handler: () => startRecord(record.id)
      };
    }

    if (record.status === 'ongoing') {
      return null;
    }

    return {
      label: `Resume ${getStageLabel(record.stage)}`,
      className: 'success',
      handler: () => resumeRecord(record.id)
    };
  }

  function resetProductionDetailsModalPosition(backdrop, bodyElement) {
    const scrollTargets = [
      bodyElement,
      bodyElement?.closest?.('.pr-modal-body'),
      backdrop?.querySelector?.('.pr-modal'),
      backdrop
    ].filter(Boolean);

    const resetTarget = (target) => {
      try {
        target.scrollTop = 0;
        target.scrollLeft = 0;
      } catch (error) {
        /* Ignore non-scrollable targets. */
      }
    };

    scrollTargets.forEach(resetTarget);
    window.requestAnimationFrame(() => scrollTargets.forEach(resetTarget));
  }

  function openProductionReceivingModal(recordId) {
    const record = findRecord(recordId);
    if (!record || !modalBackdrop || !modalBody || !modalTitle || !modalSubTitle || !modalPrimaryAction) return;

    const details = getActualStatusDetails(record);
    const action = getModalAction(record);
    const modalDeliveryAlert = getProductionDeliveryAlert(record);
    const modalDeliveryAlertClass = modalDeliveryAlert.boxClass ? ` ${modalDeliveryAlert.boxClass}` : "";
    activeProductionReceivingModalRecordId = record.id;

    modalTitle.textContent = record.item || 'Production Details';
    modalSubTitle.textContent = `${record.poNumber || '—'} • ${record.joNumber || '—'}`;

    if (action) {
      modalPrimaryAction.hidden = false;
      modalPrimaryAction.textContent = action.label;
      modalPrimaryAction.className = `pr-action-btn ${action.className}`;
    } else {
      modalPrimaryAction.hidden = true;
      modalPrimaryAction.textContent = '';
      modalPrimaryAction.className = 'pr-action-btn';
    }

    modalBody.innerHTML = `
      <div class="pr-modal-grid">
        ${createProductionDetailsFields(record, modalDeliveryAlert, modalDeliveryAlertClass)}
        ${createProductionHistoryHTML(record)}
      </div>
    `;

    resetProductionDetailsModalPosition(modalBackdrop, modalBody);
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pr-modal-open');
    resetProductionDetailsModalPosition(modalBackdrop, modalBody);
  }

  function closeProductionReceivingModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('show');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pr-modal-open');
    activeProductionReceivingModalRecordId = null;
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeProductionReceivingStatus = button.dataset.prTab;
      renderProductionReceivingList();
      document.dispatchEvent(new CustomEvent('system:reset-default-position'));
    });
  });

  productionNavParent?.addEventListener('click', handleProductionParentClick, true);

  document.addEventListener('click', (event) => {
    const productionStatusLink = event.target.closest('[data-production-status-link]');
    const productionToggle = event.target.closest('[data-production-nav-toggle]');
    const stageLink = event.target.closest('[data-production-stage-link]');
    const viewLink = event.target.closest('[data-view-target]');

    if (productionStatusLink) {
      event.preventDefault();
      setProductionDropdownOpen(false);
      showProductionStatusView({
        resetStatus: true,
        revealView: true,
        openDropdown: false
      });
      document.dispatchEvent(new CustomEvent('system:reset-default-position'));
      document.dispatchEvent(new CustomEvent('system:reset-default-position'));
      closeMobileSidebarAfterProductionClick();
      return;
    }

    if (productionToggle) {
      handleProductionParentClick(event);
      return;
    }

    if (stageLink) {
      event.preventDefault();
      setProductionDropdownOpen(true);
      setActiveProductionStage(stageLink.dataset.productionStageLink, {
        resetStatus: true,
        revealView: true,
        openDropdown: true
      });
      closeMobileSidebarAfterProductionClick();
      return;
    }

    if (viewLink && viewLink.dataset.viewTarget !== 'production-receiving') {
      productionStatusNavLink?.classList.remove('active');
      productionNavGroup?.classList.remove('is-active');
      productionNavParent?.classList.remove('active');
      setProductionDropdownOpen(false);
      productionStageLinks.forEach((link) => {
        link.classList.remove('active');
        link.setAttribute('aria-current', 'false');
      });
    }
  });

  searchInput?.addEventListener('input', (event) => {
    productionReceivingSearchText = event.target.value;
    renderProductionReceivingList();
  });

  dateRangeButton?.addEventListener('click', openDateRangeModal);

  dateApplyButton?.addEventListener('click', () => {
    productionReceivingDateFrom = dateFromInput?.value || '';
    productionReceivingDateTo = dateToInput?.value || '';

    updateDateRangeSummary();
    renderProductionReceivingList();
    closeDateRangeModal();
  });

  dateClearButton?.addEventListener('click', () => {
    clearProductionReceivingDateRange({ keepModalOpen: true });
  });

  dateModalBackdrop?.querySelector('.pr-date-modal-close')?.addEventListener('click', closeDateRangeModal);

  clearButton?.addEventListener('click', () => {
    productionReceivingSearchText = '';
    if (searchInput) searchInput.value = '';
    clearProductionReceivingDateRange();
  });

  productionStageView.addEventListener('click', (event) => {
    const detailsButton = event.target.closest('[data-pr-details]');
    const takeButton = event.target.closest('[data-pr-take]');
    const startButton = event.target.closest('[data-pr-start]');
    const moveButton = event.target.closest('[data-pr-move]');
    const deliveryButton = event.target.closest('[data-pr-delivery]');
    const holdButton = event.target.closest('[data-pr-hold]');
    const resumeButton = event.target.closest('[data-pr-resume]');
    const clickableStatusCard = event.target.closest('[data-pr-card-details]');

    if (detailsButton) {
      markProductionStatusRecordAsRead(detailsButton.dataset.prDetails, { rerender: true });
      openProductionReceivingModal(detailsButton.dataset.prDetails);
      return;
    }

    if (clickableStatusCard && !event.target.closest('button, a, input, select, textarea, label')) {
      markProductionStatusRecordAsRead(clickableStatusCard.dataset.prCardDetails, { rerender: true });
      openProductionReceivingModal(clickableStatusCard.dataset.prCardDetails);
      return;
    }

    if (takeButton) {
      if (!productionCurrentUserCanUpdateProduction()) return;
      markProductionStatusRecordAsRead(takeButton.dataset.prTake, { rerender: false });
      openTakeOrderModal(takeButton.dataset.prTake);
      return;
    }

    if (startButton) {
      if (!productionCurrentUserCanUpdateProduction()) return;
      const record = findRecord(startButton.dataset.prStart);
      markProductionStatusRecordAsRead(startButton.dataset.prStart, { rerender: false });

      if (isManualStartPendingRecord(record)) {
        openStartStageModal(startButton.dataset.prStart);
      } else {
        startRecord(startButton.dataset.prStart);
      }

      return;
    }

    if (deliveryButton) {
      if (!productionCurrentUserCanUpdateProduction()) return;
      markProductionStatusRecordAsRead(deliveryButton.dataset.prDelivery, { rerender: false });
      openFinishingDeliveryModal(deliveryButton.dataset.prDelivery);
      return;
    }

    if (moveButton) {
      if (!productionCurrentUserCanUpdateProduction()) return;
      markProductionStatusRecordAsRead(moveButton.dataset.prMove, { rerender: false });
      openMoveStageModal(moveButton.dataset.prMove);
      return;
    }

    if (holdButton) {
      if (!productionCurrentUserCanUpdateProduction()) return;
      markProductionStatusRecordAsRead(holdButton.dataset.prHold, { rerender: false });
      openHoldStageModal(holdButton.dataset.prHold);
      return;
    }

    if (resumeButton) {
      if (!productionCurrentUserCanUpdateProduction()) return;
      markProductionStatusRecordAsRead(resumeButton.dataset.prResume, { rerender: false });
      resumeRecord(resumeButton.dataset.prResume);
    }
  });

  productionStageView.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const clickableStatusCard = event.target.closest('[data-pr-card-details]');
    if (!clickableStatusCard) return;

    event.preventDefault();
    markProductionStatusRecordAsRead(clickableStatusCard.dataset.prCardDetails, { rerender: true });
    openProductionReceivingModal(clickableStatusCard.dataset.prCardDetails);
  });

  modalBackdrop?.querySelector('.pr-modal-close')?.addEventListener('click', closeProductionReceivingModal);
  modalBackdrop?.querySelector('.pr-modal-secondary')?.addEventListener('click', closeProductionReceivingModal);

  modalPrimaryAction?.addEventListener('click', () => {
    if (!activeProductionReceivingModalRecordId) return;
    const record = findRecord(activeProductionReceivingModalRecordId);
    if (!record) return;

    const action = getModalAction(record);
    if (!action) return;

    markProductionStatusRecordAsRead(record.id, { rerender: false });
    action.handler();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (modalBackdrop?.classList.contains('show')) {
      closeProductionReceivingModal();
    }

    if (dateModalBackdrop?.classList.contains('show')) {
      closeDateRangeModal();
    }

    if (deliveryDateModal?.classList.contains('show')) {
      closeDeliveryDateRangeModal();
    }

    const takeModal = document.getElementById('productionTakeOrderModal');
    if (takeModal?.classList.contains('show')) {
      closeTakeOrderModal();
    }

    const moveModal = document.getElementById('productionMoveStageModal');
    if (moveModal?.classList.contains('show')) {
      closeMoveStageModal();
    }

    const finishingDeliveryModal = document.getElementById('productionFinishingDeliveryModal');
    if (finishingDeliveryModal?.classList.contains('show')) {
      closeFinishingDeliveryModal();
    }

    if (deliveryDetailsModal?.classList.contains('show')) {
      closeDeliveryDetailsModal();
    }
  });

  document.addEventListener('system:orders-list-rendered', scheduleProductionReceivingRefresh);
  document.addEventListener('system:notifications-refresh', scheduleProductionReceivingRefresh);
  document.addEventListener('system:production-live-refresh', scheduleProductionReceivingRefresh);

  initDeliveryView();
  ensureProductionTabStructure();
  updateDateRangeSummary();

  /* Centralized source is registered immediately so Overview never falls back to a stale production snapshot. */
  window.unifiedProductionRecords = [];
  window.productionUnifiedRecords = [];
  window.productionStatusListRecords = [];
  window.getUnifiedProductionRecords = (options = {}) => getUnifiedProductionRecords(options);
  window.getProductionStatusListRecords = (options = {}) => getProductionStatusListRecords(options);
  window.productionStatusOverviewRecords = [];
  window.getProductionStatusOverviewRecords = (options = {}) => getProductionStatusListRecords(options);

  showProductionStatusView({ resetStatus: true, revealView: false });
  loadProductionReceivingRecords();
})();


/* ===== DELIVERY UPDATE V9 RUNTIME GUARD: FORCE DELIVERIES CONTROLS TO RIGHT SIDE ===== */
(function enforceDeliveryToolbarLayoutV9() {
  const styleId = 'delivery-toolbar-layout-v9-style';
  const styleText = `
    .deliveries-view .delivery-page-head,
    .deliveries-view .delivery-refresh-btn { display: none !important; }

    @media (min-width: 901px) {
      .deliveries-view .delivery-board,
      .deliveries-view .pr-board.delivery-board {
        display: grid !important;
        grid-template-columns: max-content minmax(0, 1fr) !important;
        align-items: end !important;
        column-gap: 12px !important;
        row-gap: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      .deliveries-view .delivery-tab-toolbar-row {
        grid-column: 1 / -1 !important;
        grid-row: 1 !important;
        display: grid !important;
        grid-template-columns: max-content minmax(0, 1fr) !important;
        align-items: end !important;
        column-gap: 12px !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      .deliveries-view .delivery-tab-toolbar-row .delivery-folder-tabs,
      .deliveries-view .delivery-board > .delivery-folder-tabs {
        grid-column: 1 !important;
        grid-row: 1 !important;
        justify-self: start !important;
        align-self: end !important;
        width: auto !important;
        min-width: max-content !important;
        max-width: none !important;
        margin: 0 0 10px 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }

      .deliveries-view .delivery-tab-toolbar-row .delivery-toolbar,
      .deliveries-view .delivery-board > .delivery-toolbar {
        grid-column: 2 !important;
        grid-row: 1 !important;
        justify-self: end !important;
        align-self: end !important;
        display: grid !important;
        grid-template-columns: minmax(260px, 340px) auto auto !important;
        align-items: center !important;
        justify-content: end !important;
        gap: 10px !important;
        width: min(100%, 560px) !important;
        min-width: 0 !important;
        max-width: 560px !important;
        margin: 0 0 10px auto !important;
        padding: 0 !important;
        overflow: visible !important;
      }

      .deliveries-view .delivery-toolbar .pr-search {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        min-height: 48px !important;
      }

      .deliveries-view .delivery-toolbar .pr-filter-btn,
      .deliveries-view .delivery-toolbar .pr-clear-btn {
        width: auto !important;
        min-width: max-content !important;
        min-height: 48px !important;
        white-space: nowrap !important;
      }

      .deliveries-view .delivery-folder-body,
      .deliveries-view .delivery-board > .pr-folder-body {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
        width: 100% !important;
        margin-top: 0 !important;
      }
    }

    @media (min-width: 901px) and (max-width: 1180px) {
      .deliveries-view .delivery-tab-toolbar-row .delivery-toolbar,
      .deliveries-view .delivery-board > .delivery-toolbar {
        width: min(100%, 500px) !important;
        max-width: 500px !important;
        grid-template-columns: minmax(200px, 280px) auto auto !important;
        gap: 8px !important;
      }
    }

    @media (max-width: 900px) {
      .deliveries-view .delivery-board,
      .deliveries-view .delivery-tab-toolbar-row {
        display: grid !important;
        grid-template-columns: 1fr !important;
        row-gap: 12px !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      .deliveries-view .delivery-folder-tabs {
        grid-column: 1 !important;
        grid-row: 1 !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin: 0 0 8px 0 !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
      }

      .deliveries-view .delivery-toolbar {
        grid-column: 1 !important;
        grid-row: 2 !important;
        display: grid !important;
        grid-template-columns: 1fr auto auto !important;
        align-items: center !important;
        gap: 10px !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 0 10px 0 !important;
      }

      .deliveries-view .delivery-toolbar .pr-search {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
      }

      .deliveries-view .delivery-folder-body {
        grid-column: 1 !important;
        grid-row: 3 !important;
      }
    }

    @media (max-width: 560px) {
      .deliveries-view .delivery-toolbar { grid-template-columns: 1fr !important; }
      .deliveries-view .delivery-toolbar .pr-filter-btn,
      .deliveries-view .delivery-toolbar .pr-clear-btn { width: 100% !important; }
    }
  `;

  function injectDeliveryLayoutStyle() {
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    if (style.textContent !== styleText) {
      style.textContent = styleText;
    }
  }

  function normalizeDeliveryLayoutStructure() {
    const deliveryView = document.querySelector('[data-view="deliveries"]');
    const deliveryBoard = deliveryView?.querySelector('.delivery-board');
    const toolbar = deliveryView?.querySelector('#deliverySearchInput')?.closest('.delivery-toolbar, .pr-toolbar');
    const tabs = deliveryView?.querySelector('.delivery-folder-tabs');
    const body = deliveryView?.querySelector('.delivery-folder-body, .pr-folder-body');

    if (!deliveryView || !deliveryBoard || !toolbar || !tabs) return;

    deliveryView.querySelector('.delivery-page-head')?.remove();
    deliveryView.querySelector('#deliveryRefreshBtn')?.remove();

    let row = deliveryView.querySelector('.delivery-tab-toolbar-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'delivery-tab-toolbar-row';
      deliveryBoard.insertBefore(row, body || deliveryBoard.firstChild);
    }

    row.dataset.deliveryLayout = 'v9';

    if (tabs.parentElement !== row) row.appendChild(tabs);
    if (toolbar.parentElement !== row) row.appendChild(toolbar);
  }

  function applyDeliveryLayoutPatch() {
    injectDeliveryLayoutStyle();
    normalizeDeliveryLayoutStructure();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDeliveryLayoutPatch);
  } else {
    applyDeliveryLayoutPatch();
  }

  window.addEventListener('load', applyDeliveryLayoutPatch);
  window.addEventListener('pageshow', applyDeliveryLayoutPatch);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-view-target="deliveries"]')) {
      window.setTimeout(applyDeliveryLayoutPatch, 0);
      window.setTimeout(applyDeliveryLayoutPatch, 120);
    }
  });
  document.addEventListener('system:delivery-records-updated', applyDeliveryLayoutPatch);
})();
