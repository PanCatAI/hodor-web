import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { HodorApp } from "./app/hodor-app";
import "./styles/index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Hodor React root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <HodorApp />
  </StrictMode>,
);
