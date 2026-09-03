const bcrypt = require("bcryptjs");
const db = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");


require("dotenv").config();
const jwt = require("jsonwebtoken");

const express = require("express");
const cors = require("cors");

const app = express();

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const carouselDir = path.join(__dirname, "carousel");
if (!fs.existsSync(carouselDir)) fs.mkdirSync(carouselDir);

app.use("/carousel", express.static(carouselDir));
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* For uploading images of products */

app.post("/api/upload", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

let nextId = 4;
const JWT_SECRET = process.env.JWT_SECRET;

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
  max: 5, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

const twoFactorLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 10 minutes
  max: 3, // 8 code attempts per IP per window — a 6-digit code has 1M combos, so this shuts down brute-forcing fast
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please try again in 10 minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 5 new accounts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this network. Please try again later." },
});
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

async function sendCodeEmail(toEmail, code) {
  console.log(`[2FA] Verification code for ${toEmail}: ${code}`); // always visible for local testing
  if (!process.env.SMTP_HOST) return; // no SMTP configured yet — console log is enough for now
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "no-reply@vellocity3d.com",
    to: toEmail,
    subject: "Your Vellocity3D verification code",
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
}

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(user.id);
  db.prepare(
    "INSERT INTO two_factor_codes (user_id, code, expires_at) VALUES (?, ?, ?)"
  ).run(user.id, code, expiresAt);

  try {
    await sendCodeEmail(user.email, code);
  } catch (err) {
    console.error("Failed to send 2FA email:", err.message);
  }

  res.json({ requires2FA: true, userId: user.id, email: user.email });
});

app.post("/api/auth/register", registerLimiter, (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email and password are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const existingUsername = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existingUsername) return res.status(409).json({ error: "That username is already taken" });

  const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existingEmail) return res.status(409).json({ error: "That email is already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'customer')")
    .run(username, email, hash);

  const token = jwt.sign(
    { id: result.lastInsertRowid, username, role: "customer" },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.status(201).json({ token, username, role: "customer" });
});

app.post("/api/auth/verify-2fa", twoFactorLimiter, (req, res) => {
  const { userId, code } = req.body;

  const record = db.prepare("SELECT * FROM two_factor_codes WHERE user_id = ?").get(userId);
  if (!record || record.code !== code) {
    return res.status(401).json({ error: "Invalid code" });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res.status(401).json({ error: "Code expired, please log in again" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(userId);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({ token, username: user.username, role: user.role });
});


function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });
}

app.get("/api/carousel", (req, res) => {
  const allowed = /\.(png|jpe?g|webp|gif|avif)$/i;
  const files = fs
    .readdirSync(carouselDir)
    .filter((f) => allowed.test(f))
    .sort();

  res.json(files.map((f) => `/carousel/${f}`));
});
// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
function generateOrderNumber() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${rand}`;
}

function generateUniqueOrderNumber() {
  const existing = db.prepare("SELECT 1 FROM orders WHERE order_number = ?");
  let candidate;
  do {
    candidate = generateOrderNumber();
  } while (existing.get(candidate));
  return candidate;
}

app.post("/api/orders", requireAuth, (req, res) => {
  const { items, total } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one item is required" });
  }

  const orderNumber = generateUniqueOrderNumber();

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, order_number, total)
    VALUES (@user_id, @order_number, @total)
  `);
  const orderResult = insertOrder.run({
    user_id: req.user.id,
    order_number: orderNumber,
    total: Number(total) || 0,
  });

  // ...rest stays the same (inserting order_items, then responding)

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, price, qty)
    VALUES (@order_id, @product_id, @product_name, @price, @qty)
  `);
  for (const item of items) {
    insertItem.run({
      order_id: orderResult.lastInsertRowid,
      product_id: item.productId ?? null,
      product_name: item.name || "Unknown product",
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
    });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderResult.lastInsertRowid);
  const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);

  res.status(201).json({ ...order, items: orderItems });
});

app.get("/api/orders/mine", requireAuth, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  const itemsStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
  const result = orders.map((order) => ({
    ...order,
    items: itemsStmt.all(order.id),
  }));
  res.json(result);
});

// Admin — every order, across every customer
app.get("/api/orders", requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, users.username, users.email
    FROM orders
    JOIN users ON users.id = orders.user_id
    ORDER BY orders.id DESC
  `).all();
  const itemsStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
  const result = orders.map((order) => ({
    ...order,
    items: itemsStmt.all(order.id),
  }));
  res.json(result);
});

// Admin — mark an order pending/completed
app.patch("/api/orders/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!["pending", "completed"].includes(status)) {
    return res.status(400).json({ error: "status must be 'pending' or 'completed'" });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  res.json({ ...updated, items });
});


// ---------------------------------------------------------------------------
// Routes — CRUD on /api/products
// ---------------------------------------------------------------------------

// CREATE

