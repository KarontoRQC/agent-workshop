# verify-motion-runtime.mjs

> `frontend/scripts/verify-motion-runtime.mjs` · JavaScript/Playwright · 动画运行时回归

## 用途

在真实浏览器中按 1 秒连续采样工作流虹光的旋转矩阵，并注入七柱字幕波形探针，验证正常与低动态模式下每根柱子的动画名称、周期、无限迭代和逐柱错峰。强制模拟 `prefers-reduced-motion: reduce` 时，虹光继续慢速运动，字幕波形不得被后置媒体查询覆盖为静止。

## 运行

```bash
cd frontend
node scripts/verify-motion-runtime.mjs http://127.0.0.1:5196
```

## 修改指南

- 修改工作流虹光周期或低动态规则时同步更新允许的角速度区间。
- 该脚本验证连续运动而非单帧截图，不能用静态 CSS 字符串检查替代。
