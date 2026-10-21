import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages では https://<user>.github.io/<repo>/ の下で配信されるため、相対パスにする。
  base: "./",
});
