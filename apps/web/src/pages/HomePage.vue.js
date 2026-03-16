import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
const router = useRouter();
const playerBrief = ref("");
const sessions = ref([]);
const loading = ref(false);
const error = ref("");
async function loadSessions() {
    sessions.value = await api.listSessions();
}
async function createDraft() {
    loading.value = true;
    error.value = "";
    try {
        const session = await api.createDraft(playerBrief.value.trim());
        await router.push(`/sessions/${session.id}/draft`);
    }
    catch (caught) {
        error.value = caught instanceof Error ? caught.message : "创建失败";
    }
    finally {
        loading.value = false;
    }
}
function formatDate(value) {
    return new Date(value).toLocaleString();
}
onMounted(() => {
    void loadSessions();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid two-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
    value: (__VLS_ctx.playerBrief),
    ...{ class: "field textarea" },
    rows: "12",
    placeholder: "输入故事背景、角色关系、你希望的氛围与人物设定。",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.createDraft) },
    ...{ class: "button primary" },
    disabled: (__VLS_ctx.loading || !__VLS_ctx.playerBrief.trim()),
});
(__VLS_ctx.loading ? "生成中..." : "生成草案");
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "error-text" },
    });
    (__VLS_ctx.error);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "session-list" },
});
for (const [session] of __VLS_getVForSourceType((__VLS_ctx.sessions))) {
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        key: (session.id),
        ...{ class: "session-item" },
        to: (session.status === 'draft' ? `/sessions/${session.id}/draft` : `/sessions/${session.id}`),
    }));
    const __VLS_2 = __VLS_1({
        key: (session.id),
        ...{ class: "session-item" },
        to: (session.status === 'draft' ? `/sessions/${session.id}/draft` : `/sessions/${session.id}`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (session.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (session.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.formatDate(session.updatedAt));
    var __VLS_3;
}
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['error-text']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['session-list']} */ ;
/** @type {__VLS_StyleScopedClasses['session-item']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            playerBrief: playerBrief,
            sessions: sessions,
            loading: loading,
            error: error,
            createDraft: createDraft,
            formatDate: formatDate,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=HomePage.vue.js.map