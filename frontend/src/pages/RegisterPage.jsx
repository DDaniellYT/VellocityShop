import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api.js";
import { useAuth } from "../AuthContext.jsx";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { loginUser } = useAuth();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await register(username, email, password);
      loginUser(res.data);
      navigate("/account");
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't create the account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <form onSubmit={handleSubmit}>
          <h2>Create account</h2>
          <p>Sign up to track your orders.</p>
          {error && <div className="status-banner error">{error}</div>}
          <div className="form-row">
            <label>Username</label>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-row">
          <label>Email</label>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
          <div className="form-row">
            <label>Password</label>
            <input
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="form-row">
            <label>Confirm password</label>
            <input
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <Link
          to="/login"
          className="btn btn-outline"
          style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}