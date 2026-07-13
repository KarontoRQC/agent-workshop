# MechaCockpitFrame.css

> `frontend/src/components/MechaCockpitFrame.css` · CSS · 首页机甲框架样式

## 用途

定义首页贴边机甲装甲、顶部脊梁、左右承力柱、机械铰链、下颌结构和蓝金能量接缝，并处理桌面、移动端和低动态模式。

## 修改指南

- 装甲必须贴近视口边缘，不得遮挡中央粒子图谱、左下 Agent Console 或移动端输入区。
- 首页已移除的顶部总控状态条和底部动力/目镜状态条不得通过伪元素或样式重新出现。
- 状态能量缝使用 6 秒低频呼吸，禁止恢复高频明暗闪烁。
- 修改后至少检查 390x844、1440x900 和 1920x1080 三种视口。

## 依赖关系

```text
MechaCockpitFrame.css
→ 被引用: MechaCockpitFrame.tsx
```
