const __VLS_props = defineProps();
function stringify(value) {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function formatDate(value) {
    return new Date(value).toLocaleString();
}
function labelFor(type) {
    const labels = {
        "session.created": "会话创建",
        "draft.generated": "设定补全",
        "draft.updated": "设定更新",
        "session.confirmed": "设定确认",
        "player.message": "玩家发言",
        "agent.speak_player": "Agent 发言",
        "agent.speak_agent": "Agent 交互",
        "agent.reasoning": "思路摘要",
        "agent.stage_direction": "舞台指令",
        "agent.story_effect": "剧情效果",
        "scene.updated": "场景状态",
        "system.tick_started": "Tick 开始",
        "system.tick_completed": "Tick 完成",
        "system.timer_updated": "定时器更新",
        "system.wait_scheduled": "等待计划",
        "system.story_ended": "故事结束",
        "system.usage_recorded": "Token 统计"
    };
    return labels[type];
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "timeline" },
});
for (const [event] of __VLS_getVForSourceType((__VLS_ctx.events))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (`${event.seq}-${event.type}`),
        ...{ class: "event-card" },
        'data-type': (event.type),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "event-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.labelFor(event.type));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (event.seq);
    (__VLS_ctx.formatDate(event.createdAt));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "event-body" },
    });
    if (event.type === 'player.message') {
        (event.payload.text);
    }
    else if (event.type === 'agent.speak_player') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (event.payload.speaker);
        (event.payload.message);
    }
    else if (event.type === 'agent.speak_agent') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (event.payload.speaker);
        (event.payload.targetAgentId);
        (event.payload.message);
    }
    else if (event.type === 'agent.reasoning') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (event.payload.speaker);
        (event.payload.summary);
    }
    else if (event.type === 'agent.stage_direction') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (event.payload.speaker);
        (event.payload.direction);
    }
    else if (event.type === 'agent.story_effect') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (event.payload.label);
        (event.payload.description);
    }
    else if (event.type === 'scene.updated') {
        (__VLS_ctx.stringify(event.payload));
    }
    else {
        (__VLS_ctx.stringify(event.payload));
    }
}
/** @type {__VLS_StyleScopedClasses['timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['event-card']} */ ;
/** @type {__VLS_StyleScopedClasses['event-header']} */ ;
/** @type {__VLS_StyleScopedClasses['event-body']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            stringify: stringify,
            formatDate: formatDate,
            labelFor: labelFor,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=EventTimeline.vue.js.map