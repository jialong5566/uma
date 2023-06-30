import { defineConfig } from "uma";

export default defineConfig({
  routes: [
    { path: "/", component: "index" },
    { path: "/docs", component: "docs" },
  ],
  npmClient: '{{{ npmClient }}}',
});
