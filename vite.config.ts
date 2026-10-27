import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Shown in Settings > 정보: the build date and commit, so it is easy to tell whether the latest deploy is live.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);
const built = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/-/g, ".");

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(commit ? `${built} (${commit})` : built) }
});
