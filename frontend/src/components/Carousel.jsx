import { useEffect, useState } from "react";
import { getCarouselImages } from "../api.js";

export default function Carousel() {
  const [images, setImages] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCarouselImages();
        setImages(res.data.map((path) => `http://localhost:5000${path}`));
      } catch {
        setImages([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 3500);
    return () => clearInterval(id);
  }, [images.length]);

  if (loading || images.length === 0) return null;

  return (
    <section className="section carousel-section">
      <div className="section-header">
        <h2>Behind the Scenes</h2>
      </div>
      <div className="carousel">
        <div
          className="carousel-track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {images.map((src, i) => (
            <img key={i} src={src} alt={`Carousel ${i + 1}`} className="carousel-slide" />
          ))}
        </div>
        <div className="carousel-dots">
          {images.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot ${i === index ? "active" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}