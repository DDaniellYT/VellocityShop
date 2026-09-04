const bcrypt = require("bcryptjs");
const db = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const { fileTypeFromFile } = require("file-type");
const { z } = require("zod");

require("dotenv").config();
require("express-async-errors"); // must be required before routes are defined

const jwt = require("jsonwebtoken");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

// ---------------------------------------------------------------------------
// Uploads / static dirs
// ---------------------------------------------------------------------------
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const carouselDir = path.join(__dirname, "carousel");
if (!fs.existsSync(carouselDir)) fs.mkdirSync(carouselDir);

app.use("/carousel", express.static(carouselDir));
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === "replace-this-with-a-long-random-string") {
  throw new Error(
    "JWT_SECRET is missing or still set to the placeholder value. Generate a real secret before starting the server."
  );
}

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------
app.use(helmet());

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [process.env.APP_URL]
    : true;

app.use(cors({ origin: allowedOrigins }));


app.use(express.json({ limit: "200kb" }));

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

const twoFactorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please try again in 10 minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this network. Please try again later." },
});

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------
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
  console.log(`[2FA] Verification code for ${toEmail}: ${code}`); // visible for local testing
  if (!process.env.SMTP_HOST) return; // no SMTP configured yet — console log is enough for now
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "no-reply@vellocity3d.com",
    to: toEmail,
    subject: "Your Vellocity3D verification code",
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
}

async function isPasswordPwned(password) {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    const text = await resp.text();
    return text.split("\n").some((line) => line.split(":")[0] === suffix);
  } catch {
    return false; // fail open — don't block registration if the API is down
  }
}

// ---------------------------------------------------------------------------
// Auth: register / verify-email / login / verify-2fa
// ---------------------------------------------------------------------------
app.post("/api/auth/register", registerLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      error: "Username, email and password are required",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({
      error: "Enter a valid email address",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters",
    });
  }

  if (await isPasswordPwned(password)) {
    return res.status(400).json({
      error:
        "This password has appeared in a data breach. Please choose another.",
    });
  }

  const existingUsername = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(normalizedUsername);

  if (existingUsername) {
    return res.status(409).json({
      error: "That username is already taken",
    });
  }

  const existingEmail = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (existingEmail) {
    return res.status(409).json({
      error: "That email is already registered",
    });
  }

  // Make sure email settings exist before creating the account.
  if (!process.env.APP_URL) {
    console.error("APP_URL is missing");
    return res.status(500).json({
      error: "Server email configuration is incomplete.",
    });
  }

  if (!process.env.SMTP_HOST) {
    console.error("SMTP_HOST is missing");
    return res.status(500).json({
      error: "Email service is not configured.",
    });
  }

  const hash = bcrypt.hashSync(password, 10);

  const verifyToken = crypto.randomBytes(32).toString("hex");

  const verifyExpiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString();

  // Create the account and verification record together.
  const createAccount = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO users
          (username, email, password_hash, role, email_verified)
        VALUES
          (?, ?, ?, 'customer', 0)
        `
      )
      .run(
        normalizedUsername,
        normalizedEmail,
        hash
      );

    db.prepare(
      `
      INSERT INTO email_verifications
        (user_id, token, expires_at)
      VALUES
        (?, ?, ?)
      `
    ).run(
      result.lastInsertRowid,
      verifyToken,
      verifyExpiresAt
    );

    return result.lastInsertRowid;
  });

  const userId = createAccount();

  const verifyUrl =
    `${process.env.APP_URL}/verify-email?token=${encodeURIComponent(
      verifyToken
    )}`;

  try {
    await transporter.sendMail({
      from:
        process.env.SMTP_FROM ||
        "no-reply@vellocity3d.com",

      to: normalizedEmail,

      subject: "Verify your Vellocity3D account",

      text: `
Verify your Vellocity3D account.

Click this link to verify your email:

${verifyUrl}

