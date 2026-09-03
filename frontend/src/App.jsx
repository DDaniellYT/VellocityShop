import { Routes, Route } from "react-router-dom";
import Storefront from "./pages/Storefront.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProductDetailPage from "./pages/ProductDetailPage.jsx";


export default function App() {
  return (
    <Routes>
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/" element={<Storefront />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}