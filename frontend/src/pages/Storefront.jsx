import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Hero from "../components/Hero.jsx";
import Process from "../components/Process.jsx";
import Footer from "../components/Footer.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { getProducts } from "../api.js";
import { useCart } from "../CartContext.jsx";
import Carousel from "../components/Carousel.jsx";

export default function Storefront() {
  const location = useLocation();
  const { addToCart } = useCart();

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }, [location]);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await getProducts();
        setProducts(res.data);
      } catch {
        setError(
          "Couldn't reach the API. Make sure the backend server is running on http://localhost:5000."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <Navbar />
      <Hero />

      <section className="section" id="products">
        <div className="section-header">
          <h2>Products</h2>
          <a
            className="quote-note"
            href="https://linktr.ee/vellocity_3d?fbclid=IwY2xjawTlPBhwZG9mAWV4dG4DYWVtAjEwAGJyaWQRMUZESVhINnpWTnRHVzdwMmJzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeySts1wehj93XzA_ttowN5KR33L-txcfwdCugEglPNjHwYvlEF06rYFQ48_Q_aem_TrDiy_zLpa7WYqeJXm8M9g"
            target="_blank"
            rel="noopener noreferrer"
          >
            Text me for a custom quote!
          </a>
        </div>

        {error && <div className="status-banner error">{error}</div>}
        {loading && <div className="status-banner loading">Loading products…</div>}

        {!loading && products.length === 0 && !error && (
          <div className="empty-panel">
            <h3>No products found</h3>
            <p>Check back soon.</p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={addToCart}
              />
            ))}
          </div>
        )}
      </section>

      <Process />
      <Carousel />
      <Footer />
    </>
  );
}