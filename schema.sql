PRAGMA foreign_keys = ON;


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
);



CREATE TABLE IF NOT EXISTS orders (
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
  assign_to_role TEXT NOT NULL DEFAULT 'production_staff' CHECK (assign_to_role IN ('production_staff', 'lockkey_production', 'happy_production')),
  delivery_date TEXT NOT NULL,
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'production', 'delivery', 'delivered', 'cancelled')),
  delivery_process_type TEXT,
  delivery_rolls INTEGER,
  delivery_total_kgs REAL,
  delivery_bags INTEGER,
  delivery_pcs_per_bag INTEGER,
  moved_to_delivery_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_po_number ON orders(po_number);
CREATE INDEX IF NOT EXISTS idx_orders_jo_number ON orders(jo_number);

CREATE TRIGGER IF NOT EXISTS orders_updated_at
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  UPDATE orders
  SET updated_at = datetime('now', '+8 hours')
  WHERE id = OLD.id;
END;


CREATE TABLE IF NOT EXISTS production_records (
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
);

CREATE INDEX IF NOT EXISTS idx_production_records_order_id ON production_records(order_id);
CREATE INDEX IF NOT EXISTS idx_production_records_stage ON production_records(stage);
CREATE INDEX IF NOT EXISTS idx_production_records_stage_status ON production_records(stage_status);
CREATE INDEX IF NOT EXISTS idx_production_records_taken_at ON production_records(taken_at);

CREATE TRIGGER IF NOT EXISTS production_records_updated_at
AFTER UPDATE ON production_records
FOR EACH ROW
BEGIN
  UPDATE production_records
  SET updated_at = datetime('now', '+8 hours')
  WHERE id = OLD.id;
END;


CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS notification_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notification_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_events_module_record ON notification_events(module_name, record_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON notification_events(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);

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
);

CREATE INDEX IF NOT EXISTS idx_production_history_key ON production_history(history_key);
CREATE INDEX IF NOT EXISTS idx_production_history_order ON production_history(order_id);
CREATE INDEX IF NOT EXISTS idx_production_history_record ON production_history(production_record_id);
CREATE INDEX IF NOT EXISTS idx_production_history_created_at ON production_history(created_at);


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
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_username ON activity_logs(username);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
