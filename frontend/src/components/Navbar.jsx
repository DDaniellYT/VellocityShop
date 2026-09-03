import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useCart } from "../CartContext.jsx";     // add
import CartDrawer from "./CartDrawer.jsx";          // add

export default function Navbar() {
  const { user } = useAuth();
  const { itemCount, openCart } = useCart();         // add

  let authLabel = "Login";
  let authTo = "/login";
  if (user?.role === "admin") {
    authLabel = "Admin";
    authTo = "/admin";
  } else if (user) {
    authLabel = user.username;
    authTo = "/account";
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <img src="/logo.png" alt="Vellocity3D logo" />
          </span>
          Vellocity3D
        </Link>
        <nav className="nav-links">
          <Link to={authTo}>{authLabel}</Link>
          <Link to="/#products">Shop</Link>
          <Link to="/#work">Work</Link>
        </nav>
        <button className="cart-btn" aria-label="Cart" onClick={openCart}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
        </button>
      </div>
      <CartDrawer />
    </header>
  );
}