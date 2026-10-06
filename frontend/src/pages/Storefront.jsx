import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Hero from "../components/Hero.jsx";
import Process from "../components/Process.jsx";
import Footer from "../components/Footer.jsx";
import ProductCard from "../components/ProductCard.jsx";
import RepItemCard from "../components/RepItemCard.jsx";
import { getProducts, getRepItems } from "../api.js";
import { useCart } from "../CartContext.jsx";
import Carousel from "../components/Carousel.jsx";

export default function Storefront() {
  const location = useLocation();
  const { addToCart } = useCart();
  const [searchParams] = useSearchParams();

  // "products" (default) or "work", driven by ?view=work in the URL
  const view = searchParams.get("view") === "work" ? "work" : "products";

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }, [location]);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [repItems, setRepItems] = useState([]);
  const [repLoading, setRepLoading] = useState(true);
  const [repError, setRepError] = useState("");

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

  useEffect(() => {
    (async () => {
      try {
        const res = await getRepItems();
        setRepItems(res.data);
      } catch {
        setRepError("Couldn't load our rep items right now.");
      } finally {
        setRepLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <Navbar />
      <Hero />

      <section className="section" id="products">
        <div className="section-header">
          <h2>{view === "work" ? "Our work" : "Products"}</h2>
          <a
            className="quote-note"
            href="https://linktr.ee/vellocity_3d?fbclid=IwY2xjawTlPBhwZG9mAWV4dG4DYWVtAjEwAGJyaWQRMUZESVhINnpWTnRHVzdwMmJzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeySts1wehj93XzA_ttowN5KR33L-txcfwdCugEglPNjHwYvlEF06rYFQ48_Q_aem_TrDiy_zLpa7WYqeJXm8M9g"
            target="_blank"
            rel="noopener noreferrer"
          >
            Text me for a custom quote!
          </a>
        </div>

        {view === "work" && (
          <>
            {repError && <div className="status-banner error">{repError}</div>}
            {repLoading && <div className="status-banner loading">Loading our work…</div>}

            {!repLoading && repItems.length === 0 && !repError && (
              <div className="empty-panel">
                <h3>Nothing here yet</h3>
                <p>Check back soon.</p>
              </div>
            )}

            {!repLoading && repItems.length > 0 && (
              <div className="work-grid">
                {repItems.map((item) => (
                  <RepItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </>
        )}

        {view === "products" && (
          <>
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
          </>
        )}
      </section>

      <Process />
      <Carousel />
      <Footer />
    </>
  );
}