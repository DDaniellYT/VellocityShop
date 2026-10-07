import { useEffect, useState } from "react";
import { getCarouselImages, getImageUrl } from "../api.js";

export default function Carousel() {
  const [images, setImages] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadImages() {
      try {
        const res = await getCarouselImages();

        // API should return image paths such as:
        // /uploads/carousel/image1.jpg
        // /uploads/carousel/image2.jpg
        setImages(res.data);
      } catch (err) {
        console.error("Failed to load carousel images:", err);
        setImages([]);
      } finally {
        setLoading(false);
      }
    }

    loadImages();
  }, []);

  useEffect(() => {
    if (images.length <= 1) return;

    const id = setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, 3500);

    return () => clearInterval(id);
  }, [images.length]);

  if (loading || images.length === 0) {
    return null;
  }

  return (
    <section className="section carousel-section">
      <div className="section-header">
        <h2>Behind the Scenes</h2>
      </div>

      <div className="carousel">
        <div
          className="carousel-track"
          style={{
            transform: `translateX(-${index * 100}%)`,
          }}
        >
          {images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`Carousel ${i + 1}`}
              className="carousel-slide"
            />
          ))}
        </div>

        {images.length > 1 && (
          <div className="carousel-dots">
            {images.map((_, i) => (
              <button
                key={i}
                className={`carousel-dot ${
                  i === index ? "active" : ""
                }`}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}