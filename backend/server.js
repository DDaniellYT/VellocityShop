// ---------------------------------------------------------------------------
// Vellocity Shop API
//
// Environment variables
//   Required:  JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   Production: NODE_ENV=production, APP_URL (https://yourdomain.com, no trailing slash),
//               SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
//   Optional:  PORT, TRUST_PROXY=true (behind Railway/Fly/Nginx/Caddy),
//              DATA_DIR (persistent volume, e.g. /data),
//              STRIPE_CURRENCY (default usd),
//              SHIPPING_COUNTRIES (comma-separated ISO codes, default RO),
//              CROSS_ORIGIN_ASSETS=true (only if frontend is on a different domain),
//              FRONTEND_DIST (path to built frontend, default ../frontend/dist)
// ---------------------------------------------------------------------------

require("dotenv").config(); // first, so db.js and everything below can read env vars
require("express-async-errors"); // must be required before routes are defined

const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const db = require("./db");
const { Resend } = require("resend");

const app = express();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 5000;
const APP_URL = (process.env.APP_URL || "").replace(/\/+$/, "");
const DATA_DIR = process.env.DATA_DIR || __dirname;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === "replace-this-with-a-long-random-string") {
  throw new Error(
    "JWT_SECRET is missing or still set to the placeholder value. Generate a real secret before starting the server."
  );
}
if (IS_PROD && !APP_URL) {
  throw new Error("APP_URL is required in production (e.g. https://yourdomain.com).");
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
const SHIPPING_COUNTRIES = (process.env.SHIPPING_COUNTRIES || "RO")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is missing. Add it to your .env file.");
}
if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is missing. Add it to your .env file.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const moneyFmt = new Intl.NumberFormat("en", {
  style: "currency",
  currency: STRIPE_CURRENCY.toUpperCase(),
});
const money = (n) => moneyFmt.format(Number(n));

// Used so login takes the same time whether or not the username exists.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

// ---------------------------------------------------------------------------
// Uploads / static dirs
// ---------------------------------------------------------------------------
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`Could not create directory ${dir}:`, err.message);
  }
}

const uploadsDir = path.join(DATA_DIR, "uploads");
const carouselDir = path.join(DATA_DIR, "carousel");
ensureDir(uploadsDir);
ensureDir(carouselDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${crypto.randomInt(0, 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /^\.(jpeg|jpg|png|webp|gif)$/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ok) return cb(null, true);
    const err = new Error("Only image files are allowed");
    err.status = 400;
    cb(err, false);
  },
});

// ---------------------------------------------------------------------------
// DB migration: extra columns (safe to run on every start)
// ---------------------------------------------------------------------------
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}
ensureColumn("orders", "payment_status", "TEXT DEFAULT 'unpaid'");
ensureColumn("orders", "stripe_session_id", "TEXT");
ensureColumn("orders", "paid_at", "TEXT");
ensureColumn("orders", "shipping_json", "TEXT"); // name/address/phone collected by Stripe
ensureColumn("two_factor_codes", "attempts", "INTEGER DEFAULT 0");

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------

app.set("trust proxy", 1);

app.use(
  helmet({
    // Only relax this if the frontend lives on a different domain than the API.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https://placehold.co"],
      },
    },
  })
);

app.use(cors({ 
  origin: "https://vellocity3d.vercel.app", 
  credentials: true
}));

app.use("/carousel", express.static(carouselDir));
app.use("/uploads", express.static(uploadsDir));

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------
async function sendMail({ to, subject, text, html }) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Vellocity3D", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits, cryptographically secure
}

