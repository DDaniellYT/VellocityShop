import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { getMyOrders } from "../api.js";

function getTrackingUrl(carrier, awbNumber) {
  if (!awbNumber) return null;
  if (carrier === "Sameday") {
    // Sameday's public tracker lives at sameday.ro under "Check AWB".
    // Double check this deep-link query param still works — if not, this
    // just falls back to sameday.ro itself with the number visible to copy in.
    return `https://sameday.ro/?awb=${encodeURIComponent(awbNumber)}&lang=en`;
  }
  return null;
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (!user) return;
      (async () => {
        try {
          const res = await getMyOrders();
          setOrders(res.data);
        } catch {
          // ignore — empty state will show
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
              const trackingUrl = getTrackingUrl(order.carrier, order.awb_number);
              return (
                <div key={order.id} className="order-card">
                  <div className="order-card-header">
                    <span>Order #{order.order_number}</span>
                    <span>{new Date(order.created_at).toLocaleDateString()}</span>
                  </div>
                  <table className="cart-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>
                          <td>${Number(item.price).toFixed(2)}</td>
                          <td>{item.qty}</td>
                          <td>${(item.price * item.qty).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {order.awb_number && (
                    <div className="order-tracking-row">
                      <span>
                        {order.carrier || "Carrier"} tracking: <strong>{order.awb_number}</strong>
                      </span>
                      {trackingUrl && (
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-btn"
                          style={{ flex: "none", padding: "6px 14px" }}
                        >
                          Track package
                        </a>
                      )}
                    </div>
                  )}

                  <div className="order-card-total">
                    Total: ${Number(order.total).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}