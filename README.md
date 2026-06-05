# 麦富迪狗粮类产品评论看板 MVP

这是一个面向品牌运营的京东评论风险洞察 MVP，包含前端看板和本地 Node 后端。

## 本地启动

```bash
npm start
```

启动后访问：

```text
http://127.0.0.1:8787
```

后端会同时提供静态看板页面和 API。

## 后端能力

- `GET /api/health`：检查服务、DeepSeek、飞书配置状态。
- `GET /api/dashboard`：返回 SKU、评论、关键词统计和预警数据。
- `POST /api/reviews/sync`：模拟每日京东评论同步，并写入本地数据文件。
- `POST /api/analyze-keywords`：调用 DeepSeek 分析评论关键词；未配置 Key 时使用本地规则兜底。
- `POST /api/feishu/query`：模拟飞书机器人查询。
- `POST /api/feishu/push-preview`：生成或推送飞书预警消息。

## 环境变量

复制 `.env.example` 为 `.env`：

```text
PORT=8787
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-chat
FEISHU_WEBHOOK_URL=你的飞书自定义机器人 Webhook
```

如果暂时不填 `DEEPSEEK_API_KEY`，后端会使用本地关键词规则完成分析，不影响 MVP 演示。

## 数据说明

当前后端使用 `backend/data/store.json` 做本地数据持久化。首次启动会自动生成 5 个麦富迪狗粮 SKU 和 30 天模拟评论数据。

正式接入时，可以替换 `backend/server.js` 里的评论抓取适配逻辑，把真实京东评论写入同样的数据结构：

- `id`：评论唯一 ID
- `skuId`：归属 SKU
- `content`：评论原文
- `ratingType`：`good` / `neutral` / `bad`
- `date`：评论日期
- `crawledAt`：抓取日期
- `user`：脱敏用户标识
- `keywords`：关键词数组

## 飞书接入建议

MVP 阶段建议：

1. 用飞书自定义机器人 Webhook 做风险预警推送。
2. 用企业自建应用网页入口嵌入看板。
3. 后续再接飞书事件回调，把用户消息转发到 `POST /api/feishu/query`。

## MVP 边界

本版本不做真实京东页面爬虫、不做自动工单流转、不做竞品分析。核心目标是先跑通“评论数据 -> 关键词分析 -> 风险预警 -> 飞书触达 -> 看板证据链”的后端闭环。