async function sendCodeEmail(toEmail, code) {
  if (!IS_PROD) {
    console.log(`[2FA] Verification code for ${toEmail}: ${code}`); // local testing only
  }
  if (!process.env.BREVO_KEY) {
    if (IS_PROD) throw new Error("SMTP_HOST is not configured");
    return; // no SMTP configured yet — console log is enough for local dev
  }
  await sendMail({
    to: toEmail,
    subject: "Your Vellocity3D verification code",
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
}

async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: toEmail,
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
        <p>Thanks for creating your account. Click the button below to verify your email address.</p>
        <p>
          <a href="${verifyUrl}"
             style="display:inline-block;padding:12px 20px;background:#635bff;color:white;text-decoration:none;border-radius:6px;">
            Verify my email
          </a>
        </p>
        <p>This verification link expires in 24 hours.</p>
      </div>
    `,
  });
}

// ---------------------------------------------------------------------------
// Order status emails (template + sender)
// ---------------------------------------------------------------------------
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

function renderOrderEmail({ kind, order, items, username }) {
  const itemsText = items
    .map((i) => `- ${i.product_name} x${i.qty} — ${money(i.price * i.qty)}`)
    .join("\n");

  const itemsHtml = items
    .map(
      (i) => `
      <tr>
        <td style="padding:6px 0">${escapeHtml(i.product_name)} × ${i.qty}</td>
        <td style="padding:6px 0;text-align:right">${money(i.price * i.qty)}</td>
      </tr>`
    )
    .join("");

  const templates = {
    paid: {
      subject: `Payment received for order ${order.order_number}`,
      headline: "Payment received",
      intro: `Hi ${username}, we received your payment. We'll start preparing your order.`,
      extra: "",
    },
    awb: {
      subject: `Your order ${order.order_number} has been shipped`,
      headline: "Your order is on its way",
      intro: `Hi ${username}, your order has been handed to ${order.carrier || "the carrier"}.`,
      extra: order.awb_number
        ? `Tracking (AWB): ${order.awb_number} — Carrier: ${order.carrier || "-"}`
        : "",
    },
    completed: {
      subject: `Your order ${order.order_number} is complete`,
      headline: "Your order is complete",
      intro: `Hi ${username}, your order has been completed. Thank you for shopping with us!`,
      extra: order.awb_number ? `Tracking (AWB): ${order.awb_number}` : "",
    },
  };

  const t = templates[kind];
  if (!t) throw new Error(`Unknown email kind: ${kind}`);

  const text = `
${t.headline}

${t.intro}

Order: ${order.order_number}
${t.extra}

${itemsText}

Total: ${money(order.total)}
  `.trim();

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px;margin:0 auto">
      <h2>${escapeHtml(t.headline)}</h2>
      <p>${escapeHtml(t.intro)}</p>
      <p><strong>Order:</strong> ${escapeHtml(order.order_number)}<br>
         ${t.extra ? escapeHtml(t.extra) : ""}</p>
      <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
      <p style="text-align:right"><strong>Total: ${money(order.total)}</strong></p>
    </div>`;

  return { subject: t.subject, text, html };
}

// Never throws — a failed email must not make the admin action fail.
async function sendOrderStatusEmail(orderId, kind) {
  try {
    if (!process.env.BREVO_KEY) return; // no SMTP configured yet

    const order = db
      .prepare(
        `SELECT orders.*, users.username, users.email
         FROM orders JOIN users ON users.id = orders.user_id
         WHERE orders.id = ?`
      )
      .get(orderId);
    if (!order) return;

    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
    const { subject, text, html } = renderOrderEmail({
      kind,
      order,
      items,
      username: order.username,
    });

    await sendMail({to: order.email, subject, text, html });
  } catch (err) {
    console.error(`Failed to send "${kind}" email for order ${orderId}:`, err.message);
  }
}

async function isPasswordPwned(password) {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(4000),
    });
    const text = await resp.text();
    return text.split("\n").some((line) => line.split(":")[0].trim() === suffix);
  } catch {
    return false; // fail open — don't block registration if the API is down
  }
}

// ---------------------------------------------------------------------------
// Payments (Stripe Checkout) — helpers
// ---------------------------------------------------------------------------

// Returns the name of the first product without enough stock, or null if all OK.
function findStockProblem(items) {
  const getStock = db.prepare("SELECT stock FROM products WHERE id = ?");
  for (const i of items) {
    const p = getStock.get(i.product_id);
    if (!p || p.stock < i.qty) return i.product_name;
  }
  return null;
}

async function createCheckoutSession(order, items) {
  if (!APP_URL) throw new Error("APP_URL is missing");

  const user = db.prepare("SELECT email FROM users WHERE id = ?").get(order.user_id);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: String(order.id),
    metadata: { order_id: String(order.id), order_number: order.order_number },
    payment_intent_data: {
      metadata: { order_id: String(order.id), order_number: order.order_number },
    },
    customer_email: user ? user.email : undefined,
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    phone_number_collection: { enabled: true },
    line_items: items.map((i) => ({
      quantity: i.qty,
      price_data: {
        currency: STRIPE_CURRENCY,
        unit_amount: Math.round(i.price * 100), // smallest currency unit
        product_data: { name: i.product_name },
      },
    })),
    success_url: `${APP_URL}/?payment=success&order=${encodeURIComponent(order.order_number)}`,
    cancel_url: `${APP_URL}/?payment=cancelled&order=${encodeURIComponent(order.order_number)}`,
  });

  db.prepare("UPDATE orders SET stripe_session_id = ? WHERE id = ?").run(session.id, order.id);
  return session;
}

// Before creating a new Checkout session for a retry, make sure the previous
// one can no longer be paid (otherwise the customer could be charged twice).
async function retireOldSession(order) {
  if (!order.stripe_session_id) return "none";
  try {
    const old = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (old.payment_status === "paid") {
      markOrderPaid(old);
      return "paid";
    }
    if (old.status === "open") {
      await stripe.checkout.sessions.expire(old.id);
    }
  } catch (err) {
    console.error("Could not retire old Stripe session:", err.message);
  }
  return "retired";
}

const markPaidTx = db.transaction((order, session, shippingJson) => {
  db.prepare(
    `UPDATE orders
     SET payment_status = 'paid', paid_at = ?, stripe_session_id = ?, shipping_json = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), session.id, shippingJson, order.id);

  // Take the purchased quantities out of stock (never below zero).
  const items = db.prepare("SELECT product_id, qty FROM order_items WHERE order_id = ?").all(order.id);
  const dec = db.prepare("UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?");
  for (const it of items) dec.run(it.qty, it.product_id);
});

