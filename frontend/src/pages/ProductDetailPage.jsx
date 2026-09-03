import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { getProduct } from "../api.js";
import { useCart } from "../CartContext.jsx";
import { API_ORIGIN } from "../api.js";

export default function ProductDetailPage() {
  const { id } = useParams();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError("");
    getProduct(id)
      .then((res) => setProduct(res.data))
      .catch(() => setError("That product couldn't be found."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    setQty(1);
  }, [id]);

  const decreaseQty = () => setQty((q) => Math.max(1, q - 1));
  const increaseQty = () => {
    if (product && qty >= product.stock) return;
    setQty((q) => q + 1);
  };
  const handleQtyInput = (e) => {
    const val = Number(e.target.value);
    if (!product) return;
    if (Number.isNaN(val)) return;
    setQty(Math.min(Math.max(1, val), product.stock || 1));
  };

  return (
    <>
      <Navbar />
      <section className="section product-detail-section">
        <Link to="/" className="quote-note">← Back to store</Link>

        {loading && <div className="status-banner loading">Loading product…</div>}

        {!loading && error && (
          <div className="empty-panel">
            <h3>{error}</h3>
            <p>It may have been removed or the link is incorrect.</p>
          </div>
        )}

        {!loading && product && (
          <div className="product-detail">
            <div className="product-detail-media">
              <img
                className="product-detail-image"
                src={
                  product.image?.startsWith("http")
                    ? product.image
                    : `${API_ORIGIN}${product.image}`
                }
                alt={product.name}
              />
              {product.specs?.trim() && (
                <div className="product-detail-specs">
                  {product.specs}
                </div>
              )}
            </div>
            <div className="product-detail-info">
              <span className="product-category">{product.category}</span>
              <h1>{product.name}</h1>
              <p className="product-detail-desc">
                {product.long_description?.trim() ? product.long_description : product.description}
              </p>
              <div className="product-detail-meta">
                <span className="product-price">${Number(product.price).toFixed(2)}</span>
                <span className="product-stock">{product.stock} in stock</span>
              </div>

              {product.stock > 0 && (
                <div className="pd-qty-selector">
                  <div className="pd-qty-stepper">
                    <button
                      type="button"
                      className="pd-qty-btn"
                      onClick={decreaseQty}
                      disabled={qty <= 1}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      className="pd-qty-input"
                      min="1"
                      max={product.stock}
                      value={qty}
                      onChange={handleQtyInput}
                    />
                    <button
                      type="button"
                      className="pd-qty-btn"
                      onClick={increaseQty}
                      disabled={qty >= product.stock}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="pd-qty-price-wrap">
                    <span className="pd-qty-price-label">Total</span>
                    <span className="pd-qty-total-price">
                      ${(Number(product.price) * qty).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <button
                className="add-product-btn"
                style={{ width: "100%", marginTop: 12 }}
                disabled={product.stock <= 0}
                onClick={() => addToCart(product, qty)}
              >
                {product.stock > 0 ? "Add to cart" : "Out of stock"}
              </button>
            </div>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}