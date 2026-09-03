import { createContext, useContext, useState, useCallback, useEffect } from "react";

const CartContext = createContext(null);

function generateOrderNumber() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${rand}`;
}
export function CartProvider({ children }) {
  const [items, setItems] = useState([]); // [{ product, qty }]
  const [isOpen, setIsOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState(generateOrderNumber);
  const [toast, setToast] = useState(null); // string | null

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const addToCart = useCallback((product, quantity = 1) => {
    const stock = product.stock ?? Infinity;
    let clamped = false;

    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(existing.qty + quantity, stock);
        if (nextQty === existing.qty) {
          clamped = true;
          return prev; // already at stock limit — no change
        }
        if (nextQty < existing.qty + quantity) clamped = true;
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: nextQty } : i
        );
      }
      const startQty = Math.min(quantity, stock);
      if (startQty < quantity) clamped = true;
      return [...prev, { product, qty: startQty }];
    });

    setToast(
      clamped
        ? `Only ${stock} of ${product.name} in stock`
        : `${product.name} added to cart`
    );
  }, []);

  const removeFromCart = (productId) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const updateQty = (productId, qty) => {
    if (qty < 1) return removeFromCart(productId);
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, qty: Math.min(qty, i.product.stock ?? Infinity) }
          : i
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    setOrderNumber(generateOrderNumber()); // next order gets a fresh number
  };

  useEffect(() => {
      if (!toast) return;
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }, [toast]);

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);  const total = items.reduce(
    (sum, i) => sum + i.qty * Number(i.product.price),
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        orderNumber,
        toast,
        openCart,
        closeCart,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        itemCount,
        total,
      }}
    >
      {children}
      {toast && <div className="cart-toast">{toast}</div>}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}