function markOrderPaid(session) {
  const orderId = Number(session.metadata && session.metadata.order_id);
  if (!orderId) return;

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return;
  if (order.payment_status === "paid") return; // webhooks can be delivered more than once

  // Safety check: what Stripe charged must match what we expected.
  const expectedCents = Math.round(Number(order.total) * 100);
  if (session.amount_total !== expectedCents) {
    console.error(
      `Stripe amount mismatch for order ${order.order_number}: expected ${expectedCents}, got ${session.amount_total}`
    );
    return;
  }

  // Shipping details collected by Stripe (field moved in newer API versions).
  const sd =
    (session.collected_information && session.collected_information.shipping_details) ||
    session.shipping_details ||
    null;
  const shippingJson = sd
    ? JSON.stringify({
        name: sd.name || null,
        address: sd.address || null,
        phone: (session.customer_details && session.customer_details.phone) || null,
      })
    : null;

  markPaidTx(order, session, shippingJson);

  sendOrderStatusEmail(order.id, "paid"); // not awaited on purpose
}

function setUnpaidOrderStatus(session, newStatus) {
  const orderId = Number(session.metadata && session.metadata.order_id);
  if (!orderId) return;
  // Only touch orders still waiting on THIS session; never downgrade a paid order.
  db.prepare(
    "UPDATE orders SET payment_status = ? WHERE id = ? AND payment_status = 'unpaid' AND stripe_session_id = ?"
  ).run(newStatus, orderId, session.id);
}

