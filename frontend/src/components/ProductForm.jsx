import { useEffect, useState } from "react";
import { uploadImage } from "../api.js";

const emptyForm = {
  name: "",
  description: "",
  long_description: "",
  specs: "",
  price: "",
  category: "",
  stock: "",
  image: "",
};

export default function ProductForm({ initialProduct, onSubmit, onClose, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
        if (initialProduct) {
      setForm({
        name: initialProduct.name || "",
        description: initialProduct.description || "",
        long_description: initialProduct.long_description || "",
        specs: initialProduct.specs || "",
        price: initialProduct.price ?? "",
        category: initialProduct.category || "",
        stock: initialProduct.stock ?? "",
        image: initialProduct.image || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [initialProduct]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  
  const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setUploading(true);
  try {
    const res = await uploadImage(file);
    setForm((prev) => ({ ...prev, image: res.data.url }));
  } catch {
    alert("Image upload failed. Please try a smaller image or a different file.");
  } finally {
    setUploading(false);
  }
};

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initialProduct ? "Edit product" : "Add a new product"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Twist Pen Holder"
              required
            />
          </div>
        <div className="form-row">
        <label>
          Description{" "}
          <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
            ({form.description.length}/400)
          </span>
          </label>
          <textarea
            name="description"
            rows={3}
            maxLength={300}
            value={form.description}
            onChange={handleChange}
            placeholder="Short summary shown on the product card..."
          />
        </div>
        <div className="form-row">
          <label>Full details</label>
          <textarea
            name="long_description"
            rows={6}
            value={form.long_description}
            onChange={handleChange}
            placeholder="Full details shown on the product page — materials, dimensions, care instructions, etc."
          />
        </div>
        <div className="form-row">
          <label>Specs (shown below the image)</label>
          <textarea
            name="specs"
            rows={6}
            value={form.specs}
            onChange={handleChange}
            placeholder="Technical specs, dimensions, materials — shown underneath the product photo."
          />
        </div>
          <div className="form-row">
            <label>Category</label>
            <input
              name="category"
              value={form.category}
              onChange={handleChange}
              placeholder="Desk Organizers"
            />
          </div>
          <div className="form-row">
            <label>Price (USD)</label>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-row">
            <label>Stock</label>
            <input
              name="stock"
              type="number"
              min="0"
              value={form.stock}
              onChange={handleChange}
            />
          </div>
          <div className="form-row">
          <label>Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          {uploading && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Uploading...</span>}
          {form.image && !uploading && (
            <img
              src={form.image.startsWith("http") ? form.image : `http://localhost:5000${form.image}`}
              alt="Preview"
              style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, marginTop: 6 }}
            />
          )}
        </div>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : initialProduct ? "Save changes" : "Add product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
