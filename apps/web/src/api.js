const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001/api";
async function request(path, init) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {})
        },
        ...init
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(payload.message ?? response.statusText);
    }
    return response.json();
}
export const api = {
    getConfig() {
        return request("/config");
    },
    saveConfig(config) {
        return request("/config", {
            method: "PUT",
            body: JSON.stringify(config)
        });
    },
    listSessions() {
        return request("/sessions");
    },
    createDraft(playerBrief) {
        return request("/sessions/draft", {
            method: "POST",
            body: JSON.stringify({ playerBrief })
        });
    },
    getSession(id) {
        return request(`/sessions/${id}`);
    },
    updateDraft(id, patch) {
        return request(`/sessions/${id}/draft`, {
            method: "PATCH",
            body: JSON.stringify(patch)
        });
    },
    confirmSession(id) {
        return request(`/sessions/${id}/confirm`, {
            method: "POST"
        });
    },
    postMessage(id, text) {
        return request(`/sessions/${id}/messages`, {
            method: "POST",
            body: JSON.stringify({ text })
        });
    },
    retrySession(id) {
        return request(`/sessions/${id}/retry`, {
            method: "POST"
        });
    },
    updateTimer(id, body) {
        return request(`/sessions/${id}/timer`, {
            method: "POST",
            body: JSON.stringify(body)
        });
    },
    getEvents(id, cursor) {
        const query = cursor ? `?cursor=${cursor}` : "";
        return request(`/sessions/${id}/events${query}`);
    },
    streamUrl(id) {
        return `${API_BASE}/sessions/${id}/stream`;
    }
};
//# sourceMappingURL=api.js.map