// ---------------------------------------------------------------------------
// Stripe webhook — MUST be registered BEFORE express.json(), because Stripe
// signature verification needs the raw, unparsed request body.
// ---------------------------------------------------------------------------
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature check failed:", err.message);
    return res.status(400).send("Webhook signature verification failed");
  }

  const session = event.data.object;

  try {
    switch (event.type) {
      case "checkout.session.completed":
        // For instant methods (cards) this is already "paid".
        // For delayed methods it stays "unpaid" until async_payment_succeeded.
        if (session.payment_status === "paid") markOrderPaid(session);
        break;

      case "checkout.session.async_payment_succeeded":
        markOrderPaid(session);
        break;

      case "checkout.session.async_payment_failed":
        setUnpaidOrderStatus(session, "failed");
        break;

      case "checkout.session.expired":
        setUnpaidOrderStatus(session, "expired");
        break;

      default:
        break;
    }
  } catch (err) {
    // A real failure (e.g. DB error): answer 500 so Stripe retries later.
    console.error("Stripe webhook handler failed:", err);
    return res.status(500).send("Webhook handler error");
  }

  res.json({ received: true });
});

app.use(express.json({ limit: "200kb" }));

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true, // only failed logins count against the limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

const twoFactorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please try again in 10 minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this network. Please try again later." },
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout attempts. Please try again shortly." },
});

