import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import SortableProductCard from "../components/SortableProductCard.jsx";
import ProductForm from "../components/ProductForm.jsx";
import { useAuth } from "../AuthContext.jsx";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  moveProduct,
  reorderProducts,
  getAllOrders,
  updateOrderStatus,
  updateOrderAwb,
} from "../api.js";

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [view, setView] = useState("shop"); // "shop" | "orders"

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [awbDrafts, setAwbDrafts] = useState({}); // { [orderId]: { awb_number, carrier } }
  const [savingAwbId, setSavingAwbId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // avoid hijacking accidental clicks
    })
  );

  useEffect(() => {
    if (!user || user.role !== "admin") navigate("/login");
  }, [user, navigate]);

  const loadProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getProducts();
      setProducts(res.data);
    } catch {
      setError(
        "Couldn't reach the API. Make sure the backend server is running on http://localhost:5000."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const res = await getAllOrders();
      setOrders(res.data);
      const drafts = {};
      res.data.forEach((o) => {
        drafts[o.id] = {
          awb_number: o.awb_number || "",
          carrier: o.carrier || "Sameday",
        };
      });
      setAwbDrafts(drafts);
    } catch (err) {
      if (err?.response?.status === 401) {
        setOrdersError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setOrdersError("Couldn't load orders.");
      }
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") loadProducts();
  }, [user]);

  useEffect(() => {
    if (user?.role === "admin" && view === "orders") loadOrders();
  }, [user, view]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const openAddForm = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const openEditForm = (product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleSubmit = async (form) => {
    setSaving(true);
    setError("");
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, form);
      } else {
        await createProduct(form);
      }
      await loadProducts();
      closeForm();
    } catch (err) {
      if (err?.response?.status === 401) {
        setError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setError("Couldn't save the product.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    setError("");
    try {
      await deleteProduct(product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      if (err?.response?.status === 401) {
        setError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setError("Couldn't delete the product.");
      }
    }
  };

  const handleMove = async (product, direction) => {
    setError("");
    try {
      const res = await moveProduct(product.id, direction);
      setProducts(res.data);
    } catch (err) {
      if (err?.response?.status === 401) {
        setError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setError("Couldn't reorder the product.");
      }
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = products.findIndex((p) => p.id === active.id);
    const newIndex = products.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(products, oldIndex, newIndex);
    setProducts(reordered); // optimistic — snappy UI while the request is in flight

    setError("");
    try {
      await reorderProducts(reordered.map((p) => p.id));
    } catch (err) {
      if (err?.response?.status === 401) {
        setError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setError("Couldn't save the new order. Reloading...");
        loadProducts(); // roll back to server truth on failure
      }
    }
  };

  const handleToggleOrderStatus = async (order) => {
    const nextStatus = order.status === "completed" ? "pending" : "completed";
    setUpdatingOrderId(order.id);
    setOrdersError("");
    try {
      const res = await updateOrderStatus(order.id, nextStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: res.data.status } : o))
      );
    } catch (err) {
      if (err?.response?.status === 401) {
        setOrdersError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setOrdersError("Couldn't update that order.");
      }
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleAwbDraftChange = (orderId, field, value) => {
    setAwbDrafts((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value },
    }));
  };

  const handleSaveAwb = async (order) => {
    const draft = awbDrafts[order.id] || {};
    setSavingAwbId(order.id);
    setOrdersError("");
    try {
      const res = await updateOrderAwb(order.id, draft.awb_number, draft.carrier);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, awb_number: res.data.awb_number, carrier: res.data.carrier }
            : o
        )
      );
    } catch (err) {
      if (err?.response?.status === 401) {
        setOrdersError("Your session expired. Please log in again.");
        handleLogout();
      } else {
        setOrdersError("Couldn't save tracking info.");
      }
    } finally {
      setSavingAwbId(null);
    }
  };

  if (!user || user.role !== "admin") return null;

  const pendingOrders = orders.filter((o) => o.status !== "completed");
  const completedOrders = orders.filter((o) => o.status === "completed");

  const renderOrderCard = (order) => {
    const draft = awbDrafts[order.id] || { awb_number: "", carrier: "Sameday" };

    return (
      <div key={order.id} className="order-card">
        <div className="admin-order-card-header-row">
          <div className="order-card-header" style={{ marginBottom: 0 }}>
            <span>
              Order #{order.order_number} — {order.username} ({order.email})
            </span>
            <span>{new Date(order.created_at).toLocaleDateString()}</span>
          </div>
          <span className={`order-status-badge ${order.status}`}>{order.status}</span>
        </div>

        <table className="cart-table" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>${Number(item.price).toFixed(2)}</td>
                <td>{item.qty}</td>
                <td>${(item.price * item.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="awb-editor">
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Carrier</label>
            <select
              value={draft.carrier}
              onChange={(e) => handleAwbDraftChange(order.id, "carrier", e.target.value)}
            >
              <option value="Sameday">Sameday</option>
            </select>
          </div>
          <div className="form-row" style={{ marginBottom: 0, flex: 1 }}>
            <label>AWB number</label>
            <input
              type="text"
              placeholder="e.g. 1234567890"
              value={draft.awb_number}
              onChange={(e) => handleAwbDraftChange(order.id, "awb_number", e.target.value)}
            />
          </div>
          <button
            className="icon-btn"
            style={{ flex: "none", padding: "10px 16px", alignSelf: "flex-end" }}
            disabled={savingAwbId === order.id}
            onClick={() => handleSaveAwb(order)}
          >
            {savingAwbId === order.id ? "Saving..." : "Save tracking"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <div className="order-card-total" style={{ marginTop: 0 }}>
            Total: ${Number(order.total).toFixed(2)}
          </div>
          <button
            className="icon-btn"
            style={{ flex: "none", padding: "8px 16px" }}
            disabled={updatingOrderId === order.id}
            onClick={() => handleToggleOrderStatus(order)}
          >
            {updatingOrderId === order.id
              ? "Updating..."
              : order.status === "completed"
              ? "Reopen order"
              : "Mark completed"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="section" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <div className="section-header">
        <h2>{view === "shop" ? "Admin — Manage Products" : "Admin — Orders"}</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/" className="quote-note" style={{ color: "var(--text-muted)" }}>
            Back to site
          </Link>
          <button
            className="icon-btn"
            onClick={handleLogout}
            style={{ flex: "none", padding: "8px 16px" }}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="login-tabs" style={{ maxWidth: 320, marginBottom: 28 }}>
        <button
          className={`login-tab ${view === "shop" ? "active" : ""}`}
          onClick={() => setView("shop")}
        >
          Shop
        </button>
        <button
          className={`login-tab ${view === "orders" ? "active" : ""}`}
          onClick={() => setView("orders")}
        >
          Orders
        </button>
      </div>

      {view === "shop" && (
        <>
          <div className="product-toolbar">
            <button className="add-product-btn" onClick={openAddForm}>
              + Add product
            </button>
          </div>

          {error && <div className="status-banner error">{error}</div>}
          {loading && <div className="status-banner loading">Loading products…</div>}

          {!loading && products.length === 0 && !error && (
            <div className="empty-panel">
              <h3>No products found</h3>
              <p>Add your first piece using the button above.</p>
            </div>
          )}

          {!loading && products.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={products.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="product-grid">
                  {products.map((product, index) => (
                    <SortableProductCard
                      key={product.id}
                      product={product}
                      onEdit={openEditForm}
                      onDelete={handleDelete}
                      onMoveLeft={(p) => handleMove(p, "left")}
                      onMoveRight={(p) => handleMove(p, "right")}
                      isFirst={index === 0}
                      isLast={index === products.length - 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {showForm && (
            <ProductForm
              initialProduct={editingProduct}
              onSubmit={handleSubmit}
              onClose={closeForm}
              saving={saving}
            />
          )}
        </>
      )}

      {view === "orders" && (
        <>
          {ordersError && <div className="status-banner error">{ordersError}</div>}
          {ordersLoading && <div className="status-banner loading">Loading orders…</div>}

          {!ordersLoading && orders.length === 0 && !ordersError && (
            <div className="empty-panel">
              <h3>No orders yet</h3>
              <p>Orders placed by customers will show up here.</p>
            </div>
          )}

          {!ordersLoading && orders.length > 0 && (
            <>
              <h3 className="admin-orders-subheading">
                To complete ({pendingOrders.length})
              </h3>
              {pendingOrders.length === 0 ? (
                <div className="empty-panel">
                  <h3>Nothing pending</h3>
                  <p>All caught up.</p>
                </div>
              ) : (
                <div className="order-history">{pendingOrders.map(renderOrderCard)}</div>
              )}

              <h3 className="admin-orders-subheading">
                Finished ({completedOrders.length})
              </h3>
              {completedOrders.length === 0 ? (
                <div className="empty-panel">
                  <h3>No completed orders yet</h3>
                  <p>Orders you mark as completed will show up here.</p>
                </div>
              ) : (
                <div className="order-history">{completedOrders.map(renderOrderCard)}</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}