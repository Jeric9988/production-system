(function initMaterialsPage() {
  const materialsView = document.querySelector('[data-view="materials"]');
  if (!materialsView) return;

  const MATERIALS_API_BASE = "/api/materials";

  const listContainer = document.getElementById("materialsListContainer");
  const searchInput = document.getElementById("materialsSearchInput");
  const categoryFilter = document.getElementById("materialsCategoryFilter");
  const clearBtn = document.getElementById("materialsClearBtn");
  const newBtn = document.getElementById("materialsNewBtn");

  const formModal = document.getElementById("materialsFormModal");
  const formModalCloseBtn = document.getElementById("materialsModalCloseBtn");
  const formModalCancelBtn = document.getElementById("materialsModalCancelBtn");
  const form = document.getElementById("materialsForm");
  const formFeedback = document.getElementById("materialsFormFeedback");

  const issueModal = document.getElementById("materialsIssueModal");
  const issueModalCloseBtn = document.getElementById("materialsIssueModalCloseBtn");
  const issueModalCancelBtn = document.getElementById("materialsIssueCancelBtn");
  const issueForm = document.getElementById("materialsIssueForm");
  const issueFeedback = document.getElementById("materialsIssueFeedback");

  const totalCountEl = document.getElementById("materialsTotalCount");
  const lowStockCountEl = document.getElementById("materialsLowStockCount");

  let latestMaterials = [];
  let isFormSubmitting = false;

  function getStoredUser() {
    const keys = ["currentUser", "loggedInUser", "activeUser", "user"];
    for (const key of keys) {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) continue;
      try {
        const parsed = JSON.parse(rawValue);
        if (parsed?.username) return parsed;
      } catch (e) {}
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

  async function apiCall(url, options = {}) {
    const response = await fetch(url, {
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "Materials request failed.");
    }
    return data;
  }

  function escapeHTML(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function getCategoryLabel(cat) {
    if (cat === "printing") return "Printing Material";
    if (cat === "lamination") return "Lamination Material";
    return "General";
  }

  function renderList() {
    if (!listContainer) return;

    const totalCount = latestMaterials.length;
    let lowStockCount = 0;

    latestMaterials.forEach(m => {
      if (Number(m.stock) <= Number(m.criticalLevel)) lowStockCount++;
    });

    if (totalCountEl) totalCountEl.textContent = String(totalCount);
    if (lowStockCountEl) lowStockCountEl.textContent = String(lowStockCount);

    if (!totalCount) {
      listContainer.innerHTML = `
        <div class="materials-empty-state">
          <strong>No materials found</strong>
          <span>Click Add Material to register new inventory items.</span>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = latestMaterials.map(m => {
      const isLow = Number(m.stock) <= Number(m.criticalLevel);
      const stockStyle = isLow ? 'style="color: #ef4444; font-weight: 800;"' : '';
      const canEdit = ["admin", "manager", "logistics"].includes(getStoredUser()?.role);
      const actionButtons = canEdit ? `
        <button class="settings-primary-btn" type="button" data-issue-id="${m.id}" style="padding: 6px 12px; min-height: 32px; font-size: 0.8rem; background: #f97316;">Issue</button>
        <button class="settings-edit-btn" type="button" data-edit-id="${m.id}" style="padding: 6px 12px; min-height: 32px; font-size: 0.8rem;">Edit</button>
        <button class="settings-danger-btn" type="button" data-delete-id="${m.id}" style="padding: 6px 12px; min-height: 32px; font-size: 0.8rem;">Delete</button>
      ` : '—';

      return `
        <div class="materials-row">
          <strong>${escapeHTML(m.name)}</strong>
          <span>${escapeHTML(getCategoryLabel(m.category))}</span>
          <span ${stockStyle}>${escapeHTML(m.stock)} ${escapeHTML(m.unit)}</span>
          <span>${escapeHTML(m.criticalLevel)} ${escapeHTML(m.unit)}</span>
          <div class="materials-actions-cell">${actionButtons}</div>
        </div>
      `;
    }).join("");
  }

  async function loadMaterials() {
    try {
      const search = searchInput?.value.trim() || "";
      const cat = categoryFilter?.value || "all";
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (cat !== "all") q.set("category", cat);

      const data = await apiCall(`${MATERIALS_API_BASE}?${q.toString()}`);
      latestMaterials = data.materials || [];
      renderList();
    } catch (e) {
      if (listContainer) {
        listContainer.innerHTML = `<div class="materials-empty-state"><strong>Error loading materials</strong><span>${escapeHTML(e.message)}</span></div>`;
      }
    }
  }

  function showFormModal(mode, material = null) {
    if (!formModal) return;
    const titleEl = document.getElementById("materialsModalTitle");
    if (titleEl) titleEl.textContent = mode === "edit" ? "Edit Material" : "Add Material";

    document.getElementById("materialId").value = mode === "edit" ? material.id : "";
    document.getElementById("materialName").value = mode === "edit" ? material.name : "";
    document.getElementById("materialCategory").value = mode === "edit" ? material.category : "printing";
    document.getElementById("materialStock").value = mode === "edit" ? material.stock : "0";
    document.getElementById("materialUnit").value = mode === "edit" ? material.unit : "kgs";
    document.getElementById("materialCriticalLevel").value = mode === "edit" ? material.criticalLevel : "0";

    if (formFeedback) formFeedback.hidden = true;
    formModal.classList.add("show");
    formModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("pr-modal-open");
  }

  function closeFormModal() {
    if (!formModal) return;
    formModal.classList.remove("show");
    formModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pr-modal-open");
    form?.reset();
  }

  function showIssueModal(material) {
    if (!issueModal) return;
    document.getElementById("materialsIssueModalSubTitle").textContent = `Stock out for ${material.name}`;
    document.getElementById("issueMaterialId").value = material.id;
    document.getElementById("issueQuantity").value = "";
    document.getElementById("issueJoNumber").value = "";
    document.getElementById("issueIssuedTo").value = "";
    document.getElementById("issueDate").value = new Date().toISOString().split("T")[0];

    if (issueFeedback) issueFeedback.hidden = true;
    issueModal.classList.add("show");
    issueModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("pr-modal-open");
  }

  function closeIssueModal() {
    if (!issueModal) return;
    issueModal.classList.remove("show");
    issueModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pr-modal-open");
    issueForm?.reset();
  }

  newBtn?.addEventListener("click", () => showFormModal("add"));
  formModalCloseBtn?.addEventListener("click", closeFormModal);
  formModalCancelBtn?.addEventListener("click", closeFormModal);
  issueModalCloseBtn?.addEventListener("click", closeIssueModal);
  issueModalCancelBtn?.addEventListener("click", closeIssueModal);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isFormSubmitting) return;

    const id = document.getElementById("materialId").value;
    const name = document.getElementById("materialName").value.trim();
    const category = document.getElementById("materialCategory").value;
    const stock = Number(document.getElementById("materialStock").value);
    const unit = document.getElementById("materialUnit").value;
    const criticalLevel = Number(document.getElementById("materialCriticalLevel").value);

    if (!name) {
      if (formFeedback) { formFeedback.textContent = "Material name is required."; formFeedback.hidden = false; }
      return;
    }

    isFormSubmitting = true;
    if (formFeedback) formFeedback.hidden = true;

    try {
      const url = id ? `${MATERIALS_API_BASE}/${id}` : MATERIALS_API_BASE;
      const method = id ? "PUT" : "POST";
      await apiCall(url, {
        method,
        body: JSON.stringify({ name, category, stock, unit, criticalLevel })
      });
      closeFormModal();
      loadMaterials();
    } catch (err) {
      if (formFeedback) { formFeedback.textContent = err.message; formFeedback.hidden = false; }
    } finally {
      isFormSubmitting = false;
    }
  });

  issueForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isFormSubmitting) return;

    const id = document.getElementById("issueMaterialId").value;
    const quantity = Number(document.getElementById("issueQuantity").value);
    const joNumber = document.getElementById("issueJoNumber").value.trim();
    const issuedTo = document.getElementById("issueIssuedTo").value.trim();
    const date = document.getElementById("issueDate").value;

    if (quantity <= 0) {
      if (issueFeedback) { issueFeedback.textContent = "Quantity must be greater than zero."; issueFeedback.hidden = false; }
      return;
    }

    isFormSubmitting = true;
    if (issueFeedback) issueFeedback.hidden = true;

    try {
      await apiCall(`${MATERIALS_API_BASE}/${id}/issue`, {
        method: "POST",
        body: JSON.stringify({ quantity, joNumber, issuedTo, date })
      });
      closeIssueModal();
      loadMaterials();
    } catch (err) {
      if (issueFeedback) { issueFeedback.textContent = err.message; issueFeedback.hidden = false; }
    } finally {
      isFormSubmitting = false;
    }
  });

  listContainer?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit-id]");
    const deleteBtn = e.target.closest("[data-delete-id]");
    const issueBtn = e.target.closest("[data-issue-id]");

    if (editBtn) {
      const id = Number(editBtn.dataset.editId);
      const item = latestMaterials.find(m => m.id === id);
      if (item) showFormModal("edit", item);
    } else if (deleteBtn) {
      const id = Number(deleteBtn.dataset.deleteId);
      const item = latestMaterials.find(m => m.id === id);
      if (!item) return;
      if (!confirm(`Delete material "${item.name}"?`)) return;

      try {
        await apiCall(`${MATERIALS_API_BASE}/${id}`, { method: "DELETE" });
        loadMaterials();
      } catch (err) {
        alert(err.message);
      }
    } else if (issueBtn) {
      const id = Number(issueBtn.dataset.issueId);
      const item = latestMaterials.find(m => m.id === id);
      if (item) showIssueModal(item);
    }
  });

  searchInput?.addEventListener("input", () => {
    clearTimeout(initMaterialsPage.timer);
    initMaterialsPage.timer = setTimeout(loadMaterials, 250);
  });

  categoryFilter?.addEventListener("change", loadMaterials);
  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    loadMaterials();
  });

  document.querySelector('[data-view-target="materials"]')?.addEventListener("click", () => {
    loadMaterials();
  });

  if (materialsView.classList.contains("active-view")) {
    loadMaterials();
  }
})();