// ---------------------------------------------------------------------------
// Auth: register / verify-email / login / verify-2fa
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/auth/register", registerLimiter, async (req, res) => {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email and password are required" });
  }
  if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Invalid input" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  if (normalizedUsername.length < 3 || normalizedUsername.length > 32) {
    return res.status(400).json({ error: "Username must be 3–32 characters" });
  }
  if (!EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: "Password must be 8–72 characters" });
  }
  if (await isPasswordPwned(password)) {
    return res.status(400).json({
      error: "This password has appeared in a data breach. Please choose another.",
    });
  }

  const existingUsername = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(normalizedUsername);
  if (existingUsername) {
    return res.status(409).json({ error: "That username is already taken" });
  }

  const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existingEmail) {
    return res.status(409).json({ error: "That email is already registered" });
  }

  // Make sure email settings exist before creating the account.
  if (!APP_URL) {
    console.error("APP_URL is missing");
    return res.status(500).json({ error: "Server email configuration is incomplete." });
  }
  if (!process.env.BREVO_KEY) {
    console.error("SMTP_HOST is missing");
    return res.status(500).json({ error: "Email service is not configured." });
  }

  const hash = await bcrypt.hash(password, 10);
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Create the account and verification record together.
  const createAccount = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, role, email_verified)
         VALUES (?, ?, ?, 'customer', 0)`
      )
      .run(normalizedUsername, normalizedEmail, hash);

    db.prepare(
      "INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).run(result.lastInsertRowid, verifyToken, verifyExpiresAt);

    return result.lastInsertRowid;
  });

  let userId;
  try {
    userId = createAccount();
  } catch (err) {
    // Two simultaneous registrations can slip past the SELECT checks above.
    if (err && String(err.code).startsWith("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: "That username or email is already registered" });
    }
    throw err;
  }

  try {
    await sendVerificationEmail(normalizedEmail, verifyToken);
  } catch (err) {
    console.error("Failed to send verification email:", err);

    // Remove the account/token if email delivery failed.
    db.transaction(() => {
      db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    })();

    return res.status(500).json({
      error: "Your account could not be created because the verification email could not be sent.",
    });
  }

  return res.status(201).json({
    message: "Account created. Check your email to verify your account.",
  });
});

app.post("/api/auth/resend-verification", registerLimiter, async (req, res) => {
  const rawEmail = req.body && req.body.email;

  if (typeof rawEmail !== "string" || !EMAIL_RE.test(rawEmail.trim())) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  const email = rawEmail.trim().toLowerCase();

  const genericReply = {
    message: "If an account exists for that email, a verification email has been sent.",
  };

  const user = db
    .prepare("SELECT id, email, email_verified FROM users WHERE email = ?")
    .get(email);

  // Don't reveal whether an account exists.
  if (!user) return res.json(genericReply);

  if (user.email_verified) {
    return res.json({ message: "That email is already verified. You can log in." });
  }

  if (!APP_URL || !process.env.BREVO_KEY) {
    console.error("APP_URL or SMTP_HOST is missing");
    return res.status(500).json({ error: "Email service is not configured." });
  }

  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Replace old tokens with a fresh one.
  db.transaction(() => {
    db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(user.id);
    db.prepare(
      "INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).run(user.id, verifyToken, verifyExpiresAt);
  })();

  try {
    await sendVerificationEmail(user.email, verifyToken);
  } catch (err) {
    console.error("Failed to send verification email:", err);
    return res.status(500).json({
      error: "The verification email could not be sent. Please try again later.",
    });
  }

  return res.json(genericReply);
});

app.post("/api/auth/verify-email", (req, res) => {
  const token = req.body && req.body.token;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing verification token" });
  }

  const record = db.prepare("SELECT * FROM email_verifications WHERE token = ?").get(token);
  if (!record) {
    return res.status(400).json({ error: "Invalid verification link" });
  }

  // Check expiration BEFORE consuming the token.
  if (new Date(record.expires_at) < new Date()) {
    db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(record.user_id);
    return res.status(400).json({
      error: "This verification link has expired. Please request a new one.",
    });
  }

  const user = db
    .prepare("SELECT id, email_verified FROM users WHERE id = ?")
    .get(record.user_id);
  if (!user) {
    return res.status(400).json({ error: "Account not found" });
  }

  // Already verified is not an error.
  if (user.email_verified) {
    db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(record.user_id);
    return res.json({ message: "Email is already verified. You can now log in." });
  }

  // Make the two database changes atomic.
  db.transaction(() => {
    db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(record.user_id);
    db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(record.user_id);
  })();

  return res.json({ message: "Email verified. You can now log in." });
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());

  // Always run a bcrypt comparison so response time doesn't reveal valid usernames.
  const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !valid) return res.status(401).json({ error: "Invalid credentials" });

  if (!user.email_verified) {
    return res.status(403).json({ error: "Please verify your email before logging in" });
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(user.id);
  db.prepare(
    "INSERT INTO two_factor_codes (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)"
  ).run(user.id, codeHash, expiresAt);

  try {
    await sendCodeEmail(user.email, code);
  } catch (err) {
    console.error("Failed to send 2FA email:", err.message);
    if (IS_PROD) {
      db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(user.id);
      return res
        .status(502)
        .json({ error: "Could not send the verification code. Please try again." });
    }
  }

  res.json({ requires2FA: true, userId: user.id, email: user.email });
});

app.post("/api/auth/verify-2fa", twoFactorLimiter, async (req, res) => {
  const { userId, code } = req.body || {};

  const id = Number(userId);
  const codeStr = String(code ?? "").trim();
  if (!Number.isInteger(id) || !/^\d{6}$/.test(codeStr)) {
    return res.status(401).json({ error: "Invalid code" });
  }

  const record = db.prepare("SELECT * FROM two_factor_codes WHERE user_id = ?").get(id);
  if (!record) return res.status(401).json({ error: "Invalid code" });

  if (new Date(record.expires_at) < new Date()) {
    db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(id);
    return res.status(401).json({ error: "Code expired, please log in again" });
  }

  // Per-account limit: after 5 wrong guesses the code is destroyed.
  if ((record.attempts || 0) >= 5) {
    db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(id);
    return res.status(401).json({ error: "Too many wrong codes, please log in again" });
  }

  const ok = await bcrypt.compare(codeStr, record.code_hash);
  if (!ok) {
    db.prepare("UPDATE two_factor_codes SET attempts = attempts + 1 WHERE user_id = ?").run(id);
    return res.status(401).json({ error: "Invalid code" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  db.prepare("DELETE FROM two_factor_codes WHERE user_id = ?").run(id);
  if (!user) return res.status(401).json({ error: "Invalid code" });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "12h" }
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
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
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

  // file-type is ESM-only; a dynamic import works from CommonJS on every Node version.
  const { fileTypeFromFile } = await import("file-type");
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
  let files = [];
  try {
    files = fs.readdirSync(carouselDir).filter((f) => allowed.test(f)).sort();
  } catch (err) {
    console.error("Could not read carousel directory:", err.message);
  }
  res.json(files.map((f) => `/carousel/${f}`));
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
function generateOrderNumber() {
  const rand = crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
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
// Creates the order as "unpaid" and returns a Stripe Checkout URL to redirect to.
app.post("/api/orders", requireAuth, checkoutLimiter, async (req, res) => {
  const items = req.body && req.body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one item is required" });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: "Too many items in one order" });
  }

  // Merge duplicate product lines so stock is checked against the combined quantity.
  const merged = new Map();
  for (const item of items) {
    const productId = Number(item && item.productId);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: `Invalid product: ${item && item.productId}` });
    }
    const qty = Math.min(100, Math.max(1, Math.floor(Number(item.qty)) || 1));
    merged.set(productId, Math.min(100, (merged.get(productId) || 0) + qty));
  }

  const getProduct = db.prepare("SELECT * FROM products WHERE id = ?");
  let totalCents = 0;
  const resolvedItems = [];

  for (const [productId, qty] of merged) {
    const product = getProduct.get(productId);
    if (!product) {
      return res.status(400).json({ error: `Invalid product: ${productId}` });
    }
    totalCents += Math.round(product.price * 100) * qty;
    resolvedItems.push({
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      qty,
    });
  }

  const stockProblem = findStockProblem(resolvedItems);
  if (stockProblem) {
    return res.status(409).json({ error: `Not enough stock for "${stockProblem}"` });
  }

  const total = totalCents / 100;
  const orderNumber = generateUniqueOrderNumber();

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, order_number, total, payment_status)
    VALUES (@user_id, @order_number, @total, 'unpaid')
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, price, qty)
    VALUES (@order_id, @product_id, @product_name, @price, @qty)
  `);

  const createOrder = db.transaction(() => {
    const orderResult = insertOrder.run({
      user_id: req.user.id,
      order_number: orderNumber,
      total,
    });
    for (const item of resolvedItems) {
      insertItem.run({ order_id: orderResult.lastInsertRowid, ...item });
    }
    return orderResult.lastInsertRowid;
  });

  const orderId = createOrder();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);

  let session;
  try {
    session = await createCheckoutSession(order, orderItems);
  } catch (err) {
    console.error("Stripe checkout session failed:", err.message);
    // Don't leave a dead unpaid order behind.
    db.transaction(() => {
      db.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id);
      db.prepare("DELETE FROM orders WHERE id = ?").run(order.id);
    })();
    return res.status(502).json({ error: "Could not start the payment. Please try again." });
  }

  res.status(201).json({ ...order, items: orderItems, checkoutUrl: session.url });
});

