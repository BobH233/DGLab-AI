import { createRouter, createWebHistory } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import DraftReviewPage from "./pages/DraftReviewPage.vue";
import SessionConsolePage from "./pages/SessionConsolePage.vue";
import SessionMemoryDebugPage from "./pages/SessionMemoryDebugPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: HomePage
    },
    {
      path: "/sessions/:id/draft",
      component: DraftReviewPage
    },
    {
      path: "/sessions/:id",
      component: SessionConsolePage
    },
    {
      path: "/sessions/:id/debug",
      component: SessionMemoryDebugPage
    },
    {
      path: "/settings",
      component: SettingsPage
    }
  ]
});
