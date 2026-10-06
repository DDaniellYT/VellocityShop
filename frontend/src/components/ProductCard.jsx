import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_ORIGIN } from "../api.js";

export default function ProductCard({
  product,
  onEdit,
  onDelete,
  onAddToCart,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast,
  dragHandleProps,
}) {
  const navigate = useNavigate();
  const showMoveControls = onMoveLeft || onMoveRight;

  const [index, setIndex] = useState(0);
  const urls = product.images?.length ? product.images : [product.image];
  const toUrl = (u) => (u?.startsWith("http") ? u : `${API_ORIGIN}${u}`);
  const hasMany = urls.length > 1;
  const current = Math.min(index, urls.length - 1); // safe if images get removed
  const step = (e, dir) => {
    e.stopPropagation(); // don't trigger the card's click-through
    setIndex((current + dir + urls.length) % urls.length);
  };

  const goToDetail = () => navigate(`/products/${product.id}`);

  return (
    <div
      className="product-card"
      onClick={goToDetail}
      style={{ cursor: "pointer" }}
    >
      <div style={{ position: "relative" }}>
        <img
          className="product-image"
          src={toUrl(urls[current])}
          alt={product.name}
        />
        {hasMany && (
          <>
            <button
              type="button"
              className="card-arrow card-arrow-left"
              onClick={(e) => step(e, -1)}
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              className="card-arrow card-arrow-right"
              onClick={(e) => step(e, 1)}
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}
        {showMoveControls && (
          <div className="product-move-controls">
            <button
              type="button"
              className="product-move-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLeft(product);
              }}
              disabled={isFirst}
              aria-label="Move left"
            >
              ←
            </button>
            <button
              type="button"
              className="product-move-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMoveRight(product);
              }}
              disabled={isLast}
              aria-label="Move right"
            >
              →
            </button>
          </div>
        )}
        {dragHandleProps && (
          <button
            type="button"
            className="product-drag-handle"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >
            ⠿
          </button>
        )}
      </div>
      <div className="product-body">
        <span className="product-category">{product.category}</span>
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>
        <div className="product-footer">
          <span className="product-price">{Number(product.price).toFixed(2)} RON</span>
          <span className="product-stock">{product.stock} in stock</span>
        </div>
        {(onEdit || onDelete) && (
          <div className="product-actions">
            {onEdit && (
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(product);
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
                  onDelete(product);
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
        {onAddToCart && (
          <button
            className="add-product-btn"
            style={{ width: "100%", marginTop: 12 }}
            disabled={product.stock <= 0}
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(product);
            }}
          >
            {product.stock > 0 ? "Add to cart" : "Out of stock"}
          </button>
        )}
      </div>
    </div>
  );
}