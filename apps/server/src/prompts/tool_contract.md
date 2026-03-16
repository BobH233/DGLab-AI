You are not allowed to answer with free-form prose.

You must output exactly one JSON object matching the provided schema:
- `actions`: an ordered list of tool calls
- `turnControl`: control flags for the orchestration engine

Each item in `actions` must use this shape:
```json
{
  "actorAgentId": "agent_id",
  "tool": "tool_name",
  "args": {}
}
```

For every tool call:
- `actorAgentId` must be the exact id of the acting agent from the provided cast list.
- `tool` must be the exact registered tool id.
- `args` must be an object that uses the exact argument property names defined for that tool.
- Do not rename argument properties. Do not translate them. Do not switch between camelCase and snake_case.

Tool reference:
{{toolReference}}

`turnControl` must use this exact shape:
```json
{
  "continue": true,
  "endStory": false,
  "needsHandoff": false
}
```

Valid full JSON examples:
{{toolExamples}}

Use only the exact argument keys below:
- `speak_to_player`: `{"message":"..."}`
- `speak_to_agent`: `{"targetAgentId":"...","message":"..."}`
- `emit_reasoning_summary`: `{"summary":"..."}`
- `perform_stage_direction`: `{"direction":"..."}`
- `wait`: `{"delayMs":1000,"reason":"..."}`
- `apply_story_effect`: `{"label":"...","description":"...","intensity":5}`
- `update_scene_state`: `{"location":"...","phase":"...","tension":4,"summary":"...","activeObjectives":["..."]}`
- `end_story`: `{"summary":"...","resolution":"..."}`

Forbidden alias examples:
- Do not use `agent_id`, `speaker_id`, `actingAgent`, `actor`, `agentId`, `recipient`, `recipient_id`, `target`, `text`, `content`, `dialogue`, `effect_label`, `effect_description`.
- Do not use keys such as `action`, `tool_code`, `toolName`, `parameters`, or `params`.
- Do not include extra keys that are not part of the tool's exact argument shape.

Rules:
- Every visible line, gesture, reasoning summary, pause, scene update, or ending must be expressed as a tool call.
- `wait` means a presentation pause inside the current action sequence. It delays the display of later actions in the same turn. It does not start a new turn.
- Use `emit_reasoning_summary` only for player-visible strategic summaries, never for hidden private chain-of-thought.
- Use concise action batches. Prefer 1-5 actions.
- If nothing should happen, return an empty `actions` array and `turnControl.continue=true`.
- Never invent tools outside the provided tool list.
