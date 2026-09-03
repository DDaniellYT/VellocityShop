const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "shop.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS two_factor_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    long_description TEXT DEFAULT '',
    specs TEXT DEFAULT '',
    price REAL NOT NULL,
    category TEXT DEFAULT 'Uncategorized',
    stock INTEGER DEFAULT 0,
    image TEXT DEFAULT '',
    position INTEGER
  )
`);

// Existing databases created before "position" existed won't have the column —
// add it if missing, then backfill any NULL positions using current id order.
try {
  db.exec("ALTER TABLE products ADD COLUMN position INTEGER");
} catch {
  // column already exists — safe to ignore
}

const needsBackfill = db
  .prepare("SELECT COUNT(*) AS c FROM products WHERE position IS NULL")
  .get().c;

if (needsBackfill > 0) {
  const rows = db.prepare("SELECT id FROM products ORDER BY id ASC").all();
  const update = db.prepare("UPDATE products SET position = ? WHERE id = ?");
  rows.forEach((row, index) => update.run(index, row.id));
}

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_number TEXT NOT NULL UNIQUE,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Existing databases created before "status" existed won't have the column —
// add it if missing; every existing order defaults to 'pending'.
try {
  db.exec("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
} catch {
  // column already exists — safe to ignore
}

// Existing databases won't have these columns yet — add them if missing.
try {
  db.exec("ALTER TABLE orders ADD COLUMN awb_number TEXT");
} catch {
  // column already exists — safe to ignore
}
try {
  db.exec("ALTER TABLE orders ADD COLUMN carrier TEXT");
} catch {
  // column already exists — safe to ignore
}

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    qty INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )
`);
module.exports = db;