app.post("/api/products", requireAdmin, (req, res) => {
  const { name, description, long_description, specs, price, category, stock, image } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: "name and price are required" });
  }

  const maxPos = db.prepare("SELECT MAX(position) AS maxPos FROM products").get().maxPos;
  const nextPosition = maxPos === null ? 0 : maxPos + 1;

  const insert = db.prepare(`
    INSERT INTO products (name, description, long_description, specs, price, category, stock, image, position)
    VALUES (@name, @description, @long_description, @specs, @price, @category, @stock, @image, @position)
  `);

  const result = insert.run({
    name, 
    description: description || "",
    long_description: long_description || "",
    specs: specs || "",
    category: category || "Uncategorized",
    price: Number(price),
    stock: stock !== undefined ? Number(stock) : 0,
    image: image || "https://placehold.co/400x400?text=No+Image",
    position: nextPosition,
  }); 

  const newProduct = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(newProduct);
});

// REORDER (bulk — used by drag-and-drop)
app.post("/api/products/reorder", requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array is required" });
  }

  const update = db.prepare("UPDATE products SET position = ? WHERE id = ?");
  const reorder = db.transaction((idList) => {
    idList.forEach((id, index) => update.run(index, id));
  });
  reorder(ids);

  const allProducts = db.prepare("SELECT * FROM products ORDER BY position ASC, id ASC").all();
  res.json(allProducts);
});

// READ (all)
app.get("/api/products", (req, res) => {
  const allProducts = db.prepare("SELECT * FROM products ORDER BY position ASC, id ASC").all();
  res.json(allProducts);
});
// READ (one)
app.get("/api/products/:id", (req, res) => {
  
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});
// UPDATE
app.put("/api/products/:id", requireAdmin, (req, res) => {
  const existing = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(req.params.id);

  if (!existing) return res.status(404).json({ error: "Product not found" });

  const { name, description, long_description, specs, price, category, stock, image } = req.body;

  const updated = {
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    long_description: long_description !== undefined ? long_description : existing.long_description,
    specs: specs !== undefined ? specs : existing.specs,
    price: price !== undefined ? Number(price) : existing.price,
    category: category !== undefined ? category : existing.category,
    stock: stock !== undefined ? Number(stock) : existing.stock,
    image: image !== undefined ? image : existing.image,
  };

  db.prepare(`
    UPDATE products
    SET name = @name, description = @description, long_description = @long_description,
        specs = @specs, price = @price, category = @category, stock = @stock, image = @image
    WHERE id = @id
  `).run({ ...updated, id: req.params.id });

  const result = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json(result);
});

// MOVE (reorder by one position, left or right)
app.post("/api/products/:id/move", requireAdmin, (req, res) => {
  const { direction } = req.body; // "left" | "right"
  if (!["left", "right"].includes(direction)) {
    return res.status(400).json({ error: "direction must be 'left' or 'right'" });
  }

  const current = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Product not found" });

  const neighbor =
    direction === "left"
      ? db
          .prepare("SELECT * FROM products WHERE position < ? ORDER BY position DESC LIMIT 1")
          .get(current.position)
      : db
          .prepare("SELECT * FROM products WHERE position > ? ORDER BY position ASC LIMIT 1")
          .get(current.position);

  if (neighbor) {
    const swap = db.transaction(() => {
      db.prepare("UPDATE products SET position = ? WHERE id = ?").run(neighbor.position, current.id);
      db.prepare("UPDATE products SET position = ? WHERE id = ?").run(current.position, neighbor.id);
    });
    swap();
  }
  // if no neighbor, the product is already at that edge — nothing to swap, just return current order

  const allProducts = db.prepare("SELECT * FROM products ORDER BY position ASC, id ASC").all();
  res.json(allProducts);
});


// DELETE
app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const product = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(req.params.id);

  if (!product) return res.status(404).json({ error: "Product not found" });

  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);

  // Clean up the image file on disk, if it was one we uploaded ourselves.
  if (product.image && product.image.startsWith("/uploads/")) {
    const filePath = path.join(uploadsDir, path.basename(product.image));
    fs.unlink(filePath, (err) => {
      if (err && err.code !== "ENOENT") {
        console.error("Failed to delete image file:", filePath, err.message);
      }
    });
  }

  res.json({ message: "Product deleted", product });
});

// Admin — set/update the AWB number and carrier for an order
app.patch("/api/orders/:id/awb", requireAdmin, (req, res) => {
  const { awb_number, carrier } = req.body;

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  db.prepare("UPDATE orders SET awb_number = ?, carrier = ? WHERE id = ?").run(
    awb_number || null,
    carrier || null,
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  res.json({ ...updated, items });
});

// Health check
app.get("/", (req, res) => {
  res.send("Product Shop API is running. Try GET /api/products");
});

app.listen(PORT, () => {
  console.log(`Product Shop API listening on http://localhost:${PORT}`);
});