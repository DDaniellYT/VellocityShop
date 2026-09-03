import axios from "axios";

export const API_ORIGIN = `http://${window.location.hostname}:5000`;
const API_BASE_URL = `${API_ORIGIN}/api`;

let currentToken = null;
export const setAuthToken = (token) => {
  currentToken = token;
};

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  if (currentToken) config.headers.Authorization = `Bearer ${currentToken}`;
  return config;
});

export const getCarouselImages = () => client.get("/carousel");
export const createOrder = (data) => client.post("/orders", data);
export const getMyOrders = () => client.get("/orders/mine");
export const getAllOrders = () => client.get("/orders");
export const updateOrderStatus = (id, status) =>
  client.patch(`/orders/${id}/status`, { status });
export const getProducts = () => client.get("/products");
export const getProduct = (id) => client.get(`/products/${id}`);
export const createProduct = (data) => client.post("/products", data);
export const updateProduct = (id, data) => client.put(`/products/${id}`, data);
export const deleteProduct = (id) => client.delete(`/products/${id}`);
export const moveProduct = (id, direction) =>
  client.post(`/products/${id}/move`, { direction });
export const reorderProducts = (ids) =>
  client.post("/products/reorder", { ids });
export const uploadImage = (file) => {
  const formData = new FormData();
  formData.append("image", file);
  return client.post("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const updateOrderAwb = (id, awb_number, carrier) =>
  client.patch(`/orders/${id}/awb`, { awb_number, carrier });
export const login = (username, password) =>
  client.post("/auth/login", { username, password });
export const verify2FA = (userId, code) =>
  client.post("/auth/verify-2fa", { userId, code });
export const register = (username, email, password) =>
  client.post("/auth/register", { username, email, password });

export default client;