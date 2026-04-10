import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { OfflineStatusProvider } from "./context/OfflineStatusContext";
import App from "./App.tsx";
import "./index.css";
import "./lib/syncManager";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <NotificationProvider>
      <OfflineStatusProvider>
        <App />
      </OfflineStatusProvider>
    </NotificationProvider>
  </AuthProvider>
);
