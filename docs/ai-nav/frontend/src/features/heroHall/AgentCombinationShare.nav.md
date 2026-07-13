# AgentCombinationShare.tsx

> `frontend/src/features/heroHall/AgentCombinationShare.tsx` · TypeScript React

## 用途

为生成后的 `agent_combination` 英雄殿堂提供全局分享入口。组件在标题区渲染“分享殿堂”按钮，并通过 portal 打开分享弹层；弹层展示当前推荐编号对应的规范入口 URL、本地生成的二维码、复制链接和保存 PNG 二维码操作。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `AgentCombinationShare` | component | 管理分享弹层、剪贴板反馈、二维码 Canvas 和 PNG 下载。 |

## 依赖

内部依赖:
- `AgentCombinationShare.css` — 分享按钮与弹层的蓝金 HUD 样式。

外部依赖(仅列包名,不做解释):
- `react`
- `react-dom`
- `lucide-react`
- `qrcode.react`

## 修改指南

- **改分享地址**: 规范 URL 由 `AgentCombinationEntryPage.tsx` 调用 `getAgentCombinationEntryUrl` 后传入，不能丢失 `recommendation_id` 对应的入口 `id`。
- **改二维码**: 保持二维码在浏览器本地生成，不引入外部二维码图片服务；保存动作继续导出可扫描的 PNG。
- **改弹层交互**: 保留 Esc、点击遮罩关闭、关闭后焦点回到分享按钮和复制成功反馈。

## 依赖图

```text
AgentCombinationShare.tsx
← 引入: react, react-dom, lucide-react, qrcode.react, AgentCombinationShare.css
→ 被引用: AgentCombinationEntryPage.tsx
```
