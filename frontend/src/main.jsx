import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
import { CartProvider } from "./CartContext.jsx";   // add this import
import App from "./App.jsx";
import "./index.css";
import { Analytics } from "@vercel/analytics/react";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>         
          <App />
          <Analytics />
        </CartProvider>
      </AuthProvider> 
    </BrowserRouter>
  </React.StrictMode>
);