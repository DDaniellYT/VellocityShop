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
          src={product.image?.startsWith("http") ? product.image : `${API_ORIGIN}${product.image}`}
          alt={product.name}
        />
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
          <span className="product-price">${Number(product.price).toFixed(2)}</span>
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