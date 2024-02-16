import { defineConfig, loadEnv } from "vite";
import { ViteEjsPlugin } from "vite-plugin-ejs";
import { VitePWA } from "vite-plugin-pwa";
import config from "./vite.config.core.mjs";

// To load .env.local variables
const envVars = loadEnv("", `../`);
// https://vitejs.dev/config/
export default defineConfig({
  ...config,
  server: {
    port: Number(envVars.VITE_APP_PORT || 3000),
    // open the browser
    open: true,
  },
  build: {
    ...config.build,
    outDir: "build",
    sourcemap: true,
  },
  plugins: [
    ...config.plugins,
    ViteEjsPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        /* set this flag to true to enable in Development mode */
        enabled: false,
      },

      workbox: {
        // Don't push fonts and locales to app precache
        globIgnores: ["fonts.css", "**/locales/**", "service-worker.js"],
        runtimeCaching: [
          {
            urlPattern: new RegExp("/.+.(ttf|woff2|otf)"),
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 90, // <== 90 days
              },
            },
          },
          {
            urlPattern: new RegExp("fonts.css"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "fonts",
              expiration: {
                maxEntries: 50,
              },
            },
          },
          {
            urlPattern: new RegExp("locales/[^/]+.js"),
            handler: "CacheFirst",
            options: {
              cacheName: "locales",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // <== 30 days
              },
            },
          },
        ],
      },
      manifest: {
        short_name: "Excalidraw",
        name: "Excalidraw",
        description:
          "Excalidraw is a whiteboard tool that lets you easily sketch diagrams that have a hand-drawn feel to them.",
        icons: [
          {
            src: "android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "apple-touch-icon.png",
            type: "image/png",
            sizes: "180x180",
          },
          {
            src: "favicon-32x32.png",
            sizes: "32x32",
            type: "image/png",
          },
          {
            src: "favicon-16x16.png",
            sizes: "16x16",
            type: "image/png",
          },
        ],
        start_url: "/",
        display: "standalone",
        theme_color: "#121212",
        background_color: "#ffffff",
        file_handlers: [
          {
            action: "/",
            accept: {
              "application/vnd.excalidraw+json": [".excalidraw"],
            },
          },
        ],
        share_target: {
          action: "/web-share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            files: [
              {
                name: "file",
                accept: [
                  "application/vnd.excalidraw+json",
                  "application/json",
                  ".excalidraw",
                ],
              },
            ],
          },
        },
        screenshots: [
          {
            src: "/screenshots/virtual-whiteboard.png",
            type: "image/png",
            sizes: "462x945",
          },
          {
            src: "/screenshots/wireframe.png",
            type: "image/png",
            sizes: "462x945",
          },
          {
            src: "/screenshots/illustration.png",
            type: "image/png",
            sizes: "462x945",
          },
          {
            src: "/screenshots/shapes.png",
            type: "image/png",
            sizes: "462x945",
          },
          {
            src: "/screenshots/collaboration.png",
            type: "image/png",
            sizes: "462x945",
          },
          {
            src: "/screenshots/export.png",
            type: "image/png",
            sizes: "462x945",
          },
        ],
      },
    }),
  ],
});
