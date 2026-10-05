import { useState } from "react";
import { API_ORIGIN } from "../api.js";

const toSrc = (url) => (url?.startsWith("http") ? url : `${API_ORIGIN}${url}`);

export default function WorkCard({ item, onEdit, onDelete }) {
  const [index, setIndex] = useState(0);

  const urls = item.images || [];
  const details = item.details || [];
  const hasMany = urls.length > 1;
  const current = Math.min(index, Math.max(urls.length - 1, 0)); // safe if images get removed
  const step = (dir) => setIndex((current + dir + urls.length) % urls.length);

  return (
    <article className="work-card">
      <div className="work-card-media">
        {urls.length > 0 ? (
          <img src={toSrc(urls[current])} alt={item.title} />
        ) : (
          <div className="work-card-empty">No photo</div>
        )}
        {hasMany && (
          <>
            <button
              type="button"
              className="card-arrow card-arrow-left card-arrow-always"
              onClick={() => step(-1)}
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              className="card-arrow card-arrow-right card-arrow-always"
              onClick={() => step(1)}
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="work-card-body">
        <h3 className="work-card-title">{item.title}</h3>
        {item.description && <p className="work-card-desc">{item.description}</p>}

        {details.length > 0 && (
          <dl className="work-card-details">
            {details.map((d, i) => (
              <div key={i} className="work-card-detail">
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(onEdit || onDelete) && (
          <div className="product-actions">
            {onEdit && (
              <button className="icon-btn" onClick={() => onEdit(item)}>
                Edit
              </button>
            )}
            {onDelete && (
              <button className="icon-btn danger" onClick={() => onDelete(item)}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}