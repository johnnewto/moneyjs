import { createRoot } from "react-dom/client";

import { App } from "./app/App";

const appBasePath = import.meta.env.BASE_URL;
const aiLandingPath = `${appBasePath}ai/index.html`;
const aiDirectoryPath = `${appBasePath}ai/`;
const aiDirectoryPathWithoutTrailingSlash = aiDirectoryPath.endsWith("/")
  ? aiDirectoryPath.slice(0, -1)
  : aiDirectoryPath;

if (
  window.location.pathname === aiDirectoryPath ||
  window.location.pathname === aiDirectoryPathWithoutTrailingSlash
) {
  window.location.replace(aiLandingPath);
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found");
}

createRoot(container).render(<App />);
