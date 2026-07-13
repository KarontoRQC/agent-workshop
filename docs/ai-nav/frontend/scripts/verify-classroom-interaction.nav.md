# verify-classroom-interaction.mjs

## 职责

通过源码断言锁定千人大课的语音与打字交互契约：单轮快速收音、发送后不自动复听、真实监听/连接/再次点击状态文案、语音按钮不等待确认播报、打字暂停同时中止请求和 TTS，以及控制台不再显示博客链接。

## 运行

```bash
cd frontend && node scripts/verify-classroom-interaction.mjs
```

## 修改指南

- 调整语音静默窗口、暂停契约或控制台文案时同步更新断言。
