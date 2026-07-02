# commands.ts

> `frontend/src/lib/commands.ts` · TypeScript · 约 92 行

## 用途

定义粒子形态、色板、快捷命令 chips，并把自然语言命令解析为粒子控制动作。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ShapeMode` | type | ~1 | 粒子形态枚举。 |
| `PaletteMode` | type | ~2 | 色板枚举。 |
| `VoiceCommand` | type | ~4 | 可执行的语音命令。 |
| `shapeLabels` | const | ~16 | 形态标签。 |
| `paletteLabels` | const | ~22 | 色板标签。 |
| `paletteColors` | const | ~29 | 色板颜色。 |
| `commandChips` | const | ~36 | UI 快捷命令。 |
| `parseVoiceCommand` | function | ~47 | 从文本解析形态、色板、能量和图谱动作。 |
| `clamp` | function | ~113 | 限制数值范围。 |

## 依赖

内部依赖:
- 无。

## 修改指南

- **新增命令**: 同步 `VoiceCommand` 类型、`commandChips` 和 `parseVoiceCommand`。
- **改色板**: 检查 `ParticleField.tsx` 和 `App.tsx` 是否有视觉联动。

## 依赖图

```text
commands.ts
→ 被引用: App.tsx
```

