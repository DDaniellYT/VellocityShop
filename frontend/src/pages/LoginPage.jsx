import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, verify2FA } from "../api.js";
import { useAuth } from "../AuthContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginUser } = useAuth();

  const [step, setStep] = useState("credentials"); // "credentials" | "code"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(username, password);
      setPendingUserId(res.data.userId);
      setPendingEmail(res.data.email);
      setStep("code");
    } catch {
      setError("Incorrect username or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await verify2FA(pendingUserId, code);
      loginUser(res.data);
      navigate(res.data.role === "admin" ? "/admin" : "/account");
    } catch (err) {
      setError(err?.response?.data?.error || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        {step === "credentials" && (
          <form onSubmit={handleCredentialsSubmit}>
            <h2>Sign in</h2>
            <p>Enter your details to continue.</p>
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
              <label>Password</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleCodeSubmit}>
            <h2>Enter verification code</h2>
            <p>We sent a 6-digit code to {pendingEmail}.</p>
            {error && <div className="status-banner error">{error}</div>}
            <div className="form-row">
              <label>Code</label>
              <input
                name="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "Verifying..." : "Verify & sign in"}
            </button>
          </form>
        )}

        <Link
          to="/register"
          className="btn btn-outline"
          style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
        >
          Create an account
        </Link>
        <Link
          to="/"
          className="quote-note"
          style={{ display: "block", textAlign: "center", marginTop: 16, color: "var(--text-muted)" }}
        >
          Back to store
        </Link>
      </div>
    </div>
  );
}