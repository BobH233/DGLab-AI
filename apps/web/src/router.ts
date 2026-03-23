import { createRouter, createWebHistory } from "vue-router";
import { getSavedAuthPassword } from "./auth";
import HomePage from "./pages/HomePage.vue";
import DraftReviewPage from "./pages/DraftReviewPage.vue";
import SessionConsolePage from "./pages/SessionConsolePage.vue";
import PerformanceModePage from "./pages/PerformanceModePage.vue";
import SessionPrintPage from "./pages/SessionPrintPage.vue";
import SessionMemoryDebugPage from "./pages/SessionMemoryDebugPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";
import ElectroStimSettingsPage from "./pages/ElectroStimSettingsPage.vue";
import LlmCallHistoryPage from "./pages/LlmCallHistoryPage.vue";
import InternalBuildInfoPage from "./pages/InternalBuildInfoPage.vue";
import LoginPage from "./pages/LoginPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      component: LoginPage,
      meta: {
        public: true,
        standalone: true
      }
    },
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
      path: "/sessions/:id/performance",
      component: PerformanceModePage
    },
    {
      path: "/sessions/:id/print",
      component: SessionPrintPage,
      meta: {
        standalone: true
      }
    },
    {
      path: "/sessions/:id/debug",
      component: SessionMemoryDebugPage
    },
    {
      path: "/settings",
      component: SettingsPage
    },
    {
      path: "/llm-calls",
      component: LlmCallHistoryPage
    },
    {
      path: "/internal/build-info",
      component: InternalBuildInfoPage
    },
    {
      path: "/devices/e-stim",
      component: ElectroStimSettingsPage
    }
  ]
});

router.beforeEach((to) => {
  if (to.meta.public === true) {
    return true;
  }

  if (getSavedAuthPassword()) {
    return true;
  }

  return {
    path: "/login",
    query: {
      redirect: to.fullPath
    }
  };
});