This verification link expires in 24 hours.
      `.trim(),

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Verify your Vellocity3D account</h2>

          <p>
            Thanks for creating your account.
            Click the button below to verify your email address.
          </p>

          <p>
            <a
              href="${verifyUrl}"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#635bff;
                color:white;
                text-decoration:none;
                border-radius:6px;
              "
            >
              Verify my email
            </a>
          </p>

          <p>
            This verification link expires in 24 hours.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error(
      "Failed to send verification email:",
      err
    );

    // Remove the account/token if email delivery failed.
    db.transaction(() => {
      db.prepare(
        "DELETE FROM email_verifications WHERE user_id = ?"
      ).run(userId);

      db.prepare(
        "DELETE FROM users WHERE id = ?"
      ).run(userId);
    })();

    return res.status(500).json({
      error:
        "Your account could not be created because the verification email could not be sent.",
    });
  }

  return res.status(201).json({
    message:
      "Account created. Check your email to verify your account.",
  });
});

app.post("/api/auth/resend-verification", registerLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: "Enter a valid email address",
    });
  }

  const user = db
    .prepare(
      "SELECT id, email, email_verified FROM users WHERE email = ?"
    )
    .get(email);

  // Don't reveal whether an account exists.
  if (!user) {
    return res.json({
      message:
        "If an account exists for that email, a verification email has been sent.",
    });
  }

  if (user.email_verified) {
    return res.json({
      message: "That email is already verified. You can log in.",
    });
  }

  // Remove old verification tokens.
  db.prepare(
    "DELETE FROM email_verifications WHERE user_id = ?"
  ).run(user.id);

  const verifyToken = crypto
    .randomBytes(32)
    .toString("hex");

  const verifyExpiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(
    `INSERT INTO email_verifications
     (user_id, token, expires_at)
     VALUES (?, ?, ?)`
  ).run(
    user.id,
    verifyToken,
    verifyExpiresAt
  );

  const verifyUrl =
    `${process.env.APP_URL}/verify-email?token=${encodeURIComponent(
      verifyToken
    )}`;

  try {
  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      "no-reply@vellocity3d.com",
    to: email,
    subject: "Verify your Vellocity3D account",

    text: `
Verify your Vellocity3D account:

${verifyUrl}

This verification link expires in 24 hours.
    `.trim(),

    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Verify your Vellocity3D account</h2>

        <p>
          Thanks for creating your account.
          Click the button below to verify your email address.
        </p>

        <p>
          <a
            href="${verifyUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#635bff;
              color:white;
              text-decoration:none;
              border-radius:6px;
            "
          >
            Verify my email
          </a>
        </p>

        <p>This verification link expires in 24 hours.</p>
      </div>
    `,
  });
} catch (err) {
  console.error(
    "Failed to send verification email:",
    err
  );

  return res.status(500).json({
    error:
      "Account could not be created because the verification email could not be sent.",
  });
}

  return res.json({
    message:
      "If an account exists for that email, a verification email has been sent.",
  });
});


app.post("/api/auth/verify-email", (req, res) => {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({
      error: "Missing verification token",
    });
  }

  const record = db
    .prepare(
      `SELECT *
       FROM email_verifications
       WHERE token = ?`
    )
    .get(token);

  if (!record) {
    return res.status(400).json({
      error: "Invalid verification link",
    });
  }

  // Check expiration BEFORE consuming the token.
  if (new Date(record.expires_at) < new Date()) {
    db.prepare(
      "DELETE FROM email_verifications WHERE user_id = ?"
    ).run(record.user_id);

    return res.status(400).json({
      error: "This verification link has expired. Please request a new one.",
    });
  }

  const user = db
    .prepare("SELECT id, email_verified FROM users WHERE id = ?")
    .get(record.user_id);

  if (!user) {
    return res.status(400).json({
      error: "Account not found",
    });
  }

  // Already verified is not an error.
  if (user.email_verified) {
    db.prepare(
      "DELETE FROM email_verifications WHERE user_id = ?"
    ).run(record.user_id);

    return res.json({
      message: "Email is already verified. You can now log in.",
    });
  }

  // Make the two database changes atomic.
  const verifyUser = db.transaction(() => {
    db.prepare(
      "UPDATE users SET email_verified = 1 WHERE id = ?"
    ).run(record.user_id);

    db.prepare(
      "DELETE FROM email_verifications WHERE user_id = ?"
    ).run(record.user_id);
  });

  verifyUser();

  return res.json({
    message: "Email verified. You can now log in.",
  });
});


