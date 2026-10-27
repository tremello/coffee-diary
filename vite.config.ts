import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Shown in 설정 > 정보 beside the version, so it is easy to tell which deploy is live. Empty when running locally.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

export default defineConfig({
  plugins: [react()],
  define: { __APP_COMMIT__: JSON.stringify(commit) }
});
