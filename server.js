/* ===== SERVER RECENT ACTIVITY ENRICHMENT V15: enrich notification recent activity with order details ===== */
/* ===== DELIVERY ITEM HISTORY V10: records Delivered event in item history; paste to server.js ===== */
/* ===== DELIVERY UPDATE V3: paste this whole content to server.js ===== */
/* ===== DELIVERY UPDATE V12: prevent delivered items returning to production + preserve finishing history ===== */
/* ===== HISTORY UPDATE V21: keep one Finishing Completed only + preserve delivery order ===== */
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { initDatabase, run, get, all, databasePath } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
const allowedUnits = new Set(["pcs", "kgs", "mts"]);
const allowedOrderStatuses = new Set(["pending", "production", "delivery", "delivered", "cancelled"]);
const allowedProductionStages = new Set(["printing", "rewinding", "lamination", "slitting", "finishing"]);
const allowedProductionStageStatuses = new Set(["pending", "ongoing", "hold", "completed"]);

const allowedUserRoles = new Set(["admin", "manager", "supervisor", "logistics", "production_staff", "lockkey_production", "happy_production", "viewer"]);
const assignableProductionRoles = new Set(["production_staff", "lockkey_production", "happy_production"]);
const scopedProductionRoles = new Set(["lockkey_production", "happy_production"]);
const legacyUserRoleMap = {
  boss: "manager",
  order_staff: "logistics",
  delivery_staff: "logistics",
  logistic: "logistics",
  lockkey: "lockkey_production",
  lockkey_production_staff: "lockkey_production",
  happy: "happy_production",
  happy_production_staff: "happy_production"
};
const passwordHashIterations = 120000;
const passwordHashKeyLength = 64;
const passwordHashDigest = "sha512";

const rolePermissions = {
  admin: ["*"],
  manager: [
    "view_overview",
    "view_orders",
    "view_prod_status",
    "view_production",
    "view_delivery",
    "view_activity",
    "view_reports"
  ],
  supervisor: [
    "view_overview",
    "view_prod_status",
    "view_production",
    "update_production",
    "view_activity",
    "view_reports"
  ],
  logistics: [
    "view_overview",
    "view_orders",
    "add_order",
    "update_orders",
    "view_delivery",
    "update_delivery"
  ],
  production_staff: [
    "view_overview",
    "view_prod_status",
    "view_production"
  ],
  lockkey_production: [
    "view_overview",
    "view_prod_status",
    "view_production",
    "update_production"
  ],
  happy_production: [
    "view_overview",
    "view_prod_status",
    "view_production",
    "update_production"
  ],
  viewer: [
    "view_overview"
  ]
};

const defaultUsers = [
  { username: "admin", password: "1234", name: "Admin", role: "admin" },
  { username: "manager", password: "1234", name: "Manager", role: "manager" },
  { username: "logistics", password: "1234", name: "Logistic", role: "logistics" },
  { username: "production", password: "1234", name: "Production Staff", role: "production_staff" },
  { username: "lockkey", password: "1234", name: "Lockkey Production", role: "lockkey_production" },
  { username: "happy", password: "1234", name: "Happy Production", role: "happy_production" },
  { username: "supervisor", password: "1234", name: "Supervisor", role: "supervisor" },
  { username: "viewer", password: "1234", name: "Viewer", role: "viewer" },
  { username: "jeric", password: "1234", name: "Jeric", role: "production_staff" }
];

const activeAuthSessions = new Map();
const authSessionDurationMs = 1000 * 60 * 60 * 12;

function createAuthSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + authSessionDurationMs;

  activeAuthSessions.set(token, {
    username: normalizeUsername(user.username),
    role: normalizeUserRole(user.role),
    createdAt: now,
    expiresAt
  });

  return { token, expiresAt };
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : normalizeText(request.query?.token);
}

async function getAuthSessionStatus(request) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      ok: false,
      code: "NO_SESSION",
      error: "No active session."
    };
  }

  const userRow = await get(
    "SELECT * FROM users WHERE current_session_token = ? AND is_active = 1",
    [token]
  );

  if (!userRow) {
    if (activeAuthSessions.has(token)) activeAuthSessions.delete(token);
    return {
      ok: false,
      code: "SESSION_REPLACED",
      error: "Your account was logged in on another device."
    };
  }

  const expiresAt = Number(userRow.current_session_expires_at || 0);

  if (expiresAt && expiresAt <= Date.now()) {
    if (activeAuthSessions.has(token)) activeAuthSessions.delete(token);

    await run(
      `
        UPDATE users
        SET current_session_token = NULL,
            current_session_started_at = NULL,
            current_session_expires_at = NULL,
            updated_at = ?
        WHERE id = ? AND current_session_token = ?
      `,
      [getPhilippineTimestamp(), userRow.id, token]
    ).catch(() => null);

    return {
      ok: false,
      code: "SESSION_EXPIRED",
      error: "Your session expired. Please sign in again."
    };
  }

  activeAuthSessions.set(token, {
    username: normalizeUsername(userRow.username),
    role: normalizeUserRole(userRow.role),
    createdAt: Date.now(),
    expiresAt: expiresAt || (Date.now() + authSessionDurationMs)
  });

  return {
    ok: true,
    token,
    userRow,
    user: mapUserRow(userRow)
  };
}

async function getRequestUser(request) {
  const token = getBearerToken(request);

  if (token) {
    const sessionStatus = await getAuthSessionStatus(request);
    return sessionStatus.ok ? sessionStatus.user : null;
  }

  /* Development fallback for older local sessions without auth token. */
  const username = normalizeUsername(request.headers["x-user-id"] || request.query?.username);
  if (!username) return null;

  const userRow = await get("SELECT * FROM users WHERE username = ? COLLATE NOCASE", [username]);
  if (!userRow || !userRow.is_active) return null;

  return mapUserRow(userRow);
}

async function requireAdminUser(request, response) {
  const requestUser = await getRequestUser(request);

  if (!requestUser) {
    response.status(401).json({ error: "Please log in again." });
    return null;
  }

  if (requestUser.role !== "admin") {
    response.status(403).json({ error: "Admin access is required." });
    return null;
  }

  return requestUser;
}


app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ===== SAFE CACHE CONTROL FOR ACTIVE DEVELOPMENT ===== */
/*
  Prevents the browser from keeping an old dashboard/login JS or CSS file.
  This is important while we are patching login/session/overlay behavior.
*/
function shouldDisableCacheForRequest(requestPath) {
  return (
    requestPath === "/" ||
    requestPath === "/login" ||
    requestPath === "/login.html" ||
    requestPath === "/dashboard" ||
    requestPath === "/index.html" ||
    requestPath.endsWith(".html") ||
    requestPath.endsWith(".js") ||
    requestPath.endsWith(".css")
  );
}

app.use((request, response, next) => {
  if (shouldDisableCacheForRequest(request.path)) {
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("Surrogate-Control", "no-store");
  }

  next();
});

app.get(["/", "/login", "/login.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "login.html"));
});

app.get(["/dashboard", "/index.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname, {
  index: false,
  etag: false,
  maxAge: 0,
  setHeaders(response, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.setHeader("Pragma", "no-cache");
      response.setHeader("Expires", "0");
      response.setHeader("Surrogate-Control", "no-store");
    }
  }
}));

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  const text = normalizeText(value);
  return text || null;
}


function normalizeUsername(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeUserRole(value) {
  const rawRole = normalizeText(value).toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const role = legacyUserRoleMap[rawRole] || rawRole;
  return allowedUserRoles.has(role) ? role : "production_staff";
}

function getRolePermissions(role) {
  return rolePermissions[normalizeUserRole(role)] || rolePermissions.production_staff;
}

function stringifyPermissions(value) {
  if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean).map(String));
  return JSON.stringify([]);
}

