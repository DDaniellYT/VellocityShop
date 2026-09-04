const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "shop.db"));

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    email_verified INTEGER NOT NULL DEFAULT 0
  )
`);

// Existing databases created before email_verified existed
// won't have the column, so add it if necessary.
try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0
  `);
} catch {
  // Column already exists — safe to ignore.
}

// ---------------------------------------------------------------------------
// Email verification tokens
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ---------------------------------------------------------------------------
// Two-factor authentication codes
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS two_factor_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Products migrations for older databases
// ---------------------------------------------------------------------------
function addColumnIfMissing(table, column, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  const exists = columns.some(
    (col) => col.name === column
  );

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );

    console.log(
      `Added missing column ${table}.${column}`
    );
  }
}

addColumnIfMissing(
  "products",
  "description",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "products",
  "long_description",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "products",
  "specs",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "products",
  "category",
  "TEXT DEFAULT 'Uncategorized'"
);

addColumnIfMissing(
  "products",
  "stock",
  "INTEGER DEFAULT 0"
);

addColumnIfMissing(
  "products",
  "image",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "products",
  "position",
  "INTEGER"
);

// Backfill NULL positions using current ID order.
const needsBackfill = db
  .prepare(
    "SELECT COUNT(*) AS c FROM products WHERE position IS NULL"
  )
  .get().c;

if (needsBackfill > 0) {
  const rows = db
    .prepare("SELECT id FROM products ORDER BY id ASC")
    .all();

  const update = db.prepare(
    "UPDATE products SET position = ? WHERE id = ?"
  );

  rows.forEach((row, index) => {
    update.run(index, row.id);
  });
}
// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
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

// Existing databases created before status existed.
try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  `);
} catch {
  // Column already exists — safe to ignore.
}

// AWB number
try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN awb_number TEXT
  `);
} catch {
  // Column already exists — safe to ignore.
}

// Carrier
try {
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN carrier TEXT
  `);
} catch {
  // Column already exists — safe to ignore.
}

// ---------------------------------------------------------------------------
// Order items
// ---------------------------------------------------------------------------
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
