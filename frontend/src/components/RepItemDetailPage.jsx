import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { repFacts } from "../components/RepItemCard.jsx";
import { getRepItem, API_ORIGIN } from "../api.js";
import "../rep.css";

const toSrc = (url) => (url?.startsWith("http") ? url : `${API_ORIGIN}${url}`);

export default function RepItemDetailPage() {
  const { id } = useParams();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    setActiveImage(0);
    getRepItem(id)
      .then((res) => setItem(res.data))
      .catch(() => setError("That item couldn't be found."))
      .finally(() => setLoading(false));
  }, [id]);

  const images = item ? (item.images || []).filter(Boolean) : [];
  const hasMany = images.length > 1;
  const current = Math.min(activeImage, Math.max(images.length - 1, 0));
  const step = (dir) => setActiveImage((current + dir + images.length) % images.length);

  const facts = item ? repFacts(item) : [];

  return (
    <>
      <Navbar />
      <section className="section product-detail-section">
        

        {loading && <div className="status-banner loading">Loading item…</div>}

        {!loading && error && (
          <div className="empty-panel">
            <h3>{error}</h3>
            <p>It may have been removed or the link is incorrect.</p>
          </div>
        )}

        {!loading && item && (
          <div className="rep-detail">
            <div className="rep-detail-media">
              <div className="rep-detail-stage">
                {images.length > 0 ? (
                  <img
                    className="rep-detail-image"
                    src={toSrc(images[current])}
                    alt={item.title}
                  />
                ) : (
                  <div className="rep-detail-image rep-detail-noimage">No photo</div>
                )}
                {hasMany && (
                  <>
                    <button
                      type="button"
                      className="rep-arrow rep-arrow-left"
                      onClick={() => step(-1)}
                      aria-label="Previous image"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="rep-arrow rep-arrow-right"
                      onClick={() => step(1)}
                      aria-label="Next image"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>

              {hasMany && (
                <div className="rep-thumbs">
                  {images.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      className={`rep-thumb${i === current ? " active" : ""}`}
                      onClick={() => setActiveImage(i)}
                      aria-label={`Show image ${i + 1} of ${images.length}`}
                      aria-current={i === current ? "true" : undefined}
                    >
                      <img src={toSrc(url)} alt="" />
                    </button>
                  ))}
                </div>
              )}

              {item.specs?.trim() && (
                <div className="rep-detail-specs">
                  <span className="rep-detail-specs-title">More details</span>
                  {item.specs}
                </div>
              )}
            </div>

            <div className="rep-detail-info">
              <h1>{item.title}</h1>

              <p className="rep-detail-desc">
                {item.long_description?.trim() ? item.long_description : item.description}
              </p>

              {facts.length > 0 && (
                <dl className="rep-facts rep-facts-large">
                  {facts.map((f) => (
                    <div key={f.label} className="rep-fact">
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}