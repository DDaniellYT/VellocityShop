import { useEffect, useRef, useState } from "react";
import { API_ORIGIN } from "../api.js";

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB, same limit as the server
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif)$/i;

const emptyForm = {
  title: "",
  material: "",
  help_used: "",
  hours: "",
  service: "",
  weight: "",
  colors: "",
  specs: "",
  description: "",
  long_description: "",
};

// Ids only need to be unique inside this form.
let imageCounter = 0;
const makeImageId = () => `img-${Date.now()}-${imageCounter++}`;

const toAbsolute = (url) => (url.startsWith("http") ? url : `${API_ORIGIN}${url}`);
const fileNameFromUrl = (url) => decodeURIComponent(url.split("/").pop());

// Images the item already has on the server, in their saved order.
const imagesFromItem = (item) =>
  (item?.images || []).map((url) => ({
    id: makeImageId(),
    kind: "existing",
    file: fileNameFromUrl(url), // e.g. "2.jpg"
    preview: toAbsolute(url),
  }));

export default function RepItemForm({ initialItem, onSubmit, onClose, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState([]);
  const [imageError, setImageError] = useState("");

  // Lets the unmount cleanup see the latest list of images.
  const imagesRef = useRef([]);
  imagesRef.current = images;

  useEffect(() => {
    if (initialItem) {
      setForm({
        title: initialItem.title || "",
        material: initialItem.material || "",
        help_used: initialItem.help_used || "",
        hours: initialItem.hours ?? "",
        service: initialItem.service || "",
        weight: initialItem.weight || "",
        colors: initialItem.colors || "",
        specs: initialItem.specs || "",
        description: initialItem.description || "",
        long_description: initialItem.long_description || "",
      });
      setImages(imagesFromItem(initialItem));
    } else {
      setForm(emptyForm);
      setImages([]);
    }
    setImageError("");
  }, [initialItem]);

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
        problem = `An item can have at most ${MAX_IMAGES} images.`;
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

    const original = (initialItem?.images || []).map(fileNameFromUrl);
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
        <h3>{initialItem ? "Edit item" : "Add a new item"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Title</label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Articulated model bus"
              maxLength={200}
              required
            />
          </div>

          <div className="form-row">
            <label>Material</label>
            <input
              name="material"
              value={form.material}
              onChange={handleChange}
              placeholder="PETG"
              maxLength={200}
            />
          </div>

          <div className="form-row">
            <label>Help used</label>
            <input
              name="help_used"
              value={form.help_used}
              onChange={handleChange}
              placeholder="Client files, dimensions, an idea..."
              maxLength={500}
            />
          </div>

          <div className="form-row">
            <label>Time to complete, start to finish (hours)</label>
            <input
              name="hours"
              type="number"
              step="0.5"
              min="0"
              value={form.hours}
              onChange={handleChange}
              placeholder="12"
            />
          </div>

          <div className="form-row">
            <label>Service used</label>
            <input
              name="service"
              value={form.service}
              onChange={handleChange}
              placeholder="3D scanning, prototyping, mesh repair, 3D printing..."
              maxLength={300}
            />
          </div>

          <div className="form-row">
            <label>Weight of the part</label>
            <input
              name="weight"
              value={form.weight}
              onChange={handleChange}
              placeholder="320 g"
              maxLength={100}
            />
          </div>

          <div className="form-row">
            <label>Colors used</label>
            <input
              name="colors"
              value={form.colors}
              onChange={handleChange}
              placeholder="Yellow, black"
              maxLength={300}
            />
          </div>

          <div className="form-row">
            <label>Other specifications</label>
            <textarea
              name="specs"
              rows={4}
              value={form.specs}
              onChange={handleChange}
              placeholder="e.g. the bus also has moving wheels, moving doors..."
            />
          </div>

          <div className="form-row">
            <label>
              Short description{" "}
              <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
                ({form.description.length}/300)
              </span>
            </label>
            <textarea
              name="description"
              rows={3}
              maxLength={300}
              value={form.description}
              onChange={handleChange}
              placeholder="Short summary shown on the card..."
            />
          </div>

          <div className="form-row">
            <label>Full description</label>
            <textarea
              name="long_description"
              rows={6}
              value={form.long_description}
              onChange={handleChange}
              placeholder="The full story, shown on the item page..."
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
              {saving ? "Saving..." : initialItem ? "Save changes" : "Add item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}