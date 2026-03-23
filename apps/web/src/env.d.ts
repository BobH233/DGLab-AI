/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_SOURCE?: string;
  readonly VITE_BUILD_STARTED_AT?: string;
  readonly VITE_BUILD_COMPLETED_AT?: string;
  readonly VITE_BUILD_DURATION_MS?: string;
  readonly VITE_BUILD_COMMIT_SHA?: string;
  readonly VITE_BUILD_COMMIT_SHORT_SHA?: string;
  readonly VITE_BUILD_COMMIT_MESSAGE?: string;
  readonly VITE_BUILD_BRANCH?: string;
  readonly VITE_BUILD_REPOSITORY?: string;
  readonly VITE_BUILD_WORKFLOW_NAME?: string;
  readonly VITE_BUILD_RUN_ID?: string;
  readonly VITE_BUILD_RUN_NUMBER?: string;
  readonly VITE_BUILD_RUN_ATTEMPT?: string;
  readonly VITE_BUILD_RUN_URL?: string;
  readonly VITE_BUILD_ACTOR?: string;
  readonly VITE_BUILD_EVENT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
