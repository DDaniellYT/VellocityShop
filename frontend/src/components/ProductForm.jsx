import { useEffect, useRef, useState } from "react";
import { API_ORIGIN } from "../api.js";

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB, same limit as the server
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif)$/i;

const emptyForm = {
  name: "",
  description: "",
  long_description: "",
  specs: "",
  price: "",
  category: "",
  stock: "",
};

// Ids only need to be unique inside this form (crypto.randomUUID isn't available
// on plain-http pages such as a phone opening the dev site over the local network).
let imageCounter = 0;
const makeImageId = () => `img-${Date.now()}-${imageCounter++}`;

const toAbsolute = (url) => (url.startsWith("http") ? url : `${API_ORIGIN}${url}`);
const fileNameFromUrl = (url) => decodeURIComponent(url.split("/").pop());

// Images the product already has on the server, in their saved order.
const imagesFromProduct = (product) =>
  (product?.images || []).map((url) => ({
    id: makeImageId(),
    kind: "existing",
    file: fileNameFromUrl(url), // e.g. "2.jpg"
    preview: toAbsolute(url),
  }));

export default function ProductForm({ initialProduct, onSubmit, onClose, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState([]);
  const [imageError, setImageError] = useState("");

  // Lets the unmount cleanup see the latest list of images.
  const imagesRef = useRef([]);
  imagesRef.current = images;

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
      });
      setImages(imagesFromProduct(initialProduct));
    } else {
      setForm(emptyForm);
      setImages([]);
    }
    setImageError("");
  }, [initialProduct]);

  // Free the browser memory used by previews of files that were never uploaded.
  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => {
        if (img.kind === "new") URL.revokeObjectURL(img.preview);
      });
    },
    []
  );

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFilesChange = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // lets the same file be picked again later
    if (picked.length === 0) return;

    const room = MAX_IMAGES - images.length;
    const accepted = [];
    let problem = "";

    for (const file of picked) {
      const isImage = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXT.test(file.name);
      if (!isImage) {
        problem = `"${file.name}" isn't a JPG, PNG, WEBP or GIF image.`;
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        problem = `"${file.name}" is larger than 10 MB.`;
        continue;
      }
      if (accepted.length >= room) {
        problem = `A product can have at most ${MAX_IMAGES} images.`;
        break;
      }
      accepted.push({
        id: makeImageId(),
        kind: "new",
        file,
        preview: URL.createObjectURL(file),
      });
    }

    if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
    setImageError(problem);
  };

  // Moves an image to another number; the others shift and everything is renumbered 1..N.
  const moveImage = (from, to) => {
    setImages((prev) => {
      const target = Math.min(Math.max(to, 0), prev.length - 1);
      if (target === from) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeImage = (id) => {
    setImages((prev) => {
      const gone = prev.find((img) => img.id === id);
      if (gone && gone.kind === "new") URL.revokeObjectURL(gone.preview);
      return prev.filter((img) => img.id !== id);
    });
    setImageError("");
  };

  // What the server needs to save the images: the final order + the new files.
  const buildImagePayload = () => {
    const files = [];
    const layout = images.map((img) => {
      if (img.kind === "existing") return { file: img.file };
      files.push(img.file);
      return { new: files.length - 1 };
    });

    const original = (initialProduct?.images || []).map(fileNameFromUrl);
    const changed =
      files.length > 0 ||
      layout.length !== original.length ||
      layout.some((entry, i) => entry.file !== original[i]);

    return { layout, files, changed };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form, buildImagePayload());
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
            <label>
              Images{" "}
              <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
                ({images.length}/{MAX_IMAGES})
              </span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={handleFilesChange}
              disabled={images.length >= MAX_IMAGES}
            />
            <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
              Image 1 is the cover. Pick a different number to move an image; the others renumber automatically.
            </span>
            {imageError && (
              <span style={{ fontSize: "0.8rem", color: "#f87171" }}>{imageError}</span>
            )}

            {images.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
                  gap: 10,
                  marginTop: 8,
                }}
              >
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    style={{
                      background: "var(--bg-card)",
                      border:
                        index === 0 ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 6,
                    }}
                  >
                    <img
                      src={img.preview}
                      alt={`Image ${index + 1}`}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        borderRadius: 6,
                        display: "block",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <select
                        value={index + 1}
                        onChange={(e) => moveImage(index, Number(e.target.value) - 1)}
                        aria-label={`Position of image ${index + 1}`}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--text)",
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                          padding: "4px 6px",
                        }}
                      >
                        {images.map((_, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-btn danger"
                        style={{ flex: "none", padding: "4px 10px" }}
                        onClick={() => removeImage(img.id)}
                        aria-label={`Delete image ${index + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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