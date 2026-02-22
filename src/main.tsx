import React from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { App } from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root not found in index.html");
}

const root = createRoot(container);

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

root.render(
  // This enables React's Strict Mode, which activates additional checks and warnings for its descendants (including App).
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);

