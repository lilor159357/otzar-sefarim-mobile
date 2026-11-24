import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { StringsProvider } from "./lib/stringsContext.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StringsProvider>
      <App />
    </StringsProvider>
  </React.StrictMode>
);
