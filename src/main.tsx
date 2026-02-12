import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root not found in index.html");
}

const root = createRoot(container);

root.render(
  // This enables React's Strict Mode, which activates additional checks and warnings for its descendants (including App).
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

