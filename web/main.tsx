import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { InputLearningProvider } from "./inputLearning.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("缺少 #root 元素");

createRoot(rootEl).render(
  <React.StrictMode>
    <InputLearningProvider><App /></InputLearningProvider>
  </React.StrictMode>
);
