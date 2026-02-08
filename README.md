# check-db-timezone

一个用于演示“时间治理规则”的 Demo 项目。  
目标不是业务功能，而是用工程化手段强制时间规范，避免时区/DST/字符串解析导致的数据污染。

## 这个 Demo 限制了什么

- 事实时间（Instant）只能用 `*_at_ms`，DB 类型必须是 `BIGINT`（epoch ms）。
- 墙上时间（Wall Time）必须用 `*_local + *_tz` 建模，禁止丢失时区。
- 时间转换只能走 `src/time/policy.ts`。
- 业务代码禁止直接 `new Date()` / `Date.now()`（ESLint 门禁）。
- schema/migration 禁止把 `timestamp/timestamptz/DateTime` 当事实列（脚本门禁）。
- 运行时检查 IANA 时区数据是否可用（`Asia/Shanghai`、`America/New_York`）。
- 测试覆盖 Prisma/Drizzle、DST 边界、字符串陷阱、driver 回归。

## 技术栈

- PostgreSQL（Docker）
- Prisma 7（`@prisma/adapter-pg`）
- Drizzle ORM
- TypeScript + Vitest + ESLint 9 flat config

## 快速开始

1. 安装依赖

```bash
npm ci
```

2. 启动本地 PostgreSQL

```bash
docker compose up -d
```

3. 执行全量校验

```bash
npm run ci
```

4. 运行时区矩阵测试（UTC + Asia/Shanghai）

```bash
npm run test:tz-matrix
```

## 常用命令

- `npm run check:time-policy`：扫描 schema/migration 违规时间类型
- `npm run lint`：ESLint 规则检查（含时间 API 限制）
- `npm run runtime-check`：Temporal + IANA 时区自检
- `npm run test`：生成 client、推 schema、执行测试
- `npm run ci`：一键执行上述核心门禁

## 关键规则入口

- 时间策略实现：`src/time/policy.ts`
- Agent 执行规范：`AGENT_TIME_GOVERNANCE_GUIDE.md`
- 项目守则：`docs/standards/time-handling-standard.md`
- DDL 范式：`docs/standards/time-ddl-recipes.sql`
- 文章验证报告：`docs/reports/2026-02-08-article-286-verification.md`

## 适用场景

适合全球化订单、跨时区调度、审计日志等场景。  
这份 Demo 的重点是“把时间规范变成可执行约束”，而不是只写文档倡议。
