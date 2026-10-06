import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_ORIGIN } from "../api.js";
import "../rep.css";

const toSrc = (url) => (url?.startsWith("http") ? url : `${API_ORIGIN}${url}`);

// The descriptors shown where a product shows its price. Empty ones are skipped.
// Also used by the detail page.
export const repFacts = (item) =>
  [
    { label: "Material", value: item.material },
    { label: "Help used", value: item.help_used },
    {
      label: "Time",
      value:
        item.hours !== null && item.hours !== undefined && item.hours !== ""
          ? `${item.hours} h`
          : "",
    },
    { label: "Service", value: item.service },
    { label: "Weight", value: item.weight },
    { label: "Colors", value: item.colors },
  ].filter((f) => f.value && String(f.value).trim());

export default function RepItemCard({ item, onEdit, onDelete }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const urls = item.images || [];
  const facts = repFacts(item);
  const hasMany = urls.length > 1;
  const current = Math.min(index, Math.max(urls.length - 1, 0)); // safe if images get removed

  const step = (e, dir) => {
    e.stopPropagation(); // don't open the detail page
    setIndex((current + dir + urls.length) % urls.length);
  };

  const goToDetail = () => navigate(`/rep/${item.id}`);

  return (
    <article className="rep-card" onClick={goToDetail}>
      <div className="rep-card-media">
        {urls.length > 0 ? (
          <img src={toSrc(urls[current])} alt={item.title} />
        ) : (
          <div className="rep-card-empty">No photo</div>
        )}
        {hasMany && (
          <>
            <button
              type="button"
              className="rep-arrow rep-arrow-left"
              onClick={(e) => step(e, -1)}
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              className="rep-arrow rep-arrow-right"
              onClick={(e) => step(e, 1)}
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="rep-card-body">
        <h3 className="rep-card-title">{item.title}</h3>
        {item.description && <p className="rep-card-desc">{item.description}</p>}

        {facts.length > 0 && (
          <dl className="rep-facts">
            {facts.map((f) => (
              <div key={f.label} className="rep-fact">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(onEdit || onDelete) && (
          <div className="product-actions">
            {onEdit && (
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                className="icon-btn danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item);
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}