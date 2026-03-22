import { createApp } from "vue";
import App from "./App.vue";
import { AUTH_REQUIRED_EVENT } from "./auth";
import { router } from "./router";
import "./style.css";

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_REQUIRED_EVENT, (event) => {
    const customEvent = event as CustomEvent<{ redirectPath?: string }>;
    const redirectPath = customEvent.detail?.redirectPath ?? router.currentRoute.value.fullPath;
    if (router.currentRoute.value.path === "/login") {
      return;
    }
    void router.push({
      path: "/login",
      query: {
        redirect: redirectPath
      }
    });
  });
}

createApp(App).use(router).mount("#app");
