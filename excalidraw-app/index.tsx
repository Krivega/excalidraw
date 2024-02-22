import { getRandomUsername } from "@excalidraw/random-username";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./sentry";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();

const username = getRandomUsername();

root.render(
  <StrictMode>
    <App username={username} />
  </StrictMode>,
);
