# 麦富迪狗粮类产品评论看板 MVP

这是一个面向品牌运营的京东评论风险洞察 MVP，包含前端看板、本地 Node 后端，以及 Vercel Serverless API。

## 本地启动

```bash
npm start
```

启动后访问：

```text
http://127.0.0.1:8787
```

后端会同时提供静态看板页面和 API。

## 构建静态前端

```bash
npm run build
```

构建后会把 `index.html`、`styles.css`、`app.js`、`README.md` 复制到 `dist`，用于 Vercel 或 Cloudflare 静态部署。

## 后端能力

- `GET /api/health`：检查服务、DeepSeek、飞书配置状态。
- `GET /api/dashboard`：返回 SKU、评论、关键词统计和预警数据。
- `POST /api/reviews/sync`：生成每日历史评论数据，用于本地演示。
- `POST /api/reviews/realtime-sync`：根据已配置 SKU URL 实时抓取京东好评、中评、差评，并对差评调用 DeepSeek 解析。
- `POST /api/analyze-keywords`：调用 DeepSeek 分析评论关键词；未配置 Key 时使用本地规则兜底。
- `POST /api/feishu/query`：模拟飞书机器人查询。
- `POST /api/feishu/push-preview`：生成或推送飞书预警消息。

## 实时抓取说明

前端按钮 `实时抓取京东评论` 会请求：

```text
POST /api/reviews/realtime-sync
```

请求体示例：

```json
{
  "skus": [
    {
      "id": "sku-beef-10kg",
      "name": "麦富迪 牛肉双拼全价狗粮 10kg",
      "jdSkuId": "100883991228",
      "url": "https://item.jd.com/100883991228.html",
      "status": "active"
    }
  ],
  "pagesPerRating": 1,
  "pageSize": 10
}
```

返回结果包含：

- `reviews`：抓取到的评论，包含 `good`、`neutral`、`bad` 三类。
- `reviewUrl`：每条评论对应的商品评论锚点链接；差评在前端显示为 `差评链接`。
- `deepseekAnalysis`：DeepSeek 对差评的总结、风险点、证据和建议。
- `errors`：京东接口限流、系统繁忙或解析失败时的错误记录。
- `mode`：`jd-live` 表示抓到京东实时数据，`jd-fallback` 表示京东接口受限时使用兜底评论保持演示链路可用。

说明：京东评论接口不是稳定开放 API，可能返回“系统繁忙”或被限流。MVP 已做兜底，正式上线建议接授权数据源或第三方电商数据服务。

## 环境变量

复制 `.env.example` 为 `.env`：

```text
PORT=8787
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-chat
FEISHU_WEBHOOK_URL=你的飞书自定义机器人 Webhook
```

Vercel 部署时，在项目的 Environment Variables 中配置：

```text
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
FEISHU_WEBHOOK_URL
```

如果暂时不填 `DEEPSEEK_API_KEY`，后端会使用本地关键词规则完成分析，不影响 MVP 演示。

## 数据结构

评论对象核心字段：

- `id`：评论唯一 ID。
- `skuId`：归属 SKU。
- `content`：评论原文。
- `ratingType`：`good` / `neutral` / `bad`。
- `date`：评论日期。
- `crawledAt`：抓取日期。
- `user`：脱敏用户标识。
- `keywords`：关键词数组。
- `reviewUrl`：商品评论证据链接。

## 飞书接入建议

MVP 阶段建议：

1. 用飞书自定义机器人 Webhook 做风险预警推送。
2. 用企业自建应用网页入口嵌入看板。
3. 后续再接飞书事件回调，把用户消息转发到 `POST /api/feishu/query`。

## MVP 边界

当前版本不做完整工单流转、不做竞品分析、不做跨平台评论抓取。核心目标是先跑通“评论数据 -> 关键词分析 -> 风险预警 -> DeepSeek 差评解析 -> 看板证据链”的闭环。
