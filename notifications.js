/* ===== DELIVERY UPDATE V5: NEW badge only, delivered side pill stays Delivered; paste this whole content to notifications.js ===== */
/* ===== NOTIFICATIONS MODULE - ISOLATED ===== */

(function initNotificationsModule() {
  const NOTIFICATION_API_BASE = "/api/notifications";
  const notificationRefreshDelay = 350;
  let notificationRefreshTimer = null;
  let latestOrderUnreadRecords = new Map();
  let latestDeliveryUnreadRecords = new Map();
  let isRefreshingNotifications = false;

  function getNotificationUserId() {
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

  async function requestNotificationsApi(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": getNotificationUserId(),
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
      throw new Error(data?.error || "Notification request failed.");
    }

    return data;
  }

  function ensureBadge(parent, className, dataAttributeName, dataAttributeValue) {
    if (!parent) return null;

    let badge = parent.querySelector(`[${dataAttributeName}="${dataAttributeValue}"]`);
    if (badge) return badge;

    badge = document.createElement("span");
    badge.className = className;
    badge.setAttribute(dataAttributeName, dataAttributeValue);
    parent.appendChild(badge);

    return badge;
  }

  function setBadgeCount(badge, count) {
    if (!badge) return;

    const safeCount = Number(count || 0);
    badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
    badge.hidden = safeCount <= 0;
  }

  function updateOrdersNavigationBadge() {
    const ordersNavItem = document.querySelector('[data-view-target="orders"]');
    if (!ordersNavItem) return;

    // Orders sidebar notification badge is intentionally removed.
    // Order List now uses a normal item counter, while card-level NEW/UPDATED
    // badges remain inside the Orders list only.
    ordersNavItem
      .querySelectorAll('[data-notification-badge="orders"], .notification-nav-badge')
      .forEach((badge) => badge.remove());
  }

  function updateOrdersTabBadge() {
    const orderListTab = document.querySelector('[data-orders-tab="list"]');
    if (!orderListTab) return;

    orderListTab
      .querySelectorAll('[data-notification-tab-badge="orders"], .notification-tab-badge')
      .forEach((badge) => badge.remove());
  }


  function updateDeliveryNavigationBadge(count = 0) {
    const deliveryNavItem = document.querySelector('[data-view-target="deliveries"]');
    if (!deliveryNavItem) return;

    const badge = ensureBadge(
      deliveryNavItem,
      "notification-nav-badge delivery-nav-badge",
      "data-notification-badge",
      "delivery"
    );

    setBadgeCount(badge, count);
  }

  function updateDeliveryTabBadge(tabName = "delivery", count = 0) {
    const safeTabName = String(tabName || "delivery").trim() || "delivery";
    const deliveryTab = document.querySelector(`[data-delivery-tab="${safeTabName}"]`);
    if (!deliveryTab) return;

    const badge = ensureBadge(
      deliveryTab,
      `notification-tab-badge delivery-tab-notification-badge delivery-tab-notification-badge-${safeTabName}`,
      "data-notification-tab-badge",
      safeTabName
    );

    setBadgeCount(badge, count);
  }

  function getDeliveryUnreadCounts() {
    const counts = {
      delivery: 0,
      delivered: 0,
      total: 0
    };

    latestDeliveryUnreadRecords.forEach((record) => {
      const eventType = String(record?.eventType || "").trim().toLowerCase();

      if (eventType === "delivered") {
        counts.delivered += 1;
      } else {
        counts.delivery += 1;
      }
    });

    counts.total = counts.delivery + counts.delivered;
    return counts;
  }

  function syncDeliveryNotificationBadges() {
    const counts = getDeliveryUnreadCounts();
    updateDeliveryNavigationBadge(counts.total);
    updateDeliveryTabBadge("delivery", counts.delivery);
    updateDeliveryTabBadge("delivered", counts.delivered);
    return counts;
  }

  function getOrderBadgeLabel(record) {
    if (!record) return "NEW";

    if (record.eventType === "updated") return "UPDATED";
    return "NEW";
  }

  function clearOrdersCardBadges() {
    document.querySelectorAll(".orders-data-card").forEach((card) => {
      card.classList.remove("orders-has-unread");
      card.querySelectorAll(".notification-card-badge").forEach((badge) => badge.remove());
    });
  }

  function applyOrdersCardBadges() {
    clearOrdersCardBadges();

    document.querySelectorAll(".orders-data-card[data-order-id]").forEach((card) => {
      const orderId = String(card.dataset.orderId || "");
      const unreadRecord = latestOrderUnreadRecords.get(orderId);

      if (!unreadRecord) return;

      card.classList.add("orders-has-unread");

      const headerTarget = card.querySelector(".orders-data-card-head > div") ||
        card.querySelector(".orders-data-card-head") ||
        card;

      const badge = document.createElement("span");
      badge.className = `notification-card-badge ${unreadRecord.eventType === "updated" ? "updated" : "new"}`;
      badge.textContent = getOrderBadgeLabel(unreadRecord);

      headerTarget.prepend(badge);
    });
  }


  function getDeliveryBadgeLabel(record) {
    if (!record) return "NEW";
    if (record.eventType === "updated") return "UPDATED";
    return "NEW";
  }

  function clearDeliveryCardBadges() {
    document.querySelectorAll(".delivery-record-card").forEach((card) => {
      card.classList.remove("delivery-has-unread");
      card.querySelectorAll(".notification-card-badge").forEach((badge) => badge.remove());

      card.querySelectorAll(".delivery-status-pill[data-delivery-original-label]").forEach((pill) => {
        const originalLabel = pill.getAttribute("data-delivery-original-label") || "Delivered";
        const originalClass = pill.getAttribute("data-delivery-original-class") || "delivery-status-pill delivered";

        pill.textContent = originalLabel;
        pill.className = originalClass;
        pill.removeAttribute("data-delivery-original-label");
        pill.removeAttribute("data-delivery-original-class");
      });
    });
  }

  function applyDeliveryCardBadges() {
    clearDeliveryCardBadges();

    document.querySelectorAll(".delivery-record-card[data-delivery-order-id]").forEach((card) => {
      if (card.closest(".delivery-orders-list")) return;

      const orderId = String(card.dataset.deliveryOrderId || "");
      const unreadRecord = latestDeliveryUnreadRecords.get(orderId);

      if (!unreadRecord) return;

      const eventType = String(unreadRecord.eventType || "").trim().toLowerCase();
      const activeDeliveryTab = card.closest('[data-view="deliveries"]')
        ?.querySelector(".delivery-folder-tab.active")
        ?.dataset.deliveryTab || "";

      if (activeDeliveryTab === "delivery" && eventType === "delivered") return;
      if (activeDeliveryTab === "delivered" && eventType !== "delivered") return;

      card.classList.add("delivery-has-unread");

      const headerTarget = card.querySelector(".pr-record-title") ||
        card.querySelector(".pr-record-top") ||
        card;

      const badge = document.createElement("span");
      badge.className = `notification-card-badge ${eventType === "updated" ? "updated" : "new"}`;
      badge.textContent = getDeliveryBadgeLabel(unreadRecord);

      headerTarget.prepend(badge);
    });
  }

  async function loadOrdersUnreadRecords() {
    const query = new URLSearchParams({
      moduleName: "orders",
      userId: getNotificationUserId()
    }).toString();

    const data = await requestNotificationsApi(`${NOTIFICATION_API_BASE}/unread-records?${query}`);
    latestOrderUnreadRecords = new Map();

    (data.records || []).forEach((record) => {
      latestOrderUnreadRecords.set(String(record.recordId), record);
    });

    applyOrdersCardBadges();
  }


  async function loadDeliveryUnreadRecords() {
    const query = new URLSearchParams({
      moduleName: "delivery",
      userId: getNotificationUserId()
    }).toString();

    const data = await requestNotificationsApi(`${NOTIFICATION_API_BASE}/unread-records?${query}`);
    latestDeliveryUnreadRecords = new Map();

    (data.records || []).forEach((record) => {
      latestDeliveryUnreadRecords.set(String(record.recordId), record);
    });

    const counts = syncDeliveryNotificationBadges();
    applyDeliveryCardBadges();
    return counts;
  }

  async function refreshNotifications() {
    if (isRefreshingNotifications) return;

    isRefreshingNotifications = true;

    try {
      const query = new URLSearchParams({
        userId: getNotificationUserId()
      }).toString();

      const data = await requestNotificationsApi(`${NOTIFICATION_API_BASE}/unread-counts?${query}`);
      const ordersCount = Number(data.counts?.orders || 0);

      updateOrdersNavigationBadge();
      updateOrdersTabBadge(ordersCount);

      const [, deliveryCounts] = await Promise.all([
        loadOrdersUnreadRecords(),
        loadDeliveryUnreadRecords()
      ]);
      const safeDeliveryCounts = deliveryCounts || getDeliveryUnreadCounts();
      const totalCount = ordersCount + safeDeliveryCounts.total;

      document.dispatchEvent(new CustomEvent("system:notifications-updated", {
        detail: {
          ordersCount,
          deliveryCount: safeDeliveryCounts.total,
          deliveryForDeliveryCount: safeDeliveryCounts.delivery,
          deliveryDeliveredCount: safeDeliveryCounts.delivered,
          totalCount
        }
      }));
    } catch (error) {
      // Keep the main system stable even if notifications are not ready yet.
      console.warn("Notifications unavailable:", error.message);
    } finally {
      isRefreshingNotifications = false;
    }
  }

  function scheduleNotificationsRefresh() {
    clearTimeout(notificationRefreshTimer);
    notificationRefreshTimer = setTimeout(refreshNotifications, notificationRefreshDelay);
  }

  async function markRecordNotificationsRead(moduleName, recordId) {
    if (!moduleName || recordId === undefined || recordId === null) return;

    try {
      await requestNotificationsApi(`${NOTIFICATION_API_BASE}/read-record`, {
        method: "POST",
        body: JSON.stringify({
          userId: getNotificationUserId(),
          moduleName,
          recordId: String(recordId)
        })
      });

      if (moduleName === "orders") {
        latestOrderUnreadRecords.delete(String(recordId));
        applyOrdersCardBadges();
      }

      if (moduleName === "delivery") {
        latestDeliveryUnreadRecords.delete(String(recordId));
        syncDeliveryNotificationBadges();
        applyDeliveryCardBadges();
      }

      scheduleNotificationsRefresh();
    } catch (error) {
      console.warn("Unable to mark notification as read:", error.message);
    }
  }

  document.addEventListener("click", (event) => {
    const orderCard = event.target.closest?.(".orders-data-card[data-order-id]");
    if (!orderCard) return;

    markRecordNotificationsRead("orders", orderCard.dataset.orderId);
  });

  document.addEventListener("click", (event) => {
    const deliveryCard = event.target.closest?.(".delivery-record-card[data-delivery-order-id]");
    if (!deliveryCard) return;

    markRecordNotificationsRead("delivery", deliveryCard.dataset.deliveryOrderId);
  });

  document.addEventListener("system:delivery-record-opened", (event) => {
    const orderId = event.detail?.orderId;
    if (!orderId) return;
    markRecordNotificationsRead("delivery", orderId);
  });


  document.addEventListener("system:delivery-list-rendered", () => {
    syncDeliveryNotificationBadges();
    applyDeliveryCardBadges();
  });

  document.addEventListener("system:notifications-refresh", scheduleNotificationsRefresh);
  document.addEventListener("system:live-poll", scheduleNotificationsRefresh);

  document.addEventListener("system:orders-list-rendered", () => {
    window.requestAnimationFrame(applyOrdersCardBadges);
  });

  document.addEventListener("system:delivery-list-rendered", () => {
    window.requestAnimationFrame(applyDeliveryCardBadges);
  });

  // No MutationObserver here. The previous version kept re-triggering itself
  // because it added/removed badge nodes inside the same observed list.
  refreshNotifications();

  // The 7-second refresh is now centralized in script.js to avoid duplicate polling requests.
})();