app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  if (!user.email_verified) {
    return res.status(403).json({ error: "Please verify your email before logging in" });
  }

  const code = generateCode();
  const codeHash = bcrypt.hashSync(code, 8);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(user.id);
  db.prepare(
    "INSERT INTO two_factor_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)"
  ).run(user.id, codeHash, expiresAt);

  try {
    await sendCodeEmail(user.email, code);
  } catch (err) {
    console.error("Failed to send 2FA email:", err.message);
  }

  res.json({ requires2FA: true, userId: user.id, email: user.email });
});

app.post("/api/auth/verify-2fa", twoFactorLimiter, (req, res) => {
  const { userId, code } = req.body;

  const record = db.prepare("SELECT * FROM two_factor_codes WHERE user_id = ?").get(userId);
  if (!record || !code || !bcrypt.compareSync(String(code), record.code_hash)) {
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

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
app.post("/api/upload", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const type = await fileTypeFromFile(req.file.path);
  const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (!type || !allowedMimes.includes(type.mime)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Invalid image file" });
  }

  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

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

// Price/total are ALWAYS derived server-side from the products table —
// never trust price or total sent by the client.
app.post("/api/orders", requireAuth, (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one item is required" });
  }

  const getProduct = db.prepare("SELECT * FROM products WHERE id = ?");
  let total = 0;
  const resolvedItems = [];

  for (const item of items) {
    const product = getProduct.get(item.productId);
    if (!product) {
      return res.status(400).json({ error: `Invalid product: ${item.productId}` });
    }
    const qty = Math.max(1, Number(item.qty) || 1);
    total += product.price * qty;
    resolvedItems.push({
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      qty,
    });
  }

  const orderNumber = generateUniqueOrderNumber();

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, order_number, total)
    VALUES (@user_id, @order_number, @total)
  `);
  const orderResult = insertOrder.run({
    user_id: req.user.id,
    order_number: orderNumber,
    total,
  });

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, price, qty)
    VALUES (@order_id, @product_id, @product_name, @price, @qty)
  `);
  for (const item of resolvedItems) {
    insertItem.run({ order_id: orderResult.lastInsertRowid, ...item });
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
  const orders = db
    .prepare(
      `
    SELECT orders.*, users.username, users.email
    FROM orders
    JOIN users ON users.id = orders.user_id
    ORDER BY orders.id DESC
  `
    )
    .all();
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

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  long_description: z.string().max(10000).optional(),
  specs: z.string().max(5000).optional(),
  price: z.number().nonnegative(),
  category: z.string().max(100).optional(),
  stock: z.number().int().nonnegative().optional(),
  image: z.string().max(500).optional(),
});

// CREATE
app.post("/api/products", requireAdmin, (req, res) => {
  const parsed = productSchema.safeParse({
    ...req.body,
    price: Number(req.body.price),
    stock: req.body.stock !== undefined ? Number(req.body.stock) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { name, description, long_description, specs, price, category, stock, image } = parsed.data;

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
    price,
    stock: stock !== undefined ? stock : 0,
    image: image || "https://placehold.co/400x400?text=No+Image",
    position: nextPosition,
  });

  const newProduct = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);

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
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const parsed = productSchema.partial().safeParse({
    ...req.body,
    price: req.body.price !== undefined ? Number(req.body.price) : undefined,
    stock: req.body.stock !== undefined ? Number(req.body.stock) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { name, description, long_description, specs, price, category, stock, image } = parsed.data;

  const updated = {
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    long_description: long_description !== undefined ? long_description : existing.long_description,
    specs: specs !== undefined ? specs : existing.specs,
    price: price !== undefined ? price : existing.price,
    category: category !== undefined ? category : existing.category,
    stock: stock !== undefined ? stock : existing.stock,
    image: image !== undefined ? image : existing.image,
  };

  db.prepare(
    `
    UPDATE products
    SET name = @name, description = @description, long_description = @long_description,
        specs = @specs, price = @price, category = @category, stock = @stock, image = @image
    WHERE id = @id
  `
  ).run({ ...updated, id: req.params.id });

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
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
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

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Product Shop API is running. Try GET /api/products");
});

// ---------------------------------------------------------------------------
// 404 + global error handler — must be the LAST two app.use() calls
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Product Shop API listening on http://localhost:${PORT}`);
});