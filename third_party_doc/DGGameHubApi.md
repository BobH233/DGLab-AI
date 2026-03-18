# 第三方插件接口

启动项目后可访问 `/api/docs` 查看 Swagger 文档。以下示例以 `v2` 为主，`v1` 旧接口仍保留，但推荐统一切到按通道的 `v2` 结构。

## 设计说明

现在 A / B 通道均可独立配置：

- 基础强度
- 随机强度
- 强度变化间隔
- 一键开火强度限制
- 波形列表
- 一键开火波形
- 波形播放模式
- 波形切换间隔

`v2` 的所有配置都以 `channels.a` / `channels.b` 表达。

兼容规则：

- `POST /api/v2/game/{clientId}/strength` 中若继续传旧版 `strength` / `randomStrength`，只会作用于 A 通道。
- `POST /api/v2/game/{clientId}/pulse` 中若继续传旧版 `pulseId`，只会作用于 A 通道。

如果服务器配置 `allowBroadcastToClients: true`，则 `{clientId}` 可写为 `all`，向全部在线客户端广播。

## 获取游戏信息

```sh
GET /api/v2/game/{clientId}
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "strengthConfig": {
    "a": {
      "strength": 5,
      "randomStrength": 5
    },
    "b": {
      "strength": 8,
      "randomStrength": 3
    }
  },
  "gameConfig": {
    "channels": {
      "a": {
        "enabled": true,
        "strengthChangeInterval": [15, 30],
        "fireStrengthLimit": 30,
        "pulseId": ["d6f83af0", "7eae1e5f"],
        "firePulseId": "d6f83af0",
        "pulseMode": "sequence",
        "pulseChangeInterval": 60
      },
      "b": {
        "enabled": true,
        "strengthChangeInterval": [20, 40],
        "fireStrengthLimit": 25,
        "pulseId": "eea0e4ce",
        "firePulseId": "2cbd592e",
        "pulseMode": "single",
        "pulseChangeInterval": 30
      }
    }
  },
  "clientStrength": {
    "a": {
      "strength": 6,
      "limit": 20,
      "tempStrength": 0
    },
    "b": {
      "strength": 9,
      "limit": 20,
      "tempStrength": 0
    }
  },
  "currentPulseId": {
    "a": "7eae1e5f",
    "b": "eea0e4ce"
  }
}
```

## 获取游戏主配置

```sh
GET /api/v2/game/{clientId}/config
```

返回结构与 `gameInfo.gameConfig` 一致。

## 设置游戏主配置

```sh
POST /api/v2/game/{clientId}/config
```

### 请求体

可只传需要变更的字段：

```json5
{
  "channels": {
    "a": {
      "strengthChangeInterval": [10, 20],
      "fireStrengthLimit": 35,
      "pulseMode": "random",
      "pulseChangeInterval": 45
    },
    "b": {
      "enabled": true,
      "strengthChangeInterval": [15, 25],
      "fireStrengthLimit": 20,
      "pulseId": ["eea0e4ce", "2cbd592e"],
      "firePulseId": "2cbd592e",
      "pulseMode": "sequence",
      "pulseChangeInterval": 20
    }
  }
}
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "message": "成功设置了 1 个游戏的主配置",
  "successClientIds": [
    "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
  ]
}
```

## 获取游戏强度配置

```sh
GET /api/v2/game/{clientId}/strength
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "strengthConfig": {
    "a": {
      "strength": 5,
      "randomStrength": 5
    },
    "b": {
      "strength": 8,
      "randomStrength": 3
    }
  }
}
```

## 设置游戏强度配置

```sh
POST /api/v2/game/{clientId}/strength
```

### 请求体

推荐写法：

```typescript
type StrengthOperation = {
  add?: number;
  sub?: number;
  set?: number;
};

type SetStrengthConfigRequest = {
  channels?: {
    a?: {
      strength?: StrengthOperation;
      randomStrength?: StrengthOperation;
    };
    b?: {
      strength?: StrengthOperation;
      randomStrength?: StrengthOperation;
    };
  };

  // 兼容旧版，仅作用于 A 通道
  strength?: StrengthOperation;
  randomStrength?: StrengthOperation;
};
```

示例：

```json5
{
  "channels": {
    "a": {
      "strength": { "set": 10 },
      "randomStrength": { "set": 2 }
    },
    "b": {
      "strength": { "add": 3 },
      "randomStrength": { "set": 6 }
    }
  }
}
```

旧版兼容示例：

```json5
{
  "strength": { "add": 1 }
}
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "message": "成功设置了 1 个游戏的强度配置",
  "successClientIds": [
    "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
  ]
}
```

## 获取当前波形

```sh
GET /api/v2/game/{clientId}/pulse
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "currentPulseId": {
    "a": "7eae1e5f",
    "b": "eea0e4ce"
  },
  "pulseId": {
    "a": ["d6f83af0", "7eae1e5f"],
    "b": "eea0e4ce"
  }
}
```

## 设置当前波形列表

```sh
POST /api/v2/game/{clientId}/pulse
```

### 请求体

推荐写法：

```json5
{
  "channels": {
    "a": {
      "pulseId": ["d6f83af0", "7eae1e5f"]
    },
    "b": {
      "pulseId": "eea0e4ce"
    }
  }
}
```

旧版兼容写法，仅设置 A 通道：

```json5
{
  "pulseId": "d6f83af0"
}
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "message": "成功设置了 1 个游戏的波形ID",
  "successClientIds": [
    "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
  ]
}
```

## 获取波形列表

```sh
GET /api/v2/pulse_list
GET /api/v2/game/{clientId}/pulse_list
```

- `/api/v2/pulse_list` 返回服务器内置波形列表
- `/api/v2/game/{clientId}/pulse_list` 返回内置波形 + 该客户端自定义波形

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "pulseList": [
    {
      "id": "d6f83af0",
      "name": "呼吸"
    }
  ]
}
```

## 一键开火

```sh
POST /api/v2/game/{clientId}/action/fire
```

### 请求体

可使用统一参数，也可按通道覆盖：

```typescript
type StartFireActionRequest = {
  strength?: number;     // 所有通道共用
  time?: number;         // 毫秒，默认 5000
  override?: boolean;    // true 为覆盖当前时长，false 为累加
  pulseId?: string;      // 所有通道共用
  channels?: {
    a?: {
      strength?: number;
      pulseId?: string;
      enabled?: boolean;
    };
    b?: {
      strength?: number;
      pulseId?: string;
      enabled?: boolean;
    };
  };
};
```

示例 1：A / B 同时使用同一强度和波形

```json5
{
  "strength": 20,
  "time": 5000,
  "pulseId": "d6f83af0"
}
```

示例 2：A / B 独立开火

```json5
{
  "time": 8000,
  "channels": {
    "a": {
      "strength": 30,
      "pulseId": "d6f83af0"
    },
    "b": {
      "strength": 18,
      "pulseId": "2cbd592e",
      "enabled": true
    }
  }
}
```

### 响应

```json5
{
  "status": 1,
  "code": "OK",
  "message": "成功向 1 个游戏发送了一键开火指令",
  "successClientIds": [
    "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
  ]
}
```

## 请求错误响应

```json5
{
  "status": 0,
  "code": "ERR::INVALID_REQUEST",
  "message": "请求参数不正确"
}
```
