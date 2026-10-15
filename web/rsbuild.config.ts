import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

import { MULTIAGENCY_ICON } from "./src/shared/brand";

export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: "./src/main.tsx" } },
  html: {
    title: "Payables | MultiAgency",
    // The platform logo is shared by the app and favicon.
    tags: [{ tag: "link", attrs: { rel: "icon", type: "image/svg+xml", href: `data:image/svg+xml,${encodeURIComponent(MULTIAGENCY_ICON)}` } }],
  },
  output: { distPath: { root: "dist" } },
  // `pnpm server` answers the RPC calls; the dev server only serves the UI.
  server: { port: 3000, proxy: { "/rpc": "http://127.0.0.1:8787" } },
});
