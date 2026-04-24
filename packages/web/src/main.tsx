import { createRoot } from "react-dom/client";

import { App } from "./app/App";

if (window.location.pathname === "/ai" || window.location.pathname === "/ai/") {
  window.location.replace("/ai/index.html");
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found");
}

createRoot(container).render(<App />);
