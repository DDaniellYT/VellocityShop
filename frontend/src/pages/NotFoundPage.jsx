import { Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";

export default function NotFoundPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div
        className="section"
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          textAlign: "center",
          padding: "120px 40px",
          flex: 1,
        }}
      >
        <span className="badge">404</span>
        <h1 style={{ fontSize: "2.4rem", margin: "20px 0 12px" }}>
          This page doesn't exist
        </h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 30 }}>
          The page you're looking for may have been moved or never existed.
        </p>
        <Link to="/" className="btn btn-primary" style={{ display: "inline-flex" }}>
          Back to store
        </Link>
      </div>
      <Footer />
    </div>
  );
}