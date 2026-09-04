const bcrypt = require("bcryptjs");
const db = require("./db");

const users = [
  {
    username: "admin",
    email: "3d.printing.vv@gmail.com",
    password: "pass123",
    role: "admin",
  },
  {
    username: "testcustomer",
    email: "customer@example.com",
    password: "password123",
    role: "customer",
  },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO users
    (username, email, password_hash, role, email_verified)
  VALUES (?, ?, ?, ?, 1)
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 10);

  const result = insert.run(
    u.username,
    u.email,
    hash,
    u.role
  );

  if (result.changes > 0) {
    console.log(`Created user: ${u.username} (${u.role})`);
  } else {
    console.log(`Skipped (already exists): ${u.username}`);
  }
}

console.log("Done.");
