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
      const res = await createOrder({
        total,
        items: items.map(({ product, qty }) => ({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty,
        })),
      });
      const confirmedOrderNumber = res.data.order_number; // authoritative, from the server
      clearCart();
      closeCart();
      alert(`Order ${confirmedOrderNumber} placed!`);
    } catch {
      alert("Couldn't place the order. Please try again.");
    } finally {
      setPlacing(false);
    }
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
                  {placing ? "Placing order..." : "Checkout"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}