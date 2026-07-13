import { defineConfig } from "vite";

// Served from https://cyprien0312.github.io/aim2motec/ — assets must be
// requested under the repo subpath, so base is set accordingly. Local dev
// (npm run dev) ignores base for the root, so it still works at /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/aim2motec/" : "/",
});