function parsePermissions(value, role) {
  if (!value) return getRolePermissions(role);

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch (error) {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return getRolePermissions(role);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(String(password), salt, passwordHashIterations, passwordHashKeyLength, passwordHashDigest)
    .toString("hex");

  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;

  const actualHash = crypto
    .pbkdf2Sync(String(password), String(salt), passwordHashIterations, passwordHashKeyLength, passwordHashDigest)
    .toString("hex");

  try {
    const actualBuffer = Buffer.from(actualHash, "hex");
    const expectedBuffer = Buffer.from(String(expectedHash), "hex");

    if (actualBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

function mapUserRow(row) {
  if (!row) return null;

  const role = normalizeUserRole(row.role);

  return {
    id: row.id,
    username: row.username,
    name: row.name || row.username,
    role,
    permissions: parsePermissions(row.permissions, role),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

async function ensureUsersTable() {
  const usersTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  const hasUsersTable = Boolean(usersTable);
  const usersTableSql = String(usersTable?.sql || "").toLowerCase();
  const needsUserRoleMigration = hasUsersTable && (
    usersTableSql.includes("'boss'") ||
    usersTableSql.includes("'order_staff'") ||
    usersTableSql.includes("'delivery_staff'") ||
    !usersTableSql.includes("'lockkey_production'") ||
    !usersTableSql.includes("'happy_production'")
  );

  if (needsUserRoleMigration) {
    await run("DROP TABLE IF EXISTS users_legacy_roles_backup");
    await run("ALTER TABLE users RENAME TO users_legacy_roles_backup");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'production_staff' CHECK (role IN ('admin', 'manager', 'supervisor', 'logistics', 'production_staff', 'lockkey_production', 'happy_production', 'viewer')),
      permissions TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      last_login_at TEXT,
      current_session_token TEXT,
      current_session_started_at TEXT,
      current_session_expires_at INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    )
  `);

  if (needsUserRoleMigration) {
    await run(`
      INSERT OR IGNORE INTO users (
        id,
        username,
        password_hash,
        password_salt,
        name,
        role,
        permissions,
        is_active,
        last_login_at,
        current_session_token,
        current_session_started_at,
        current_session_expires_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        username,
        password_hash,
        password_salt,
        CASE
          WHEN lower(username) = 'boss' THEN 'Manager'
          WHEN lower(username) IN ('logistics', 'orders', 'delivery') THEN 'Logistic'
          ELSE name
        END,
        CASE
          WHEN role = 'boss' THEN 'manager'
          WHEN role IN ('logistics', 'order_staff', 'delivery_staff') THEN 'logistics'
          WHEN lower(username) IN ('logistics', 'orders', 'delivery') THEN 'logistics'
          WHEN role IN ('admin', 'manager', 'supervisor', 'production_staff', 'lockkey_production', 'happy_production', 'viewer') THEN role
          ELSE 'production_staff'
        END,
        permissions,
        is_active,
        last_login_at,
        NULL,
        NULL,
        NULL,
        created_at,
        updated_at
      FROM users_legacy_roles_backup
    `);

    await run("DROP TABLE users_legacy_roles_backup");
  }

  const userColumns = await all("PRAGMA table_info(users)");
  const userColumnNames = new Set(userColumns.map((column) => column.name));

  if (!userColumnNames.has("current_session_token")) {
    await run("ALTER TABLE users ADD COLUMN current_session_token TEXT");
  }

  if (!userColumnNames.has("current_session_started_at")) {
    await run("ALTER TABLE users ADD COLUMN current_session_started_at TEXT");
  }

  if (!userColumnNames.has("current_session_expires_at")) {
    await run("ALTER TABLE users ADD COLUMN current_session_expires_at INTEGER");
  }

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_current_session_token ON users(current_session_token)`);

  await run(`
    CREATE TRIGGER IF NOT EXISTS users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
      UPDATE users
      SET updated_at = datetime('now', '+8 hours')
      WHERE id = OLD.id;
    END
  `);
}

async function refreshLegacyUserRoles() {
  const rows = await all("SELECT id, username, role FROM users");

  for (const row of rows) {
    const username = normalizeUsername(row.username);
    const normalizedRole = normalizeUserRole(row.role);
    const nextRole = ["logistics", "orders", "delivery"].includes(username) ? "logistics" : normalizedRole;

    await run(
      "UPDATE users SET role = ?, permissions = ?, updated_at = ? WHERE id = ?",
      [
        nextRole,
        stringifyPermissions(getRolePermissions(nextRole)),
        getPhilippineTimestamp(),
        row.id
      ]
    );
  }

  await run(
    "UPDATE users SET name = ?, role = ?, permissions = ?, updated_at = ? WHERE lower(username) = 'boss'",
    ["Manager", "manager", stringifyPermissions(getRolePermissions("manager")), getPhilippineTimestamp()]
  );

  await run(
    "UPDATE users SET name = ?, role = ?, permissions = ?, updated_at = ? WHERE lower(username) IN ('logistics', 'orders', 'delivery')",
    ["Logistic", "logistics", stringifyPermissions(getRolePermissions("logistics")), getPhilippineTimestamp()]
  );
}
async function insertDefaultUser(user) {
  const username = normalizeUsername(user.username);
  if (!username) return null;

  const existingUser = await get("SELECT id FROM users WHERE username = ? COLLATE NOCASE", [username]);
  if (existingUser) return existingUser;

  const role = normalizeUserRole(user.role);
  const passwordData = createPasswordHash(user.password);

  return run(
    `
      INSERT INTO users (
        username,
        password_hash,
        password_salt,
        name,
        role,
        permissions,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `,
    [
      username,
      passwordData.hash,
      passwordData.salt,
      normalizeText(user.name) || username,
      role,
      stringifyPermissions(getRolePermissions(role))
    ]
  );
}

async function ensureDefaultUsers() {
  await ensureUsersTable();
  await refreshLegacyUserRoles();

  const usersCountRow = await get("SELECT COUNT(*) AS count FROM users");
  const usersCount = Number(usersCountRow?.count || 0);

  /*
    Seed only on first setup.
    Previous behavior re-created manager/logistics/production/supervisor/viewer/jeric
    every time the server restarted after they were deleted from User Management.
  */
  if (usersCount <= 0) {
    for (const user of defaultUsers) {
      await insertDefaultUser(user);
    }
    return;
  }

  /* Keep only the main admin protected for recovery. Non-admin users deleted
     from User Management must stay deleted after restart. */
  const adminUser = await get("SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE");
  if (!adminUser) {
    await insertDefaultUser(defaultUsers[0]);
  }
}

function getPhilippineTimestamp() {
  const philippineDate = new Date(Date.now() + (8 * 60 * 60 * 1000));

  const year = philippineDate.getUTCFullYear();
  const month = String(philippineDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(philippineDate.getUTCDate()).padStart(2, "0");
  const hours = String(philippineDate.getUTCHours()).padStart(2, "0");
  const minutes = String(philippineDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(philippineDate.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function sendDuplicateJoResponse(response) {
  response.status(409).json({
    error: "J.O. Number already exists.",
    field: "joNumber",
    code: "DUPLICATE_JO_NUMBER"
  });
}

function mapOrderRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    joNumber: row.jo_number,
    poNumber: row.po_number,
    client: row.client,
    item: row.item,
    quantity: row.quantity,
    unit: row.unit,
    printingMaterial: row.printing_material,
    laminationMaterial: row.lamination_material,
    assignTo: row.assign_to,
    assignToRole: normalizeUserRole(row.assign_to_role || row.assigned_user_role || "production_staff"),
    deliveryDate: row.delivery_date,
    orderStatus: row.order_status,
    deliveryProcessType: row.delivery_process_type || "",
    deliveryRolls: row.delivery_rolls,
    deliveryTotalKgs: row.delivery_total_kgs,
    deliveryBags: row.delivery_bags,
    deliveryPcsPerBag: row.delivery_pcs_per_bag,
    movedToDeliveryAt: row.moved_to_delivery_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseCompletedStages(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch (error) {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function stringifyCompletedStages(value) {
  if (!Array.isArray(value)) return JSON.stringify([]);
  return JSON.stringify(value.filter(Boolean).map(String));
}

function mapProductionRow(row) {
  if (!row) return null;

  return {
    id: row.production_id,
    orderId: row.order_id,
    stage: row.stage,
    stageStatus: row.stage_status,
    convertedMeters: row.converted_meters,
    printingMaterial: row.production_printing_material || row.printing_material,
    laminationMaterial: row.production_lamination_material || row.lamination_material,
    assignedTo: row.production_assigned_to || "Unassigned",
    orderAssignedTo: row.assign_to,
    assignToRole: normalizeUserRole(row.assign_to_role || row.assigned_user_role || "production_staff"),
    remarks: row.remarks,
    holdReason: row.hold_reason,
    completedStages: parseCompletedStages(row.completed_stages),
    takenAt: row.taken_at,
    updatedAt: row.production_updated_at,
    joNumber: row.jo_number,
    poNumber: row.po_number,
    client: row.client,
    item: row.item,
    quantity: row.quantity,
    unit: row.unit,
    deliveryDate: row.delivery_date,
    orderStatus: row.order_status,
    orderCreatedAt: row.order_created_at,
    orderUpdatedAt: row.order_updated_at
  };
}

async function getProductionRecordById(productionId) {
  return get(
    `
      SELECT
        p.id AS production_id,
        p.order_id,
        p.stage,
        p.stage_status,
        p.converted_meters,
        p.printing_material AS production_printing_material,
        p.lamination_material AS production_lamination_material,
        p.assigned_to AS production_assigned_to,
        p.remarks,
        p.hold_reason,
        p.completed_stages,
        p.taken_at,
        p.updated_at AS production_updated_at,
        o.jo_number,
        o.po_number,
        o.client,
        o.item,
        o.quantity,
        o.unit,
        o.printing_material,
        o.lamination_material,
        o.assign_to,
        ${getOrderAssignmentRoleSql("o")} AS assign_to_role,
        o.delivery_date,
        o.order_status,
        o.created_at AS order_created_at,
        o.updated_at AS order_updated_at
      FROM production_records p
      INNER JOIN orders o ON o.id = p.order_id
      WHERE p.id = ?
    `,
    [productionId]
  );
}

function getNotificationUserId(request) {
  return normalizeText(request.body?.userId) ||
    normalizeText(request.query?.userId) ||
    normalizeText(request.headers["x-user-id"]) ||
    "local-user";
}


function canUserSeeAllProductionAssignments(user) {
  const role = normalizeUserRole(user?.role);
  return ["admin", "manager", "supervisor", "logistics", "production_staff"].includes(role);
}

function canUserUpdateProduction(user) {
  const role = normalizeUserRole(user?.role);
  return ["admin", "supervisor", "lockkey_production", "happy_production"].includes(role);
}

function canUserUpdateDelivery(user) {
  const role = normalizeUserRole(user?.role);
  return ["admin", "manager", "logistics"].includes(role);
}

function normalizePositiveDeliveryNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizePositiveDeliveryInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeDeliveryDetailsPayload(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const processType = normalizeText(source.processType || source.deliveryProcessType || source.type);

  if (!["weighing", "bagging"].includes(processType)) {
    return { error: "Choose a valid delivery process.", field: "processType" };
  }

  if (processType === "weighing") {
    const rolls = normalizePositiveDeliveryInteger(source.rolls ?? source.noOfRolls ?? source.numberOfRolls);
    const totalKgs = normalizePositiveDeliveryNumber(source.totalKgs ?? source.totalKgsWeight ?? source.totalWeight);

    if (!rolls) return { error: "No. of rolls is required.", field: "rolls" };
    if (!totalKgs) return { error: "Total kgs is required.", field: "totalKgs" };

    return {
      value: {
        processType,
        rolls,
        totalKgs,
        bags: null,
        pcsPerBag: null
      }
    };
  }

  const bags = normalizePositiveDeliveryInteger(source.bags ?? source.noOfBags ?? source.numberOfBags);
  const pcsPerBag = normalizePositiveDeliveryInteger(source.pcsPerBag ?? source.piecesPerBag);

  if (!bags) return { error: "No. of bags is required.", field: "bags" };
  if (!pcsPerBag) return { error: "Pcs per bag is required.", field: "pcsPerBag" };

  return {
    value: {
      processType,
      rolls: null,
      totalKgs: null,
      bags,
      pcsPerBag
    }
  };
}

function getScopedProductionRole(user) {
  const role = normalizeUserRole(user?.role);
  return scopedProductionRoles.has(role) ? role : "";
}

function buildAssignmentScopeFilter(user, columnName = "assign_to_role") {
  if (!user || canUserSeeAllProductionAssignments(user)) return { where: "", params: [] };

  const scopedRole = getScopedProductionRole(user);
  if (!scopedRole) return { where: "1 = 0", params: [] };

  return { where: `${columnName} = ?`, params: [scopedRole] };
}

function getOrderAssignmentRoleSql(orderAlias = "o") {
  const alias = orderAlias || "o";
  return `COALESCE(
    NULLIF(${alias}.assign_to_role, ''),
    (
      SELECT users.role
      FROM users
      WHERE lower(users.username) = lower(${alias}.assign_to)
        AND users.is_active = 1
        AND users.role IN ('production_staff', 'lockkey_production', 'happy_production')
      LIMIT 1
    ),
    'production_staff'
  )`;
}

function buildOrderAssignmentScopeFilter(user, orderAlias = "o") {
  return buildAssignmentScopeFilter(user, getOrderAssignmentRoleSql(orderAlias));
}

function buildNotificationAssignmentScopeFilter(user) {
  if (!user || canUserSeeAllProductionAssignments(user)) return { where: "", params: [] };

  const scopedRole = getScopedProductionRole(user);
  if (!scopedRole) return { where: "1 = 0", params: [] };

  return {
    where: `(
      e.module_name NOT IN ('orders', 'production')
      OR (
        e.module_name = 'orders'
        AND EXISTS (
          SELECT 1
          FROM orders o
          WHERE CAST(o.id AS TEXT) = CAST(e.record_id AS TEXT)
            AND o.assign_to_role = ?
        )
      )
      OR (
        e.module_name = 'production'
        AND EXISTS (
          SELECT 1
          FROM production_records p
          INNER JOIN orders o ON o.id = p.order_id
          WHERE CAST(p.id AS TEXT) = CAST(e.record_id AS TEXT)
            AND o.assign_to_role = ?
        )
      )
    )`,
    params: [scopedRole, scopedRole]
  };
}

async function getAssignableProductionUser(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const userRow = await get(
    "SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1",
    [normalizedUsername]
  );

  if (!userRow) return null;

  const role = normalizeUserRole(userRow.role);
  if (!assignableProductionRoles.has(role)) return null;

  return mapUserRow(userRow);
}

async function resolveOrderAssignToRole(assignTo) {
  const assignedUser = await getAssignableProductionUser(assignTo);
  return assignedUser ? assignedUser.role : "";
}

async function backfillOrderAssignToRoles() {
  /*
    Keep existing orders scoped correctly after role/user changes.
    If assign_to matches an active production user, always sync assign_to_role
    from that user's current role. This prevents old Happy/Lockkey orders from
    staying visible under the wrong production scope.
  */
  await run(`
    UPDATE orders
    SET assign_to_role = COALESCE((
      SELECT users.role
      FROM users
      WHERE lower(users.username) = lower(orders.assign_to)
        AND users.is_active = 1
        AND users.role IN ('production_staff', 'lockkey_production', 'happy_production')
      LIMIT 1
    ), assign_to_role, 'production_staff')
  `);

  await run(`
    UPDATE orders
    SET assign_to_role = 'production_staff'
    WHERE assign_to_role IS NULL
       OR trim(assign_to_role) = ''
       OR assign_to_role NOT IN ('production_staff', 'lockkey_production', 'happy_production')
  `);
}


function mapActivityLogRow(row) {
  if (!row) return null;

  let metadata = null;
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : null;
  } catch (error) {
    metadata = null;
  }

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    module: row.module_name,
    action: row.action,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    referenceLabel: row.reference_label,
    details: row.details,
    metadata,
    createdAt: row.created_at
  };
}

function buildActivityActorFromUser(user) {
  return {
    username: normalizeUsername(user?.username || user?.name || "local-user") || "local-user",
    role: normalizeUserRole(user?.role || "viewer")
  };
}

async function createActivityLog(payload = {}) {
  try {
    const request = payload.request || null;
    let actor = payload.user ? buildActivityActorFromUser(payload.user) : null;

    if (!actor && request) {
      const requestUser = await getRequestUser(request).catch(() => null);
      actor = requestUser
        ? buildActivityActorFromUser(requestUser)
        : {
          username: normalizeUsername(getNotificationUserId(request)) || "local-user",
          role: "viewer"
        };
    }

    if (!actor) {
      actor = {
        username: normalizeUsername(payload.username || "system") || "system",
        role: normalizeUserRole(payload.role || "viewer")
      };
    }

    const moduleName = normalizeText(payload.moduleName || payload.module || "System") || "System";
    const action = normalizeText(payload.action || "Activity") || "Activity";
    const referenceType = nullableText(payload.referenceType);
    const referenceId = payload.referenceId === undefined || payload.referenceId === null ? null : String(payload.referenceId);
    const referenceLabel = nullableText(payload.referenceLabel);
    const details = nullableText(payload.details);
    const metadata = payload.metadata === undefined || payload.metadata === null ? null : JSON.stringify(payload.metadata);
    const createdAt = normalizeText(payload.createdAt) || getPhilippineTimestamp();

    await run(
      `
        INSERT INTO activity_logs (
          username,
          role,
          module_name,
          action,
          reference_type,
          reference_id,
          reference_label,
          details,
          metadata,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        actor.username,
        actor.role,
        moduleName,
        action,
        referenceType,
        referenceId,
        referenceLabel,
        details,
        metadata,
        createdAt
      ]
    );
  } catch (error) {
    console.warn("Activity log failed:", error.message);
  }
}

function userCanViewActivityLogs(user) {
  if (!user) return false;
  return ["admin", "manager", "supervisor"].includes(normalizeUserRole(user.role));
}

function getActivityScopeWhereClause(user) {
  const role = normalizeUserRole(user?.role);

  if (role === "supervisor") {
    return {
      where: "module_name IN ('Production', 'Prod.Status')",
      params: []
    };
  }

  return { where: "1 = 1", params: [] };
}

function mapNotificationEvent(row) {
  if (!row) return null;

  return {
    id: row.id,
    moduleName: row.module_name,
    recordId: row.record_id,
    eventType: row.event_type,
    title: row.title,
    message: row.message,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}


function parseProductionHistoryJson(value, fallback = []) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function mapProductionHistoryRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    historyKey: row.history_key,
    orderId: row.order_id,
    productionRecordId: row.production_record_id,
    partialRecordId: row.partial_record_id,
    stage: row.stage,
    status: row.stage_status,
    eventType: row.event_type,
    title: row.title,
    description: row.description,
    operators: row.operators,
    meters: row.meters,
    wasteMeters: row.waste_meters,
    batchLabel: row.batch_label,
    sourceBatches: parseProductionHistoryJson(row.source_batches, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    meta: row.created_at
  };
}

function isFinishingCompletedHistoryPayload(payload = {}) {
  const title = normalizeText(payload.title).toLowerCase();
  const stage = normalizeText(payload.stage).toLowerCase();
  const description = normalizeText(payload.description).toLowerCase();

  return title === "finishing completed" && (stage === "finishing" || description.includes("finishing"));
}

function shouldSkipProductionHistoryEvent(payload = {}) {
  /* V21: do not skip Finishing Completed completely. It should be saved once.
     Duplicate prevention is handled in createProductionHistoryEvent(). */
  return false;
}

function buildProductionHistoryKey(payload = {}) {
  const explicitKey = normalizeText(payload.historyKey);
  if (explicitKey) return explicitKey;

  const partialRecordId = normalizeText(payload.partialRecordId);
  if (partialRecordId) return partialRecordId;

  const orderId = Number(payload.orderId);
  if (Number.isInteger(orderId) && orderId > 0) return String(orderId);

  const productionRecordId = Number(payload.productionRecordId);
  if (Number.isInteger(productionRecordId) && productionRecordId > 0) return `production-${productionRecordId}`;

  return "";
}

async function createProductionHistoryEvent(payload = {}) {
  const historyKey = buildProductionHistoryKey(payload);
  const title = normalizeText(payload.title);

  if (!historyKey || !title) return null;
  if (shouldSkipProductionHistoryEvent({ ...payload, title })) return null;

  if (isFinishingCompletedHistoryPayload({ ...payload, title })) {
    const existingFinishingCompleted = await get(
      `
        SELECT id
        FROM production_history
        WHERE history_key = ?
          AND lower(trim(title)) = 'finishing completed'
          AND (
            lower(COALESCE(stage, '')) = 'finishing'
            OR lower(COALESCE(description, '')) LIKE '%finishing%'
          )
        ORDER BY id ASC
        LIMIT 1
      `,
      [historyKey]
    );

    if (existingFinishingCompleted?.id) return existingFinishingCompleted.id;
  }

  const orderId = Number(payload.orderId);
  const productionRecordId = Number(payload.productionRecordId);
  const meters = Number(payload.meters);
  const wasteMeters = Number(payload.wasteMeters);

  const result = await run(
    `
      INSERT INTO production_history (
        history_key,
        order_id,
        production_record_id,
        partial_record_id,
        stage,
        stage_status,
        event_type,
        title,
        description,
        operators,
        meters,
        waste_meters,
        batch_label,
        source_batches,
        created_by,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      historyKey,
      Number.isInteger(orderId) && orderId > 0 ? orderId : null,
      Number.isInteger(productionRecordId) && productionRecordId > 0 ? productionRecordId : null,
      nullableText(payload.partialRecordId),
      nullableText(payload.stage),
      nullableText(payload.status || payload.stageStatus),
      nullableText(payload.eventType),
      title,
      nullableText(payload.description),
      nullableText(payload.operators),
      Number.isFinite(meters) && meters > 0 ? meters : null,
      Number.isFinite(wasteMeters) && wasteMeters > 0 ? wasteMeters : null,
      nullableText(payload.batchLabel),
      Array.isArray(payload.sourceBatches) ? JSON.stringify(payload.sourceBatches) : null,
      nullableText(payload.createdBy) || "system",
      normalizeText(payload.createdAt || payload.meta) || getPhilippineTimestamp()
    ]
  );

  return result.id || result.lastID;
}

async function createNotificationEvent({
  moduleName,
  recordId,
  eventType,
  title,
  message,
  createdBy = "system"
}) {
  if (!moduleName || recordId === undefined || recordId === null || !eventType || !title || !message) {
    return null;
  }

  const result = await run(
    `
      INSERT INTO notification_events (
        module_name,
        record_id,
        event_type,
        title,
        message,
        created_by,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      String(moduleName),
      String(recordId),
      String(eventType),
      String(title),
      String(message),
      String(createdBy || "system"),
      getPhilippineTimestamp()
    ]
  );

  return result.id || result.lastID;
}

function validateOrderPayload(payload) {
  const joNumber = normalizeText(payload.joNumber);
  const poNumber = normalizeText(payload.poNumber);
  const client = normalizeText(payload.client);
  const item = normalizeText(payload.item);
  const quantity = Number(payload.quantity);
  const unit = normalizeText(payload.unit);
  const printingMaterial = nullableText(payload.printingMaterial);
  const laminationMaterial = nullableText(payload.laminationMaterial);
  const assignTo = normalizeText(payload.assignTo);
  const deliveryDate = normalizeText(payload.deliveryDate);

  if (!joNumber) return { error: "J.O. Number is required.", field: "joNumber" };
  if (!poNumber) return { error: "P.O. Number is required.", field: "poNumber" };
  if (!client) return { error: "Client is required.", field: "client" };
  if (!item) return { error: "Item is required.", field: "item" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be greater than zero.", field: "quantity" };
  if (!allowedUnits.has(unit)) return { error: "Unit is required.", field: "unit" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return { error: "Delivery date is required.", field: "deliveryDate" };
  if (!assignTo) return { error: "Assign To is required.", field: "assignTo" };

  return {
    value: {
      joNumber,
      poNumber,
      client,
      item,
      quantity,
      unit,
      printingMaterial,
      laminationMaterial,
      assignTo,
      deliveryDate
    }
  };
}

function validateTakeProductionOrderPayload(payload) {
  const orderId = Number(payload.orderId);
  const convertedMeters = Number(payload.convertedMeters);
  const assignedTo = nullableText(payload.assignedTo);
  const printingMaterial = nullableText(payload.printingMaterial);
  const laminationMaterial = nullableText(payload.laminationMaterial);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "Valid order is required.", field: "orderId" };
  }

  if (!Number.isFinite(convertedMeters) || convertedMeters <= 0) {
    return { error: "Converted meters must be greater than zero.", field: "convertedMeters" };
  }

  return {
    value: {
      orderId,
      convertedMeters,
      assignedTo,
      printingMaterial,
      laminationMaterial
    }
  };
}

function buildProductionPatchPayload(payload) {
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(payload, "stage")) {
    const stage = normalizeText(payload.stage);
    if (!allowedProductionStages.has(stage)) {
      return { error: "Invalid production stage.", field: "stage" };
    }
    updates.push("stage = ?");
    params.push(stage);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status") || Object.prototype.hasOwnProperty.call(payload, "stageStatus")) {
    const status = normalizeText(payload.status || payload.stageStatus);
    if (!allowedProductionStageStatuses.has(status)) {
      return { error: "Invalid production status.", field: "status" };
    }
    updates.push("stage_status = ?");
    params.push(status);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "convertedMeters")) {
    const convertedMeters = Number(payload.convertedMeters);
    if (!Number.isFinite(convertedMeters) || convertedMeters <= 0) {
      return { error: "Converted meters must be greater than zero.", field: "convertedMeters" };
    }
    updates.push("converted_meters = ?");
    params.push(convertedMeters);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "printingMaterial")) {
    updates.push("printing_material = ?");
    params.push(nullableText(payload.printingMaterial));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "laminationMaterial")) {
    updates.push("lamination_material = ?");
    params.push(nullableText(payload.laminationMaterial));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignedTo")) {
    updates.push("assigned_to = ?");
    params.push(nullableText(payload.assignedTo));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "remarks")) {
    updates.push("remarks = ?");
    params.push(nullableText(payload.remarks));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "holdReason")) {
    updates.push("hold_reason = ?");
    params.push(nullableText(payload.holdReason));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "completedStages")) {
    updates.push("completed_stages = ?");
    params.push(stringifyCompletedStages(payload.completedStages));
  }

  updates.push("updated_at = ?");
  params.push(getPhilippineTimestamp());

  return { updates, params };
}

function handleSqliteError(error, response) {
  const message = String(error?.message || "").toLowerCase();

  if (
    error?.code === "SQLITE_CONSTRAINT" &&
    message.includes("jo_number")
  ) {
    sendDuplicateJoResponse(response);
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Server/database error." });
}


async function recreateOrdersIndexesAndTriggers() {
  await run("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status)");
  await run("CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date)");
  await run("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_orders_po_number ON orders(po_number)");
  await run("CREATE INDEX IF NOT EXISTS idx_orders_jo_number ON orders(jo_number)");
  await run("CREATE INDEX IF NOT EXISTS idx_orders_assign_to_role ON orders(assign_to_role)").catch(() => {});

  await run("DROP TRIGGER IF EXISTS orders_updated_at");
  await run(`
    CREATE TRIGGER IF NOT EXISTS orders_updated_at
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
      UPDATE orders
      SET updated_at = datetime('now', '+8 hours')
      WHERE id = OLD.id;
    END;
  `);
}




async function ensureOrdersAssignmentRoleColumn() {
  const ordersTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'");
  if (!ordersTable?.sql) return;

  const columns = await all("PRAGMA table_info(orders)");
  const hasAssignToRole = Array.isArray(columns) && columns.some((column) => column.name === "assign_to_role");

  if (!hasAssignToRole) {
    await run("ALTER TABLE orders ADD COLUMN assign_to_role TEXT");
  }

  await backfillOrderAssignToRoles();
  await recreateOrdersIndexesAndTriggers();
}

async function ensureOrdersDeliveryColumns() {
  const ordersTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'");
  if (!ordersTable?.sql) return;

  const columns = await all("PRAGMA table_info(orders)");
  const columnNames = new Set((Array.isArray(columns) ? columns : []).map((column) => column.name));
  const deliveryColumns = [
    ["delivery_process_type", "TEXT"],
    ["delivery_rolls", "INTEGER"],
    ["delivery_total_kgs", "REAL"],
    ["delivery_bags", "INTEGER"],
    ["delivery_pcs_per_bag", "INTEGER"],
    ["moved_to_delivery_at", "TEXT"],
    ["delivered_at", "TEXT"]
  ];

  for (const [columnName, columnType] of deliveryColumns) {
    if (!columnNames.has(columnName)) {
      await run(`ALTER TABLE orders ADD COLUMN ${columnName} ${columnType}`);
    }
  }

  await recreateOrdersIndexesAndTriggers();
}


async function recreateProductionRecordsIndexesAndTriggers() {
  await run("CREATE INDEX IF NOT EXISTS idx_production_records_order_id ON production_records(order_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_production_records_stage ON production_records(stage)");
  await run("CREATE INDEX IF NOT EXISTS idx_production_records_stage_status ON production_records(stage_status)");
  await run("CREATE INDEX IF NOT EXISTS idx_production_records_taken_at ON production_records(taken_at)");

  await run("DROP TRIGGER IF EXISTS production_records_updated_at");
  await run(`
    CREATE TRIGGER IF NOT EXISTS production_records_updated_at
    AFTER UPDATE ON production_records
    FOR EACH ROW
    BEGIN
      UPDATE production_records
      SET updated_at = datetime('now', '+8 hours')
      WHERE id = OLD.id;
    END;
  `);
}

async function ensureProductionRecordsFinishingStageSchema() {
  const productionTable = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'production_records'");
  const tableSql = String(productionTable?.sql || "").toLowerCase();

  if (!productionTable?.sql || tableSql.includes("'finishing'")) {
    await recreateProductionRecordsIndexesAndTriggers().catch(() => null);
    return;
  }

  await run("PRAGMA foreign_keys = OFF");

  try {
    await run("DROP TABLE IF EXISTS production_records_finishing_migration");
    await run(`
      CREATE TABLE production_records_finishing_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL UNIQUE,
        stage TEXT NOT NULL DEFAULT 'printing' CHECK (stage IN ('printing', 'rewinding', 'lamination', 'slitting', 'finishing')),
        stage_status TEXT NOT NULL DEFAULT 'pending' CHECK (stage_status IN ('pending', 'ongoing', 'hold', 'completed')),
        converted_meters REAL NOT NULL CHECK (converted_meters > 0),
        printing_material TEXT,
        lamination_material TEXT,
        assigned_to TEXT,
        remarks TEXT,
        hold_reason TEXT,
        completed_stages TEXT,
        taken_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

    await run(`
      INSERT INTO production_records_finishing_migration (
        id,
        order_id,
        stage,
        stage_status,
        converted_meters,
        printing_material,
        lamination_material,
        assigned_to,
        remarks,
        hold_reason,
        completed_stages,
        taken_at,
        updated_at
      )
      SELECT
        id,
        order_id,
        stage,
        stage_status,
        converted_meters,
        printing_material,
        lamination_material,
        assigned_to,
        remarks,
        hold_reason,
        completed_stages,
        taken_at,
        updated_at
      FROM production_records
    `);

    await run("DROP TABLE production_records");
    await run("ALTER TABLE production_records_finishing_migration RENAME TO production_records");
    await recreateProductionRecordsIndexesAndTriggers();
  } finally {
    await run("PRAGMA foreign_keys = ON").catch(() => null);
  }
}

async function ensureProductionHistorySchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS production_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      history_key TEXT NOT NULL,
      order_id INTEGER,
      production_record_id INTEGER,
      partial_record_id TEXT,
      stage TEXT,
      stage_status TEXT,
      event_type TEXT,
      title TEXT NOT NULL,
      description TEXT,
      operators TEXT,
      meters REAL,
      waste_meters REAL,
      batch_label TEXT,
      source_batches TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (production_record_id) REFERENCES production_records(id) ON DELETE SET NULL
    )
  `);

  await run("CREATE INDEX IF NOT EXISTS idx_production_history_key ON production_history(history_key)");
  await run("CREATE INDEX IF NOT EXISTS idx_production_history_order ON production_history(order_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_production_history_record ON production_history(production_record_id)");
  await run("CREATE INDEX IF NOT EXISTS idx_production_history_created_at ON production_history(created_at)");
}


async function ensureActivityLogSchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      module_name TEXT NOT NULL,
      action TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      reference_label TEXT,
      details TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    )
  `);

  await run("CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at)");
  await run("CREATE INDEX IF NOT EXISTS idx_activity_logs_username ON activity_logs(username)");
  await run("CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module_name)");
  await run("CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action)");
}

async function migrateOrdersJoUniqueConstraintIfNeeded() {
  const ordersTable = await get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'"
  );

  if (!ordersTable?.sql) return;

  const tableSql = String(ordersTable.sql).toLowerCase();
  const hasJoUnique =
    tableSql.includes("jo_number text not null unique") ||
    tableSql.includes("unique (jo_number)") ||
    tableSql.includes("unique(jo_number)");

  if (!hasJoUnique) {
    await recreateOrdersIndexesAndTriggers();
    return;
  }

  console.log("Migrating orders table: removing old UNIQUE constraint from jo_number...");

  try {
    await run("PRAGMA foreign_keys = OFF");
    await run("BEGIN TRANSACTION");

    await run(`
      CREATE TABLE orders_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jo_number TEXT NOT NULL,
        po_number TEXT NOT NULL,
        client TEXT NOT NULL,
        item TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        unit TEXT NOT NULL CHECK (unit IN ('pcs', 'kgs', 'mts')),
        printing_material TEXT,
        lamination_material TEXT,
        assign_to TEXT NOT NULL,
        delivery_date TEXT NOT NULL,
        order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'production', 'delivery', 'delivered', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
      )
    `);

    await run(`
      INSERT INTO orders_migration (
        id,
        jo_number,
        po_number,
        client,
        item,
        quantity,
        unit,
        printing_material,
        lamination_material,
        assign_to,
        delivery_date,
        order_status,
        created_at,
        updated_at
      )
      SELECT
        id,
        jo_number,
        po_number,
        client,
        item,
        quantity,
        unit,
        printing_material,
        lamination_material,
        COALESCE(assign_to, ''),
        delivery_date,
        order_status,
        created_at,
        updated_at
      FROM orders
    `);

    await run("DROP TABLE orders");
    await run("ALTER TABLE orders_migration RENAME TO orders");
    await run("COMMIT");
    await run("PRAGMA foreign_keys = ON");

    await recreateOrdersIndexesAndTriggers();
    console.log("Orders table migration completed.");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    await run("PRAGMA foreign_keys = ON").catch(() => {});
    throw error;
  }
}


app.post("/api/auth/login", async (request, response) => {
  try {
    const username = normalizeUsername(request.body?.username);
    const password = normalizeText(request.body?.password);

    if (!username || !password) {
      response.status(400).json({ error: "Username and password are required." });
      return;
    }

    const userRow = await get("SELECT * FROM users WHERE username = ? COLLATE NOCASE", [username]);

    if (!userRow || !userRow.is_active || !verifyPassword(password, userRow.password_salt, userRow.password_hash)) {
      response.status(401).json({ error: "Invalid username or password." });
      return;
    }

    const now = getPhilippineTimestamp();
    const safeUser = mapUserRow({
      ...userRow,
      last_login_at: now,
      updated_at: now
    });
    const session = createAuthSession(safeUser);
    const sessionToken = session.token;

    await run(
      `
        UPDATE users
        SET last_login_at = ?,
            current_session_token = ?,
            current_session_started_at = ?,
            current_session_expires_at = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [now, sessionToken, now, session.expiresAt, now, userRow.id]
    );

    await createActivityLog({
      user: safeUser,
      moduleName: "Auth",
      action: "Login",
      referenceType: "user",
      referenceId: safeUser.id,
      referenceLabel: safeUser.username,
      details: `${safeUser.username} logged in.`
    });

    response.json({
      user: safeUser,
      sessionToken
    });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/auth/me", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);

    if (!requestUser) {
      response.status(401).json({ error: "No active user.", code: "NO_SESSION" });
      return;
    }

    response.json({ user: requestUser });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/auth/session", async (request, response) => {
  try {
    const sessionStatus = await getAuthSessionStatus(request);

    if (!sessionStatus.ok) {
      response.status(401).json({
        error: sessionStatus.error || "Please sign in again.",
        code: sessionStatus.code || "NO_SESSION"
      });
      return;
    }

    response.json({
      ok: true,
      user: sessionStatus.user
    });
  } catch (error) {
    handleSqliteError(error, response);
  }
});


app.post("/api/auth/logout", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);
    const token = getBearerToken(request);

    if (token && activeAuthSessions.has(token)) {
      activeAuthSessions.delete(token);
    }

    if (token) {
      await run(
        `
          UPDATE users
          SET current_session_token = NULL,
              current_session_started_at = NULL,
              current_session_expires_at = NULL,
              updated_at = ?
          WHERE current_session_token = ?
        `,
        [getPhilippineTimestamp(), token]
      ).catch(() => null);
    }

    if (requestUser) {
      await createActivityLog({
        user: requestUser,
        moduleName: "Auth",
        action: "Logout",
        referenceType: "user",
        referenceId: requestUser.id,
        referenceLabel: requestUser.username,
        details: `${requestUser.username} logged out.`
      });
    }

    response.json({ ok: true });
  } catch (error) {
    handleSqliteError(error, response);
  }
});


app.get("/api/users", async (request, response) => {
  try {
    const adminUser = await requireAdminUser(request, response);
    if (!adminUser) return;

    const rows = await all(
      `
        SELECT *
        FROM users
        ORDER BY datetime(created_at) DESC, id DESC
      `
    );

    response.json({ users: rows.map(mapUserRow) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});


app.get("/api/users/production-assignees", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);
    if (!requestUser) {
      response.status(401).json({ error: "Please log in again." });
      return;
    }

    const rows = await all(
      `
        SELECT *
        FROM users
        WHERE is_active = 1
          AND role IN ('production_staff', 'lockkey_production', 'happy_production')
        ORDER BY lower(username) ASC
      `
    );

    response.json({ users: rows.map(mapUserRow) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/users", async (request, response) => {
  try {
    const adminUser = await requireAdminUser(request, response);
    if (!adminUser) return;

    const username = normalizeUsername(request.body?.username);
    const password = normalizeText(request.body?.password);
    const role = normalizeUserRole(request.body?.role);
    const name = normalizeText(request.body?.name) || username;

    if (!username || username.length < 3) {
      response.status(400).json({ error: "Username must be at least 3 characters." });
      return;
    }

    if (!password || password.length < 4) {
      response.status(400).json({ error: "Password must be at least 4 characters." });
      return;
    }

    if (!allowedUserRoles.has(role)) {
      response.status(400).json({ error: "Invalid role selected." });
      return;
    }

    const duplicate = await get("SELECT id FROM users WHERE username = ? COLLATE NOCASE", [username]);
    if (duplicate) {
      response.status(409).json({ error: "Username already exists." });
      return;
    }

    const passwordData = createPasswordHash(password);
    const result = await run(
      `
        INSERT INTO users (
          username,
          password_hash,
          password_salt,
          name,
          role,
          permissions,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [
        username,
        passwordData.hash,
        passwordData.salt,
        name,
        role,
        stringifyPermissions(getRolePermissions(role))
      ]
    );

    const createdUser = await get("SELECT * FROM users WHERE id = ?", [result.id]);
    const mappedCreatedUser = mapUserRow(createdUser);

    await createActivityLog({
      user: adminUser,
      moduleName: "Settings",
      action: "Create User",
      referenceType: "user",
      referenceId: mappedCreatedUser.id,
      referenceLabel: mappedCreatedUser.username,
      details: `Created user "${mappedCreatedUser.username}" with role ${mappedCreatedUser.role}.`,
      metadata: { affectedUsername: mappedCreatedUser.username, affectedRole: mappedCreatedUser.role }
    });

    response.status(201).json({ user: mappedCreatedUser });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.put("/api/users/:id", async (request, response) => {
  try {
    const adminUser = await requireAdminUser(request, response);
    if (!adminUser) return;

    const userId = Number(request.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      response.status(400).json({ error: "Valid user id is required." });
      return;
    }

    const existingUser = await get("SELECT * FROM users WHERE id = ?", [userId]);
    if (!existingUser) {
      response.status(404).json({ error: "User not found." });
      return;
    }

    const username = normalizeUsername(request.body?.username || existingUser.username);
    const role = normalizeUserRole(request.body?.role || existingUser.role);
    const name = normalizeText(request.body?.name) || username;
    const password = normalizeText(request.body?.password || "");

    if (!username || username.length < 3) {
      response.status(400).json({ error: "Username must be at least 3 characters." });
      return;
    }

    if (password && password.length < 4) {
      response.status(400).json({ error: "Password must be at least 4 characters." });
      return;
    }

    const duplicate = await get(
      "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?",
      [username, userId]
    );

    if (duplicate) {
      response.status(409).json({ error: "Username already exists." });
      return;
    }

    const isMainAdmin = normalizeUsername(existingUser.username) === "admin";
    const isChangingMainAdminRole = isMainAdmin && role !== "admin";

    if (isChangingMainAdminRole) {
      response.status(400).json({ error: "Main admin role cannot be changed." });
      return;
    }

    const updates = [
      "username = ?",
      "name = ?",
      "role = ?",
      "permissions = ?",
      "updated_at = ?"
    ];
    const params = [
      username,
      name,
      role,
      stringifyPermissions(getRolePermissions(role)),
      getPhilippineTimestamp()
    ];

    if (password) {
      const passwordData = createPasswordHash(password);
      updates.push("password_hash = ?", "password_salt = ?");
      params.push(passwordData.hash, passwordData.salt);
    }

    params.push(userId);

    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    const updatedUser = await get("SELECT * FROM users WHERE id = ?", [userId]);
    const mappedUpdatedUser = mapUserRow(updatedUser);
    const changedParts = [];

    if (normalizeUsername(existingUser.username) !== mappedUpdatedUser.username) changedParts.push("username");
    if (normalizeUserRole(existingUser.role) !== mappedUpdatedUser.role) changedParts.push("role");
    if (password) changedParts.push("password");

    await createActivityLog({
      user: adminUser,
      moduleName: "Settings",
      action: "Update User",
      referenceType: "user",
      referenceId: mappedUpdatedUser.id,
      referenceLabel: mappedUpdatedUser.username,
      details: `Updated user "${mappedUpdatedUser.username}"${changedParts.length ? ` (${changedParts.join(", ")})` : ""}.`,
      metadata: { affectedUsername: mappedUpdatedUser.username, affectedRole: mappedUpdatedUser.role, changedParts }
    });

    response.json({ user: mappedUpdatedUser });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.delete("/api/users/:id", async (request, response) => {
  try {
    const adminUser = await requireAdminUser(request, response);
    if (!adminUser) return;

    const userId = Number(request.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      response.status(400).json({ error: "Valid user id is required." });
      return;
    }

    const existingUser = await get("SELECT * FROM users WHERE id = ?", [userId]);
    if (!existingUser) {
      response.status(404).json({ error: "User not found." });
      return;
    }

    if (normalizeUsername(existingUser.username) === "admin") {
      response.status(400).json({ error: "Main admin cannot be deleted." });
      return;
    }

    if (normalizeUsername(existingUser.username) === normalizeUsername(adminUser.username)) {
      response.status(400).json({ error: "You cannot delete your own active account." });
      return;
    }

    if (normalizeUserRole(existingUser.role) === "admin") {
      const adminCount = await get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1");
      if (Number(adminCount?.count || 0) <= 1) {
        response.status(400).json({ error: "At least one admin account is required." });
        return;
      }
    }

    await run("DELETE FROM users WHERE id = ?", [userId]);

    await createActivityLog({
      user: adminUser,
      moduleName: "Settings",
      action: "Delete User",
      referenceType: "user",
      referenceId: existingUser.id,
      referenceLabel: existingUser.username,
      details: `Deleted user "${existingUser.username}".`,
      metadata: { affectedUsername: existingUser.username, affectedRole: normalizeUserRole(existingUser.role) }
    });

    response.json({ ok: true });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/database/backup", async (request, response) => {
  try {
    const adminUser = await requireAdminUser(request, response);
    if (!adminUser) return;

    const stamp = getPhilippineTimestamp().replaceAll("-", "").replaceAll(":", "").replace(" ", "_");

    await createActivityLog({
      user: adminUser,
      moduleName: "Settings",
      action: "Backup Database",
      referenceType: "database",
      referenceLabel: "production_fresh.db",
      details: "Downloaded a database backup."
    });

    response.download(databasePath, `production_fresh_backup_${stamp}.db`);
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/health", (request, response) => {
  response.json({ ok: true, database: "sqlite" });
});


app.get("/api/activity/recent", async (request, response) => {
  try {
    const rows = await all(
      `
        SELECT
          e.id,
          e.module_name,
          e.record_id,
          e.event_type,
          e.title,
          e.message,
          e.created_by,
          e.created_at,
          COALESCE(direct_order.jo_number, production_order.jo_number) AS jo_number,
          COALESCE(direct_order.po_number, production_order.po_number) AS po_number,
          COALESCE(direct_order.client, production_order.client) AS client,
          COALESCE(direct_order.item, production_order.item) AS item,
          COALESCE(direct_order.assign_to, production_order.assign_to) AS assign_to,
          production_record.stage AS stage,
          production_record.stage_status AS stage_status
        FROM notification_events e
        LEFT JOIN orders direct_order
          ON direct_order.id = CAST(e.record_id AS INTEGER)
          AND lower(e.module_name) IN ('orders', 'delivery')
        LEFT JOIN production_records production_record
          ON production_record.id = CAST(e.record_id AS INTEGER)
          AND lower(e.module_name) = 'production'
        LEFT JOIN orders production_order
          ON production_order.id = production_record.order_id
        ORDER BY datetime(e.created_at) DESC, e.id DESC
        LIMIT 40
      `
    );

    response.json({
      activities: rows.map((row) => ({
        id: row.id,
        moduleName: row.module_name,
        recordId: row.record_id,
        eventType: row.event_type,
        title: row.title,
        message: row.message,
        joNumber: row.jo_number || "",
        poNumber: row.po_number || "",
        client: row.client || "",
        item: row.item || "",
        assignTo: row.assign_to || "",
        stage: row.stage || "",
        status: row.stage_status || "",
        createdBy: row.created_by,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    handleSqliteError(error, response);
  }
});


app.get("/api/activity/logs", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);

    if (!userCanViewActivityLogs(requestUser)) {
      response.status(requestUser ? 403 : 401).json({ error: requestUser ? "Reports access is required." : "Please log in again." });
      return;
    }

    const limit = Math.min(Math.max(Number(request.query.limit) || 80, 1), 250);
    const search = normalizeText(request.query.search);
    const moduleName = normalizeText(request.query.module);
    const dateFrom = normalizeText(request.query.dateFrom);
    const dateTo = normalizeText(request.query.dateTo);
    const scope = getActivityScopeWhereClause(requestUser);
    const where = [scope.where];
    const params = [...scope.params];

    if (moduleName && moduleName !== "all") {
      where.push("module_name = ?");
      params.push(moduleName);
    }

    if (dateFrom) {
      where.push("date(created_at) >= date(?)");
      params.push(dateFrom);
    }

    if (dateTo) {
      where.push("date(created_at) <= date(?)");
      params.push(dateTo);
    }

    if (search) {
      where.push(`(
        lower(username) LIKE ? OR
        lower(role) LIKE ? OR
        lower(module_name) LIKE ? OR
        lower(action) LIKE ? OR
        lower(COALESCE(reference_label, '')) LIKE ? OR
        lower(COALESCE(details, '')) LIKE ?
      )`);
      const likeValue = `%${search.toLowerCase()}%`;
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue);
    }

    const rows = await all(
      `
        SELECT *
        FROM activity_logs
        WHERE ${where.join(" AND ")}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `,
      [...params, limit]
    );

    const summaryRows = await all(
      `
        SELECT module_name, COUNT(*) AS count
        FROM activity_logs
        WHERE ${scope.where}
        GROUP BY module_name
        ORDER BY module_name ASC
      `,
      scope.params
    );

    response.json({
      logs: rows.map(mapActivityLogRow),
      summary: summaryRows.map((row) => ({ module: row.module_name, count: row.count })),
      scope: normalizeUserRole(requestUser.role) === "supervisor" ? "production" : "all"
    });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/notifications/unread-counts", async (request, response) => {
  try {
    const userId = getNotificationUserId(request);
    const requestUser = await getRequestUser(request).catch(() => null);
    const assignmentScope = buildNotificationAssignmentScopeFilter(requestUser);
    const params = [userId, ...assignmentScope.params];

    const rows = await all(
      `
        SELECT e.module_name AS module_name, COUNT(*) AS unread_count
        FROM notification_events e
        WHERE NOT EXISTS (
          SELECT 1
          FROM notification_reads r
          WHERE r.notification_id = e.id
            AND r.user_id = ?
        )
        ${assignmentScope.where ? `AND ${assignmentScope.where}` : ""}
        GROUP BY e.module_name
      `,
      params
    );

    const counts = {};
    rows.forEach((row) => {
      counts[row.module_name] = Number(row.unread_count || 0);
    });

    response.json({ counts });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/notifications/unread-records", async (request, response) => {
  try {
    const userId = getNotificationUserId(request);
    const moduleName = normalizeText(request.query.moduleName || request.query.module);
    const requestUser = await getRequestUser(request).catch(() => null);
    const assignmentScope = buildNotificationAssignmentScopeFilter(requestUser);

    if (!moduleName) {
      response.status(400).json({ error: "moduleName is required." });
      return;
    }

    const rows = await all(
      `
        SELECT e.*
        FROM notification_events e
        WHERE e.module_name = ?
          AND NOT EXISTS (
            SELECT 1
            FROM notification_reads r
            WHERE r.notification_id = e.id
              AND r.user_id = ?
          )
          ${assignmentScope.where ? `AND ${assignmentScope.where}` : ""}
        ORDER BY datetime(e.created_at) DESC, e.id DESC
      `,
      [moduleName, userId, ...assignmentScope.params]
    );

    const recordMap = new Map();

    rows.forEach((row) => {
      const event = mapNotificationEvent(row);
      const recordKey = String(event.recordId);

      if (!recordMap.has(recordKey)) {
        recordMap.set(recordKey, {
          recordId: event.recordId,
          moduleName: event.moduleName,
          eventType: event.eventType,
          title: event.title,
          message: event.message,
          createdAt: event.createdAt,
          count: 0
        });
      }

      recordMap.get(recordKey).count += 1;
    });

    response.json({ records: Array.from(recordMap.values()) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/notifications", async (request, response) => {
  try {
    const userId = getNotificationUserId(request);
    const moduleName = normalizeText(request.query.moduleName || request.query.module);
    const requestUser = await getRequestUser(request).catch(() => null);
    const assignmentScope = buildNotificationAssignmentScopeFilter(requestUser);
    const params = [userId];
    const where = [];

    if (moduleName) {
      where.push("e.module_name = ?");
      params.push(moduleName);
    }

    if (assignmentScope.where) {
      where.push(assignmentScope.where);
      params.push(...assignmentScope.params);
    }

    const rows = await all(
      `
        SELECT e.*
        FROM notification_events e
        WHERE NOT EXISTS (
          SELECT 1
          FROM notification_reads r
          WHERE r.notification_id = e.id
            AND r.user_id = ?
        )
        ${where.length ? `AND ${where.join(" AND ")}` : ""}
        ORDER BY datetime(e.created_at) DESC, e.id DESC
        LIMIT 80
      `,
      params
    );

    response.json({ notifications: rows.map(mapNotificationEvent) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/notifications/read-record", async (request, response) => {
  try {
    const userId = getNotificationUserId(request);
    const moduleName = normalizeText(request.body?.moduleName || request.body?.module);
    const recordId = normalizeText(String(request.body?.recordId ?? ""));

    if (!moduleName || !recordId) {
      response.status(400).json({ error: "moduleName and recordId are required." });
      return;
    }

    const rows = await all(
      `
        SELECT id
        FROM notification_events
        WHERE module_name = ?
          AND record_id = ?
      `,
      [moduleName, recordId]
    );

    for (const row of rows) {
      await run(
        `
          INSERT OR IGNORE INTO notification_reads (
            notification_id,
            user_id,
            read_at
          )
          VALUES (?, ?, ?)
        `,
        [row.id, userId, getPhilippineTimestamp()]
      );
    }

    response.json({ ok: true, marked: rows.length });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/notifications/:id/read", async (request, response) => {
  try {
    const userId = getNotificationUserId(request);
    const notificationId = normalizeText(request.params.id);

    if (!notificationId) {
      response.status(400).json({ error: "Notification id is required." });
      return;
    }

    await run(
      `
        INSERT OR IGNORE INTO notification_reads (
          notification_id,
          user_id,
          read_at
        )
        VALUES (?, ?, ?)
      `,
      [notificationId, userId, getPhilippineTimestamp()]
    );

    response.json({ ok: true });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/orders", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request).catch(() => null);
    const search = normalizeText(request.query.search);
    const status = normalizeText(request.query.status);
    const params = [];
    const where = [];

    if (status) {
      if (!allowedOrderStatuses.has(status)) {
        response.status(400).json({ error: "Invalid order status." });
        return;
      }
      where.push("order_status = ?");
      params.push(status);
    }

    if (search) {
      where.push(`(
        jo_number LIKE ? OR
        po_number LIKE ? OR
        client LIKE ? OR
        item LIKE ?
      )`);
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const scope = buildOrderAssignmentScopeFilter(requestUser, "orders");
    if (scope.where) {
      where.push(scope.where);
      params.push(...scope.params);
    }

    const sql = `
      SELECT *
      FROM orders
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY datetime(created_at) DESC, id DESC
    `;

    const rows = await all(sql, params);
    response.json({ orders: rows.map(mapOrderRow) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/orders/check-jo", async (request, response) => {
  try {
    const joNumber = normalizeText(request.query.joNumber);

    if (!joNumber) {
      response.json({ exists: false });
      return;
    }

    const duplicateOrder = await get(
      "SELECT id FROM orders WHERE lower(trim(jo_number)) = lower(trim(?)) LIMIT 1",
      [joNumber]
    );

    response.json({ exists: Boolean(duplicateOrder) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/orders/:id", async (request, response) => {
  try {
    const order = await get("SELECT * FROM orders WHERE id = ?", [request.params.id]);

    if (!order) {
      response.status(404).json({ error: "Order not found." });
      return;
    }

    response.json({ order: mapOrderRow(order) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/orders", async (request, response) => {
  const validation = validateOrderPayload(request.body || {});

  if (validation.error) {
    response.status(400).json({
      error: validation.error,
      field: validation.field || "",
      code: "VALIDATION_ERROR"
    });
    return;
  }

  const order = validation.value;

  try {
    const assignToRole = await resolveOrderAssignToRole(order.assignTo);
    if (!assignToRole) {
      response.status(400).json({
        error: "Select a valid production user.",
        field: "assignTo",
        code: "INVALID_ASSIGN_TO"
      });
      return;
    }

    const duplicateOrder = await get(
      "SELECT id FROM orders WHERE lower(trim(jo_number)) = lower(trim(?)) LIMIT 1",
      [order.joNumber]
    );

    if (duplicateOrder) {
      sendDuplicateJoResponse(response);
      return;
    }

    const result = await run(
      `
        INSERT INTO orders (
          jo_number,
          po_number,
          client,
          item,
          quantity,
          unit,
          printing_material,
          lamination_material,
          assign_to,
          assign_to_role,
          delivery_date,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        order.joNumber,
        order.poNumber,
        order.client,
        order.item,
        order.quantity,
        order.unit,
        order.printingMaterial,
        order.laminationMaterial,
        order.assignTo,
        assignToRole,
        order.deliveryDate,
        getPhilippineTimestamp(),
        getPhilippineTimestamp()
      ]
    );

    const createdOrder = await get("SELECT * FROM orders WHERE id = ?", [result.lastID || result.id]);

    await createNotificationEvent({
      moduleName: "orders",
      recordId: createdOrder.id,
      eventType: "new",
      title: "New Order",
      message: `New order ${createdOrder.po_number} was added.`,
      createdBy: getNotificationUserId(request)
    });

    await createActivityLog({
      request,
      moduleName: "Orders",
      action: "Add Order",
      referenceType: "order",
      referenceId: createdOrder.id,
      referenceLabel: createdOrder.jo_number || createdOrder.po_number,
      details: `Added J.O. ${createdOrder.jo_number} / P.O. ${createdOrder.po_number} for ${createdOrder.client} - ${createdOrder.item}.`,
      metadata: { joNumber: createdOrder.jo_number, poNumber: createdOrder.po_number, client: createdOrder.client, item: createdOrder.item }
    });

    response.status(201).json({ order: mapOrderRow(createdOrder) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.patch("/api/orders/:id", async (request, response) => {
  const validation = validateOrderPayload(request.body || {});

  if (validation.error) {
    response.status(400).json({
      error: validation.error,
      field: validation.field || "",
      code: "VALIDATION_ERROR"
    });
    return;
  }

  const order = validation.value;

  try {
    const assignToRole = await resolveOrderAssignToRole(order.assignTo);
    if (!assignToRole) {
      response.status(400).json({
        error: "Select a valid production user.",
        field: "assignTo",
        code: "INVALID_ASSIGN_TO"
      });
      return;
    }

    const existingOrder = await get("SELECT * FROM orders WHERE id = ?", [request.params.id]);
    if (!existingOrder) {
      response.status(404).json({ error: "Order not found." });
      return;
    }

    const existingProductionRecord = await get(
      "SELECT id FROM production_records WHERE order_id = ? LIMIT 1",
      [request.params.id]
    );

    if (existingProductionRecord || existingOrder.order_status !== "pending") {
      response.status(409).json({
        error: "This order is already in production and can no longer be edited.",
        code: "ORDER_LOCKED_IN_PRODUCTION"
      });
      return;
    }

    const duplicateOrder = await get(
      "SELECT id FROM orders WHERE lower(trim(jo_number)) = lower(trim(?)) AND id != ? LIMIT 1",
      [order.joNumber, request.params.id]
    );

    if (duplicateOrder) {
      sendDuplicateJoResponse(response);
      return;
    }

    await run(
      `
        UPDATE orders
        SET
          jo_number = ?,
          po_number = ?,
          client = ?,
          item = ?,
          quantity = ?,
          unit = ?,
          printing_material = ?,
          lamination_material = ?,
          assign_to = ?,
          assign_to_role = ?,
          delivery_date = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        order.joNumber,
        order.poNumber,
        order.client,
        order.item,
        order.quantity,
        order.unit,
        order.printingMaterial,
        order.laminationMaterial,
        order.assignTo,
        assignToRole,
        order.deliveryDate,
        getPhilippineTimestamp(),
        request.params.id
      ]
    );

    const updatedOrder = await get("SELECT * FROM orders WHERE id = ?", [request.params.id]);

    await createNotificationEvent({
      moduleName: "orders",
      recordId: updatedOrder.id,
      eventType: "updated",
      title: "Order Updated",
      message: `Order ${updatedOrder.po_number} was updated.`,
      createdBy: getNotificationUserId(request)
    });

    await createActivityLog({
      request,
      moduleName: "Orders",
      action: "Update Order",
      referenceType: "order",
      referenceId: updatedOrder.id,
      referenceLabel: updatedOrder.jo_number || updatedOrder.po_number,
      details: `Updated J.O. ${updatedOrder.jo_number} / P.O. ${updatedOrder.po_number}.`,
      metadata: { joNumber: updatedOrder.jo_number, poNumber: updatedOrder.po_number, client: updatedOrder.client, item: updatedOrder.item }
    });

    response.json({ order: mapOrderRow(updatedOrder) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.patch("/api/orders/:id/status", async (request, response) => {
  try {
    const orderId = Number(request.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      response.status(400).json({ error: "Valid order id is required." });
      return;
    }

    const status = normalizeText(request.body?.status || request.body?.orderStatus);
    if (!["delivery", "delivered"].includes(status)) {
      response.status(400).json({ error: "Invalid delivery status.", field: "status" });
      return;
    }

    const existingOrder = await get("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!existingOrder) {
      response.status(404).json({ error: "Order not found." });
      return;
    }

    const requestUser = await getRequestUser(request).catch(() => null);
    const canMoveFromProduction = canUserUpdateProduction(requestUser);
    const canUpdateDelivery = canUserUpdateDelivery(requestUser);

    if (status === "delivery" && !canMoveFromProduction && !canUpdateDelivery) {
      response.status(403).json({ error: "Production or delivery update access is required." });
      return;
    }

    if (status === "delivered" && !canUpdateDelivery) {
      response.status(403).json({ error: "Delivery update access is required." });
      return;
    }

    const now = getPhilippineTimestamp();

    if (status === "delivery") {
      const details = normalizeDeliveryDetailsPayload(request.body?.deliveryDetails || request.body || {});
      if (details.error) {
        response.status(400).json({
          error: details.error,
          field: details.field || "deliveryDetails",
          code: "VALIDATION_ERROR"
        });
        return;
      }

      const value = details.value;
      await run(
        `
          UPDATE orders
          SET
            order_status = 'delivery',
            delivery_process_type = ?,
            delivery_rolls = ?,
            delivery_total_kgs = ?,
            delivery_bags = ?,
            delivery_pcs_per_bag = ?,
            moved_to_delivery_at = COALESCE(moved_to_delivery_at, ?),
            delivered_at = NULL,
            updated_at = ?
          WHERE id = ?
        `,
        [
          value.processType,
          value.rolls,
          value.totalKgs,
          value.bags,
          value.pcsPerBag,
          now,
          now,
          orderId
        ]
      );

      /* Once an order is moved to Deliveries, it must no longer appear in any production stage. */
      await run(
        `
          UPDATE production_records
          SET
            stage_status = 'completed',
            updated_at = ?
          WHERE order_id = ?
        `,
        [now, orderId]
      );
    } else {
      if (!["delivery", "delivered"].includes(existingOrder.order_status)) {
        response.status(409).json({ error: "Only for delivery orders can be marked as delivered." });
        return;
      }

      await run(
        `
          UPDATE orders
          SET
            order_status = 'delivered',
            delivered_at = COALESCE(delivered_at, ?),
            updated_at = ?
          WHERE id = ?
        `,
        [now, now, orderId]
      );
    }

    const updatedOrder = await get("SELECT * FROM orders WHERE id = ?", [orderId]);

    await createNotificationEvent({
      moduleName: "delivery",
      recordId: updatedOrder.id,
      eventType: status === "delivery" ? "new" : "delivered",
      title: status === "delivery" ? "Moved to Delivery" : "Delivered Order",
      message: status === "delivery"
        ? `Order ${updatedOrder.po_number} was moved to For Delivery.`
        : `Order ${updatedOrder.po_number} was marked as delivered.`,
      createdBy: getNotificationUserId(request)
    });

    if (status === "delivery") {
      await createProductionHistoryEvent({
        historyKey: String(updatedOrder.id),
        orderId: updatedOrder.id,
        stage: "delivery",
        status: "delivery",
        eventType: "moved-to-delivery",
        title: "Moved to Delivery",
        description: "Item moved to Deliveries and is ready for delivery processing.",
        createdBy: getNotificationUserId(request),
        createdAt: updatedOrder.moved_to_delivery_at || now
      });
    }

    if (status === "delivered") {
      await createProductionHistoryEvent({
        historyKey: String(updatedOrder.id),
        orderId: updatedOrder.id,
        stage: "delivery",
        status: "delivered",
        eventType: "delivered",
        title: "Item Delivered",
        description: "Item was marked as delivered from Deliveries.",
        createdBy: getNotificationUserId(request),
        createdAt: updatedOrder.delivered_at || now
      });
    }

    await createActivityLog({
      request,
      moduleName: "Delivery",
      action: status === "delivery" ? "Move to Delivery" : "Mark Delivered",
      referenceType: "order",
      referenceId: updatedOrder.id,
      referenceLabel: updatedOrder.jo_number || updatedOrder.po_number,
      details: status === "delivery"
        ? `Moved J.O. ${updatedOrder.jo_number} / P.O. ${updatedOrder.po_number} to For Delivery.`
        : `Marked J.O. ${updatedOrder.jo_number} / P.O. ${updatedOrder.po_number} as delivered.`,
      metadata: {
        joNumber: updatedOrder.jo_number,
        poNumber: updatedOrder.po_number,
        status,
        deliveryProcessType: updatedOrder.delivery_process_type
      }
    });

    response.json({ order: mapOrderRow(updatedOrder) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.delete("/api/orders/:id", async (request, response) => {
  try {
    const existingOrder = await get("SELECT * FROM orders WHERE id = ?", [request.params.id]);
    if (!existingOrder) {
      response.status(404).json({ error: "Order not found." });
      return;
    }

    const result = await run("DELETE FROM orders WHERE id = ?", [request.params.id]);

    if (!result.changes) {
      response.status(404).json({ error: "Order not found." });
      return;
    }

    await createActivityLog({
      request,
      moduleName: "Orders",
      action: "Delete Order",
      referenceType: "order",
      referenceId: existingOrder.id,
      referenceLabel: existingOrder.jo_number || existingOrder.po_number,
      details: `Deleted J.O. ${existingOrder.jo_number} / P.O. ${existingOrder.po_number}.`,
      metadata: { joNumber: existingOrder.jo_number, poNumber: existingOrder.po_number, client: existingOrder.client, item: existingOrder.item }
    });

    response.json({ ok: true });
  } catch (error) {
    handleSqliteError(error, response);
  }
});



app.get("/api/production/history", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request).catch(() => null);
    const historyKey = normalizeText(request.query.historyKey || request.query.key);
    const partialRecordId = normalizeText(request.query.partialRecordId);
    const orderId = Number(request.query.orderId);
    const productionRecordId = Number(request.query.productionRecordId || request.query.recordId);
    const params = [];
    const where = [];

    if (historyKey) {
      where.push("history_key = ?");
      params.push(historyKey);
    }

    if (partialRecordId) {
      where.push("partial_record_id = ?");
      params.push(partialRecordId);
    }

    if (Number.isInteger(orderId) && orderId > 0) {
      where.push("order_id = ?");
      params.push(orderId);
    }

    if (Number.isInteger(productionRecordId) && productionRecordId > 0) {
      where.push("production_record_id = ?");
      params.push(productionRecordId);
    }

    const scopedRole = getScopedProductionRole(requestUser);
    if (scopedRole && !canUserSeeAllProductionAssignments(requestUser)) {
      where.push(`(
        order_id IN (SELECT id FROM orders WHERE assign_to_role = ?) OR
        production_record_id IN (
          SELECT p.id
          FROM production_records p
          INNER JOIN orders o ON o.id = p.order_id
          WHERE o.assign_to_role = ?
        )
      )`);
      params.push(scopedRole, scopedRole);
    }

    const rows = await all(
      `
        SELECT *
        FROM production_history
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY datetime(created_at) ASC, id ASC
        ${where.length ? "" : "LIMIT 2000"}
      `,
      params
    );

    response.json({ history: rows.map(mapProductionHistoryRow).filter(Boolean) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/production/history", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request).catch(() => null);

    if (!canUserUpdateProduction(requestUser)) {
      response.status(403).json({ error: "Production update access is required." });
      return;
    }

    const payload = request.body || {};
    const historyKey = buildProductionHistoryKey(payload);
    const title = normalizeText(payload.title);

    if (!historyKey || !title) {
      response.status(400).json({
        error: "historyKey and title are required.",
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const historyId = await createProductionHistoryEvent({
      ...payload,
      historyKey,
      createdBy: normalizeText(payload.createdBy) || getNotificationUserId(request)
    });

    const createdHistory = await get("SELECT * FROM production_history WHERE id = ?", [historyId]);
    const mappedHistory = mapProductionHistoryRow(createdHistory);

    await createActivityLog({
      request,
      moduleName: "Production",
      action: mappedHistory?.title || "Production History",
      referenceType: "production_history",
      referenceId: mappedHistory?.id,
      referenceLabel: mappedHistory?.historyKey,
      details: mappedHistory?.description || mappedHistory?.title || "Production history was updated.",
      metadata: { historyKey: mappedHistory?.historyKey, stage: mappedHistory?.stage, status: mappedHistory?.status }
    });

    response.status(201).json({ history: mappedHistory });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.get("/api/production/records", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request).catch(() => null);
    const stage = normalizeText(request.query.stage);
    const status = normalizeText(request.query.status || request.query.stageStatus);
    const search = normalizeText(request.query.search);
    const params = [];
    const where = [];

    if (stage) {
      if (!allowedProductionStages.has(stage)) {
        response.status(400).json({ error: "Invalid production stage." });
        return;
      }
      where.push("p.stage = ?");
      params.push(stage);
    }

    if (status) {
      if (!allowedProductionStageStatuses.has(status)) {
        response.status(400).json({ error: "Invalid production status." });
        return;
      }
      where.push("p.stage_status = ?");
      params.push(status);
    }

    if (search) {
      where.push(`(
        o.jo_number LIKE ? OR
        o.po_number LIKE ? OR
        o.client LIKE ? OR
        o.item LIKE ?
      )`);
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    /* Delivery and delivered orders are managed only in the Deliveries page. */
    where.push("o.order_status NOT IN ('delivery', 'delivered', 'cancelled')");

    const scope = buildOrderAssignmentScopeFilter(requestUser, "o");
    if (scope.where) {
      where.push(scope.where);
      params.push(...scope.params);
    }

    const rows = await all(
      `
        SELECT
          p.id AS production_id,
          p.order_id,
          p.stage,
          p.stage_status,
          p.converted_meters,
          p.printing_material AS production_printing_material,
          p.lamination_material AS production_lamination_material,
          p.assigned_to AS production_assigned_to,
          p.remarks,
          p.hold_reason,
          p.completed_stages,
          p.taken_at,
          p.updated_at AS production_updated_at,
          o.jo_number,
          o.po_number,
          o.client,
          o.item,
          o.quantity,
          o.unit,
          o.printing_material,
          o.lamination_material,
          o.assign_to,
          ${getOrderAssignmentRoleSql("o")} AS assign_to_role,
          o.delivery_date,
          o.order_status,
          o.created_at AS order_created_at,
          o.updated_at AS order_updated_at
        FROM production_records p
        INNER JOIN orders o ON o.id = p.order_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY datetime(p.taken_at) DESC, p.id DESC
      `,
      params
    );

    response.json({ records: rows.map(mapProductionRow) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/production/take-order", async (request, response) => {
  const validation = validateTakeProductionOrderPayload(request.body || {});

  if (validation.error) {
    response.status(400).json({
      error: validation.error,
      field: validation.field || "",
      code: "VALIDATION_ERROR"
    });
    return;
  }

  const payload = validation.value;

  try {
    const requestUser = await getRequestUser(request).catch(() => null);

    if (!canUserUpdateProduction(requestUser)) {
      response.status(403).json({ error: "Production update access is required." });
      return;
    }

    const order = await get("SELECT * FROM orders WHERE id = ?", [payload.orderId]);

    if (!order) {
      response.status(404).json({ error: "Order not found." });
      return;
    }

    const effectiveOrderAssignToRole = await resolveOrderAssignToRole(order.assign_to)
      || normalizeUserRole(order.assign_to_role)
      || "production_staff";

    if (normalizeUserRole(order.assign_to_role) !== effectiveOrderAssignToRole) {
      await run(
        "UPDATE orders SET assign_to_role = ? WHERE id = ?",
        [effectiveOrderAssignToRole, payload.orderId]
      );
      order.assign_to_role = effectiveOrderAssignToRole;
    }

    const scopedRole = getScopedProductionRole(requestUser);
    if (scopedRole && !canUserSeeAllProductionAssignments(requestUser) && effectiveOrderAssignToRole !== scopedRole) {
      response.status(403).json({ error: "This order is assigned to another production group." });
      return;
    }

    const existingProductionRecord = await get(
      "SELECT id FROM production_records WHERE order_id = ? LIMIT 1",
      [payload.orderId]
    );

    if (existingProductionRecord) {
      response.status(409).json({
        error: "This order is already in production.",
        code: "ORDER_ALREADY_IN_PRODUCTION"
      });
      return;
    }

    if (!["pending", "production"].includes(order.order_status)) {
      response.status(400).json({
        error: "Only pending orders can be taken into production.",
        code: "INVALID_ORDER_STATUS"
      });
      return;
    }

    const now = getPhilippineTimestamp();

    const result = await run(
      `
        INSERT INTO production_records (
          order_id,
          stage,
          stage_status,
          converted_meters,
          printing_material,
          lamination_material,
          assigned_to,
          remarks,
          hold_reason,
          completed_stages,
          taken_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.orderId,
        "printing",
        "ongoing",
        payload.convertedMeters,
        payload.printingMaterial || order.printing_material,
        payload.laminationMaterial || order.lamination_material,
        payload.assignedTo || null,
        "Printing started.",
        null,
        JSON.stringify(["Issue Order"]),
        now,
        now
      ]
    );

    await run(
      "UPDATE orders SET order_status = ?, updated_at = ? WHERE id = ?",
      ["production", now, payload.orderId]
    );

    const createdRecord = await getProductionRecordById(result.lastID || result.id);

    await createProductionHistoryEvent({
      historyKey: String(createdRecord.order_id),
      orderId: createdRecord.order_id,
      productionRecordId: createdRecord.production_id,
      stage: "printing",
      status: "ongoing",
      eventType: "take-order",
      title: "Take Order",
      description: [
        `Printing started with ${payload.convertedMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} mts.`
      ].filter(Boolean).join(" "),
      operators: payload.assignedTo || "",
      meters: payload.convertedMeters,
      createdBy: getNotificationUserId(request),
      createdAt: now
    });

    await createNotificationEvent({
      moduleName: "production",
      recordId: createdRecord.production_id,
      eventType: "new",
      title: "Order Taken",
      message: `Order ${createdRecord.jo_number} started Printing.`,
      createdBy: getNotificationUserId(request)
    });

    await createActivityLog({
      request,
      moduleName: "Production",
      action: "Take Order",
      referenceType: "production_record",
      referenceId: createdRecord.production_id,
      referenceLabel: createdRecord.jo_number || createdRecord.po_number,
      details: `Took J.O. ${createdRecord.jo_number} to Printing with ${payload.convertedMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} mts.`,
      metadata: { joNumber: createdRecord.jo_number, poNumber: createdRecord.po_number, stage: "printing", meters: payload.convertedMeters }
    });

    response.status(201).json({ record: mapProductionRow(createdRecord) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.patch("/api/production/records/:id", async (request, response) => {
  try {
    const productionId = Number(request.params.id);

    if (!Number.isInteger(productionId) || productionId <= 0) {
      response.status(400).json({ error: "Valid production record id is required." });
      return;
    }

    const existingRecord = await getProductionRecordById(productionId);
    if (!existingRecord) {
      response.status(404).json({ error: "Production record not found." });
      return;
    }

    const requestUser = await getRequestUser(request).catch(() => null);

    if (!canUserUpdateProduction(requestUser)) {
      response.status(403).json({ error: "Production update access is required." });
      return;
    }

    const scopedRole = getScopedProductionRole(requestUser);
    if (scopedRole && !canUserSeeAllProductionAssignments(requestUser) && normalizeUserRole(existingRecord.assign_to_role) !== scopedRole) {
      response.status(403).json({ error: "This production record is assigned to another production group." });
      return;
    }

    const patch = buildProductionPatchPayload(request.body || {});
    if (patch.error) {
      response.status(400).json({
        error: patch.error,
        field: patch.field || "",
        code: "VALIDATION_ERROR"
      });
      return;
    }

    await run(
      `UPDATE production_records SET ${patch.updates.join(", ")} WHERE id = ?`,
      [...patch.params, productionId]
    );

    const updatedRecord = await getProductionRecordById(productionId);

    await createActivityLog({
      request,
      moduleName: "Production",
      action: "Update Production",
      referenceType: "production_record",
      referenceId: updatedRecord.production_id,
      referenceLabel: updatedRecord.jo_number || updatedRecord.po_number,
      details: `Updated production status for J.O. ${updatedRecord.jo_number}: ${updatedRecord.stage} / ${updatedRecord.stage_status}.`,
      metadata: { joNumber: updatedRecord.jo_number, poNumber: updatedRecord.po_number, stage: updatedRecord.stage, stageStatus: updatedRecord.stage_status }
    });

    response.json({ record: mapProductionRow(updatedRecord) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});


function mapMaterialRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    stock: row.stock,
    criticalLevel: row.critical_level,
    unit: row.unit,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get("/api/materials", async (request, response) => {
  try {
    const search = normalizeText(request.query.search);
    const category = normalizeText(request.query.category);
    const params = [];
    const where = [];

    if (category && category !== "all") {
      where.push("category = ?");
      params.push(category);
    }
    if (search) {
      where.push("name LIKE ?");
      params.push(`%${search}%`);
    }

    const sql = `SELECT * FROM materials ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY lower(name) ASC`;
    const rows = await all(sql, params);
    response.json({ materials: rows.map(mapMaterialRow) });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.post("/api/materials", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);
    if (!requestUser || !["admin", "manager", "logistics"].includes(requestUser.role)) {
      response.status(403).json({ error: "Access denied." });
      return;
    }

    const name = normalizeText(request.body?.name);
    const category = normalizeText(request.body?.category);
    const stock = Number(request.body?.stock || 0);
    const criticalLevel = Number(request.body?.criticalLevel || 0);
    const unit = normalizeText(request.body?.unit || "kgs");

    if (!name) return response.status(400).json({ error: "Material name is required." });
    if (!["printing", "lamination", "general"].includes(category)) return response.status(400).json({ error: "Invalid category." });
    if (!Number.isFinite(stock) || stock < 0) return response.status(400).json({ error: "Stock must be 0 or greater." });
    if (!Number.isFinite(criticalLevel) || criticalLevel < 0) return response.status(400).json({ error: "Critical level must be 0 or greater." });
    if (!["kgs", "rolls", "pcs"].includes(unit)) return response.status(400).json({ error: "Invalid unit." });

    const duplicate = await get("SELECT id FROM materials WHERE name = ? COLLATE NOCASE", [name]);
    if (duplicate) return response.status(409).json({ error: "Material name already exists." });

    const now = getPhilippineTimestamp();
    const result = await run(
      "INSERT INTO materials (name, category, stock, critical_level, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, category, stock, criticalLevel, unit, now, now]
    );

    const created = await get("SELECT * FROM materials WHERE id = ?", [result.lastID || result.id]);
    const mapped = mapMaterialRow(created);

    await createActivityLog({
      request,
      moduleName: "Materials",
      action: "Add Material",
      referenceType: "material",
      referenceId: mapped.id,
      referenceLabel: mapped.name,
      details: `Added material "${mapped.name}" under ${mapped.category} category.`
    });

    response.status(201).json({ material: mapped });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.put("/api/materials/:id", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);
    if (!requestUser || !["admin", "manager", "logistics"].includes(requestUser.role)) {
      response.status(403).json({ error: "Access denied." });
      return;
    }

    const id = Number(request.params.id);
    const name = normalizeText(request.body?.name);
    const category = normalizeText(request.body?.category);
    const stock = Number(request.body?.stock || 0);
    const criticalLevel = Number(request.body?.criticalLevel || 0);
    const unit = normalizeText(request.body?.unit || "kgs");

    if (!name) return response.status(400).json({ error: "Material name is required." });
    if (!["printing", "lamination", "general"].includes(category)) return response.status(400).json({ error: "Invalid category." });
    if (!Number.isFinite(stock) || stock < 0) return response.status(400).json({ error: "Stock must be 0 or greater." });
    if (!Number.isFinite(criticalLevel) || criticalLevel < 0) return response.status(400).json({ error: "Critical level must be 0 or greater." });
    if (!["kgs", "rolls", "pcs"].includes(unit)) return response.status(400).json({ error: "Invalid unit." });

    const existing = await get("SELECT * FROM materials WHERE id = ?", [id]);
    if (!existing) return response.status(404).json({ error: "Material not found." });

    const duplicate = await get("SELECT id FROM materials WHERE name = ? COLLATE NOCASE AND id != ?", [name, id]);
    if (duplicate) return response.status(409).json({ error: "Material name already exists." });

    const now = getPhilippineTimestamp();
    await run(
      "UPDATE materials SET name = ?, category = ?, stock = ?, critical_level = ?, unit = ?, updated_at = ? WHERE id = ?",
      [name, category, stock, criticalLevel, unit, now, id]
    );

    const updated = await get("SELECT * FROM materials WHERE id = ?", [id]);
    const mapped = mapMaterialRow(updated);

    await createActivityLog({
      request,
      moduleName: "Materials",
      action: "Update Material",
      referenceType: "material",
      referenceId: mapped.id,
      referenceLabel: mapped.name,
      details: `Updated material "${mapped.name}".`
    });

    response.json({ material: mapped });
  } catch (error) {
    handleSqliteError(error, response);
  }
});


app.post("/api/materials/:id/issue", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);
    if (!requestUser || !["admin", "manager", "logistics"].includes(requestUser.role)) {
      response.status(403).json({ error: "Access denied." });
      return;
    }

    const id = Number(request.params.id);
    const quantity = Number(request.body?.quantity || 0);
    const joNumber = normalizeText(request.body?.joNumber);
    const issuedTo = normalizeText(request.body?.issuedTo);
    const issueDate = normalizeText(request.body?.date);

    if (quantity <= 0) return response.status(400).json({ error: "Quantity must be greater than zero." });
    if (!joNumber) return response.status(400).json({ error: "J.O. Number is required." });
    if (!issuedTo) return response.status(400).json({ error: "Issued To is required." });
    if (!issueDate) return response.status(400).json({ error: "Date is required." });

    const material = await get("SELECT * FROM materials WHERE id = ?", [id]);
    if (!material) return response.status(404).json({ error: "Material not found." });

    if (material.stock < quantity) {
      return response.status(400).json({ error: `Insufficient stock. Only ${material.stock} ${material.unit} available.` });
    }

    const now = getPhilippineTimestamp();
    await run(
      "UPDATE materials SET stock = stock - ?, updated_at = ? WHERE id = ?",
      [quantity, now, id]
    );

    const updated = await get("SELECT * FROM materials WHERE id = ?", [id]);
    const mapped = mapMaterialRow(updated);

    await createActivityLog({
      request,
      moduleName: "Materials",
      action: "Issue Material",
      referenceType: "material",
      referenceId: mapped.id,
      referenceLabel: mapped.name,
      details: `Issued ${quantity} ${mapped.unit} of ${mapped.name} for J.O. ${joNumber} to ${issuedTo}.`
    });

    response.json({ material: mapped });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.delete("/api/materials/:id", async (request, response) => {
  try {
    const requestUser = await getRequestUser(request);
    if (!requestUser || !["admin", "manager", "logistics"].includes(requestUser.role)) {
      response.status(403).json({ error: "Access denied." });
      return;
    }

    const id = Number(request.params.id);
    const existing = await get("SELECT * FROM materials WHERE id = ?", [id]);
    if (!existing) return response.status(404).json({ error: "Material not found." });

    await run("DELETE FROM materials WHERE id = ?", [id]);

    await createActivityLog({
      request,
      moduleName: "Materials",
      action: "Delete Material",
      referenceType: "material",
      referenceId: id,
      referenceLabel: existing.name,
      details: `Deleted material "${existing.name}".`
    });

    response.json({ ok: true });
  } catch (error) {
    handleSqliteError(error, response);
  }
});

app.use((request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "API route not found." });
    return;
  }

  response.sendFile(path.join(__dirname, "login.html"));
});

initDatabase()
  .then(migrateOrdersJoUniqueConstraintIfNeeded)
  .then(ensureProductionRecordsFinishingStageSchema)
  .then(ensureProductionHistorySchema)
  .then(ensureActivityLogSchema)
  .then(ensureDefaultUsers)
  .then(ensureOrdersAssignmentRoleColumn)
  .then(ensureOrdersDeliveryColumns)
  .then(async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        category TEXT NOT NULL CHECK (category IN ('printing', 'lamination', 'general')),
        stock REAL NOT NULL DEFAULT 0,
        critical_level REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'kgs' CHECK (unit IN ('kgs', 'rolls', 'pcs')),
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category)").catch(() => {});
    await run("CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name)").catch(() => {});
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });
