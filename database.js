const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const databasePath = path.join(__dirname, "production_fresh.db");
const schemaPath = path.join(__dirname, "schema.sql");

const db = new sqlite3.Database(databasePath, (error) => {
  if (error) {
    console.error("Database connection failed:", error.message);
    return;
  }

  console.log(`Connected to SQLite database: ${databasePath}`);
});

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("PRAGMA foreign_keys = ON");

      if (!fs.existsSync(schemaPath)) {
        console.warn("schema.sql not found. Skipping schema initialization.");
        resolve();
        return;
      }

      const schema = fs.readFileSync(schemaPath, "utf8");

      db.exec(schema, (error) => {
        if (error) {
          console.error("Schema initialization failed:", error.message);
          reject(error);
          return;
        }

        console.log("Database schema is ready.");
        resolve();
      });
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        id: this.lastID,
        changes: this.changes
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

module.exports = {
  db,
  databasePath,
  initDatabase,
  run,
  get,
  all
};
