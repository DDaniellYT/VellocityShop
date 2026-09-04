import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useCart } from "../CartContext.jsx";
import CartDrawer from "./CartDrawer.jsx";

export default function Navbar() {
  const { user } = useAuth();
  const { itemCount, openCart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  let authLabel = "Login";
  let authTo = "/login";
  if (user?.role === "admin") {
    authLabel = "Admin";
    authTo = "/admin";
  } else if (user) {
    authLabel = user.username;
    authTo = "/account";
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand" onClick={closeMenu}>
          <span className="brand-mark">
            <img src="/logo.png" alt="Vellocity3D logo" />
          </span>
          Vellocity3D
        </Link>
        <nav className={`nav-links ${menuOpen ? "open" : ""}`}>
          <Link to={authTo} onClick={closeMenu}>{authLabel}</Link>
          <Link to="/#products" onClick={closeMenu}>Shop</Link>
          <Link to="/#work" onClick={closeMenu}>Work</Link>
        </nav>
        <button className="cart-btn" aria-label="Cart" onClick={openCart}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
        </button>
        <button
          className="mobile-menu-btn"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>
      <CartDrawer />
    </header>
  );
}