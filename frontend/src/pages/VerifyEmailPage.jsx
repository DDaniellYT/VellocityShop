import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API_ORIGIN } from "../api.js";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const verificationStarted = useRef(false);

  useEffect(() => {
    // Prevent duplicate verification requests in React StrictMode
    if (verificationStarted.current) {
      return;
    }

    verificationStarted.current = true;

    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing.");
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await axios.post(
          `${API_ORIGIN}/api/auth/verify-email`,
          {
            token,
          }
        );

        setStatus("success");
        setMessage(
          response.data.message ||
            "Your email has been verified."
        );
      } catch (error) {
        console.error(
          "Email verification failed:",
          error.response?.data || error
        );

        setStatus("error");
        setMessage(
          error.response?.data?.error ||
            "This verification link is invalid or has expired."
        );
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">

        {status === "loading" && (
          <>
            <h2>Verifying email...</h2>
            <p>
              Please wait while we verify your account.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <h2>Email verified!</h2>

            <p>{message}</p>

            <Link
              to="/login"
              className="btn btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 16,
              }}
            >
              Continue to sign in
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h2>Verification failed</h2>

            <div className="status-banner error">
              {message}
            </div>

            <Link
              to="/login"
              className="btn btn-outline"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 16,
              }}
            >
              Back to sign in
            </Link>
          </>
        )}

      </div>
    </div>
  );
}