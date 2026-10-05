import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Hero from "../components/Hero.jsx";
import Process from "../components/Process.jsx";
import Footer from "../components/Footer.jsx";
import ProductCard from "../components/ProductCard.jsx";
import WorkCard from "../components/WorkCard.jsx";
import { getProducts, getWork } from "../api.js";
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

  const [workItems, setWorkItems] = useState([]);
  const [workLoading, setWorkLoading] = useState(true);
  const [workError, setWorkError] = useState("");

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
        const res = await getWork();
        setWorkItems(res.data);
      } catch {
        setWorkError("Couldn't load our work right now.");
      } finally {
        setWorkLoading(false);
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
            {workError && <div className="status-banner error">{workError}</div>}
            {workLoading && <div className="status-banner loading">Loading our work…</div>}

            {!workLoading && workItems.length === 0 && !workError && (
              <div className="empty-panel">
                <h3>Nothing here yet</h3>
                <p>Check back soon.</p>
              </div>
            )}

            {!workLoading && workItems.length > 0 && (
              <div className="work-grid">
                {workItems.map((item) => (
                  <WorkCard key={item.id} item={item} />
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