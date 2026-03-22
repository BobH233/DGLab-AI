import { computed, reactive, readonly } from "vue";

export const AUTH_REQUIRED_EVENT = "dglabai:auth-required";
const AUTH_PASSWORD_STORAGE_KEY = "dglabai.auth_password";

function readStoredAuthPassword(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(AUTH_PASSWORD_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistAuthPassword(password: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (password) {
      window.localStorage.setItem(AUTH_PASSWORD_STORAGE_KEY, password);
      return;
    }
    window.localStorage.removeItem(AUTH_PASSWORD_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the in-memory value.
  }
}

const state = reactive({
  password: readStoredAuthPassword()
});

export function getSavedAuthPassword(): string {
  return state.password;
}

export function setSavedAuthPassword(password: string) {
  state.password = password.trim();
  persistAuthPassword(state.password);
}

export function clearSavedAuthPassword() {
  state.password = "";
  persistAuthPassword("");
}

export function notifyAuthRequired(redirectPath?: string) {
  clearSavedAuthPassword();
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, {
    detail: {
      redirectPath
    }
  }));
}

export function useAuthStore() {
  return {
    state: readonly(state),
    password: computed(() => state.password),
    isAuthenticated: computed(() => state.password.length > 0),
    setAuthPassword: setSavedAuthPassword,
    clearAuthPassword: clearSavedAuthPassword
  };
}