// Customer — retry payment for one of their own unpaid orders
app.post("/api/orders/:id/pay", requireAuth, checkoutLimiter, async (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.payment_status === "paid") {
    return res.status(400).json({ error: "This order is already paid" });
  }

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);

  const stockProblem = findStockProblem(items);
  if (stockProblem) {
    return res.status(409).json({ error: `Not enough stock for "${stockProblem}"` });
  }

  // Make sure the previous Checkout session can't be paid as well.
  const previous = await retireOldSession(order);
  if (previous === "paid") {
    return res.status(400).json({ error: "This order is already paid" });
  }

  let session;
  try {
    session = await createCheckoutSession(order, items);
  } catch (err) {
    console.error("Stripe checkout session failed:", err.message);
    return res.status(502).json({ error: "Could not start the payment. Please try again." });
  }

  // Never overwrite a "paid" status that a webhook may have set in the meantime.
  db.prepare("UPDATE orders SET payment_status = 'unpaid' WHERE id = ? AND payment_status != 'paid'").run(
    order.id
  );
  res.json({ checkoutUrl: session.url });
});

app.get("/api/orders/mine", requireAuth, (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC")
    .all(req.user.id);
  const itemsStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
  const result = orders.map((order) => ({
    ...order,
    items: itemsStmt.all(order.id),
  }));
  res.json(result);
});

