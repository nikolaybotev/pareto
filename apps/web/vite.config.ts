import preact from "@preact/preset-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE ?? "./",
  plugins: [preact()],
  server: {
    fs: {
      allow: [path.resolve(root, "../..")],
    },
  },
  build: {
    target: "safari16",
    commonjsOptions: {
      include: [/ledger\.js/, /node_modules/],
    },
  },
  test: {
    include: ["unit/**/*.ts"],
  },
});
