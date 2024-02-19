import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import packageJson from './package.json';
import config from "./vite.config.core.mjs";

// https://vitejs.dev/config/
export default defineConfig({
  ...config,

  build: {
    ...config.build,
    outDir: "dist",
    lib: {
      entry: resolve("./App.tsx"),
      name: "App",
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "cjs" ? "cjs" : "mjs"}`,
      // target: "esnext",
    },
    rollupOptions: {
      ...config.build.rollupOptions,
      output: {
        ...config.build.rollupOptions.output,
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: Object.keys(packageJson.peerDependencies),
    },
  },
  plugins: [
    ...config.plugins,
    dts({
      include: ["App.tsx"],
    }),
  ],
});
