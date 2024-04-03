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

const BACKEND_V2_GET = import.meta.env.VITE_APP_BACKEND_V2_GET_URL;
const BACKEND_V2_POST = import.meta.env.VITE_APP_BACKEND_V2_POST_URL;
const HTTP_STORAGE_BACKEND_URL = import.meta.env
  .VITE_APP_HTTP_STORAGE_BACKEND_URL;

root.render(
  <StrictMode>
    <App
      username={username}
      BACKEND_V2_POST={BACKEND_V2_POST}
      BACKEND_V2_GET={BACKEND_V2_GET}
      HTTP_STORAGE_BACKEND_URL={HTTP_STORAGE_BACKEND_URL}
      onError={console.error}
    />
  </StrictMode>,
);
