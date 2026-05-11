import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  console.error(
    'Root element not found. Make sure there is a <div id="root"></div> in your HTML.',
  );
}
