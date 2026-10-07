import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { getMyOrders } from "../api.js";
import Order from "../components/Order.jsx";


export default function AccountPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  useEffect(() => {
    if (!user) {
      setLoadingOrders(false);
      return;
    }

    (async () => {
      try {
        const res = await getMyOrders();
        setOrders(res.data);
      } catch (err) {
        console.error("Failed to load orders:", err);
        setOrders([]);
      } finally {
        setLoadingOrders(false);
      }
    })();
  }, [user]);

    
  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user) return null;

  return (
    <>
      <Navbar />
      <div className="section" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="section-header">
          <h2>My Account</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link to="/" className="quote-note" style={{ color: "var(--text-muted)" }}>
              Back to site
            </Link>
            <button className="icon-btn" onClick={handleLogout} style={{ flex: "none", padding: "8px 16px" }}>
              Log out
            </button>
          </div>
        </div>

        <p style={{ color: "var(--text-muted)", marginBottom: 30 }}>
          Welcome, {user.username}.
        </p>

        <h3 style={{ marginBottom: 16, fontSize: "1.1rem" }}>Past Orders</h3>

        {loadingOrders && <div className="status-banner loading">Loading orders…</div>}

        {!loadingOrders && orders.length === 0 && (
          <div className="empty-panel">
            <h3>No past orders yet</h3>
            <p>Orders you place will show up here.</p>
          </div>
        )}

        {!loadingOrders && orders.length > 0 && (
          <div className="order-history">
            {orders.map((order) => {
              return <Order order={order}/>
            })}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}