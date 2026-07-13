# recommendationEditAccess.ts

> `frontend/src/lib/recommendationEditAccess.ts` · TypeScript · 约 30 行

## 用途

按推荐编号把创建者编辑令牌保存在同源 `localStorage`，供 Hero Hall 判断可编辑/只读并为保存请求补 header。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `storeRecommendationEditToken` | function | 保存流中返回的非空编辑令牌。 |
| `getRecommendationEditToken` | function | 读取指定推荐编号的编辑令牌。 |
| `hasRecommendationEditAccess` | function | 判断当前浏览器是否拥有该推荐的编辑能力。 |

## 修改指南

- 禁止把编辑令牌拼进 Hero Hall URL、二维码、日志或可分享状态；分享页无本地令牌时必须只读。
