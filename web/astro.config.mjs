import { defineConfig } from "astro/config";

export default defineConfig({
  base: process.env.PUBLIC_SITE_BASE ?? "/",
  devToolbar: {
    enabled: false
  },
  output: "static",
  trailingSlash: "never"
});
