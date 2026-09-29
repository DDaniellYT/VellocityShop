import { useState } from "react";
import { useCart } from "../CartContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { createOrder } from "../api.js";
import { API_ORIGIN } from "../api.js";

export default function CartDrawer() {
  const {
    items,
    isOpen,
    orderNumber,
    closeCart,
    removeFromCart,
    updateQty,
    clearCart,
    total,
  } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  if (!isOpen) return null;
  const handleCheckout = async () => {
    if (!user) {
      closeCart();
      navigate("/login");
      return;
    }
    setPlacing(true);
    try {
      // The server recalculates prices itself; only ids and quantities matter.
      const res = await createOrder({
        items: items.map(({ product, qty }) => ({
          productId: product.id,
          qty,
        })),
      });

      const checkoutUrl = res.data.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error("No checkout URL returned");
      }

      // The order now exists on the server (unpaid), so the cart can be emptied.
      // Payment is confirmed by Stripe -> server webhook, not by this page.
      clearCart();
      closeCart();
      window.location.href = checkoutUrl; // redirect to Stripe's hosted payment page
      return; // keep the button disabled while the browser navigates
    } catch {
      alert("Couldn't start the payment. Please try again.");
    }
    setPlacing(false);
  };
  return (
    <div className="modal-overlay" onClick={closeCart}>
      <div className="modal cart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h3>Your Cart</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="quote-note">Order #{orderNumber}</span>
            <button
              type="button"
              className="cart-close-btn"
              onClick={closeCart}
              aria-label="Close cart"
            >
              ×
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-panel">
            <h3>Your cart is empty</h3>
            <p>Add a product to get started.</p>
          </div>
        ) : (
          <>
            <table className="cart-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ product, qty }) => (
                  <tr key={product.id}>
                    <td className="cart-product-cell">
                      <img
                        src={
                          product.image?.startsWith("http")
                            ? product.image
                            : `${API_ORIGIN}${product.image}`
                        }
                        alt={product.name}
                      />
                      <span>{product.name}</span>
                    </td>
                    <td>${Number(product.price).toFixed(2)}</td>
                    <td>
                      <div className="qty-stepper">
                        <button type="button" onClick={() => updateQty(product.id, qty - 1)}>−</button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => updateQty(product.id, qty + 1)}>+</button>
                      </div>
                    </td>
                    <td>${(qty * Number(product.price)).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => removeFromCart(product.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="cart-footer">
              <span className="cart-total">Total: ${total.toFixed(2)}</span>
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn btn-outline" onClick={clearCart}>
                  Clear cart
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCheckout}
                  disabled={placing}
                >
                  {placing ? "Redirecting to payment..." : "Pay now"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}