// Admin — every order, across every customer (includes shipping_json once paid)
app.get("/api/orders", requireAdmin, (req, res) => {
  const orders = db
    .prepare(
      `SELECT orders.*, users.username, users.email
       FROM orders
       JOIN users ON users.id = orders.user_id
       ORDER BY orders.id DESC`
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
// Emails the customer only when the order actually moves to "completed".
app.patch("/api/orders/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["pending", "completed"].includes(status)) {
    return res.status(400).json({ error: "status must be 'pending' or 'completed'" });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);

  if (status === "completed" && order.status !== "completed") {
    sendOrderStatusEmail(order.id, "completed"); // not awaited on purpose
  }

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  res.json({ ...updated, items });
});

// Admin — set/update the AWB number and carrier for an order
// Emails the customer only when a new/changed AWB number is saved.
app.patch("/api/orders/:id/awb", requireAdmin, (req, res) => {
  const { awb_number, carrier } = req.body || {};

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const newAwb = typeof awb_number === "string" ? awb_number.trim().slice(0, 100) : "";
  const newCarrier = typeof carrier === "string" ? carrier.trim().slice(0, 100) : "";

  db.prepare("UPDATE orders SET awb_number = ?, carrier = ? WHERE id = ?").run(
    newAwb || null,
    newCarrier || null,
    req.params.id
  );

  if (newAwb && newAwb !== (order.awb_number || "")) {
    sendOrderStatusEmail(order.id, "awb"); // not awaited on purpose
  }

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
  price: z.number().nonnegative().max(1000000),
  category: z.string().max(100).optional(),
  stock: z.number().int().nonnegative().optional(),
  image: z.string().max(500).optional(),
});

// CREATE
app.post("/api/products", requireAdmin, (req, res) => {
  const body = req.body || {};
  const parsed = productSchema.safeParse({
    ...body,
    price: Number(body.price),
    stock: body.stock !== undefined ? Number(body.stock) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
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
  const ids = req.body && req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(Number(id)))) {
    return res.status(400).json({ error: "ids must be a non-empty array of product ids" });
  }

  const update = db.prepare("UPDATE products SET position = ? WHERE id = ?");
  const reorder = db.transaction((idList) => {
    idList.forEach((id, index) => update.run(index, Number(id)));
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

  const body = req.body || {};
  const parsed = productSchema.partial().safeParse({
    ...body,
    price: body.price !== undefined ? Number(body.price) : undefined,
    stock: body.stock !== undefined ? Number(body.stock) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
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
    `UPDATE products
     SET name = @name, description = @description, long_description = @long_description,
         specs = @specs, price = @price, category = @category, stock = @stock, image = @image
     WHERE id = @id`
  ).run({ ...updated, id: req.params.id });

  const result = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json(result);
});

// MOVE (reorder by one position, left or right)
app.post("/api/products/:id/move", requireAdmin, (req, res) => {
  const { direction } = req.body || {}; // "left" | "right"
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
    db.transaction(() => {
      db.prepare("UPDATE products SET position = ? WHERE id = ?").run(neighbor.position, current.id);
      db.prepare("UPDATE products SET position = ? WHERE id = ?").run(current.position, neighbor.id);
    })();
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
// Health check + (optional) built frontend
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Single-host deployment: serve the built React app from this server.
// (Skipped automatically when the frontend is hosted elsewhere.)
const distDir = process.env.FRONTEND_DIST || path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  // SPA fallback so client-side routes like /verify-email?token=... load index.html.
  app.get(/^\/(?!api\/|uploads\/|carousel\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("Product Shop API is running. Try GET /api/products");
  });
}

// ---------------------------------------------------------------------------
// 404 + global error handler — must be the LAST two app.use() calls
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  // Upload problems (file too big, wrong field name, ...) are the client's fault.
  if (err instanceof multer.MulterError) {
    err.status = 400;
    if (err.code === "LIMIT_FILE_SIZE") err.message = "Image is too large (max 10MB)";
  }
  // Malformed JSON body
  if (err.type === "entity.parse.failed") {
    err.status = 400;
    err.message = "Invalid JSON";
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status < 500 || !IS_PROD ? err.message : "Internal server error",
  });
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});


module.exports = app;
