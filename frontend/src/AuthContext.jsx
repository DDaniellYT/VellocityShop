import { createContext, useContext, useState, useEffect } from "react";
import { setAuthToken } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { token, username, role } | null

  useEffect(() => {
    setAuthToken(user?.token || null);
  }, [user]);

  const loginUser = (data) => setUser(data);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, loginUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}