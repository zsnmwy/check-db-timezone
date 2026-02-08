# 文章说法验证报告（2026-02-08）

## 验证目标
- 验证文章《Prisma、Drizzle 等时间存储与时区问题》中的关键说法在 PostgreSQL 下是否成立。
- 覆盖 Prisma 与 Drizzle 两条 ORM 路径。
- 同时完成 Prisma 7 适配并基于官方文档验证配置方式。

## 官方文档依据（Prisma 7）
- 升级指南：Prisma 7 需把连接 URL 从 `schema.prisma` 移到 `prisma.config.ts`。  
  <https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7>
- Prisma Config：`defineConfig` + `env('DATABASE_URL')`。  
  <https://www.prisma.io/docs/orm/reference/prisma-config-reference>
- PostgreSQL + Driver Adapter：使用 `@prisma/adapter-pg`，并在 `new PrismaClient({ adapter })` 注入。  
  <https://www.prisma.io/docs/orm/overview/databases/postgresql>

## 环境
- 时间：`2026-02-08` 执行
- Node：`v24.11.1`
- PostgreSQL：Docker `postgres:16`
- ORM/Driver：
  - `prisma@7.3.0`
  - `@prisma/client@7.3.0`
  - `@prisma/adapter-pg@7.3.0`
  - `drizzle-orm@0.45.1`
  - `pg@8.18.0`
- 进程 TZ：`UTC`、`Asia/Shanghai`（矩阵双跑）
- PG session TimeZone：`UTC`

## 结论记录

### Case 1
- 输入：
  - 写入方式：Prisma `create`（`createdAtMs=1770508800000n`）
  - ORM 字段类型：Prisma `BigInt`
  - DB 列类型：`BIGINT`
- 环境：
  - 进程 TZ：`UTC` 与 `Asia/Shanghai` 双跑
  - PG session TimeZone：`UTC`
  - driver 版本：`@prisma/client@7.3.0` + `@prisma/adapter-pg@7.3.0`
- 观测：
  - `epoch_ms`：`1770508800000`（读回 `bigint`，一致）
  - `toISOString`：不适用（本 case 不经 `DateTime` 列）
  - 原始值：`1770508800000n`
- 结论标签：`成立`
- 备注：Instant 字段使用 `BIGINT + bigint` 在跨 TZ 运行时保持一致。

### Case 2
- 输入：
  - 写入方式：SQL 插入同一文本 `2026-02-08 08:00:00+08`
  - ORM 字段类型：Prisma `DateTime`
  - DB 列类型：`timestamp` vs `timestamptz`
- 环境：
  - 进程 TZ：`UTC`（`Asia/Shanghai` 结果同结论）
  - PG session TimeZone：`UTC`
  - driver 版本：`@prisma/client@7.3.0` + `@prisma/adapter-pg@7.3.0`
- 观测：
  - `epoch_ms`：两列相差 `8h`
  - `toISOString`：
    - `timestamp` 读回：`2026-02-08T08:00:00.000Z`
    - `timestamptz` 读回：`2026-02-08T00:00:00.000Z`
  - 原始值：同一插入文本在两种列类型表现语义不同
- 结论标签：`成立`
- 备注：`timestamp without time zone` 不携带时区语义，不能当全局事实时间。

### Case 3
- 输入：
  - 写入方式：Drizzle 插入 `mode: "date"` 与 `mode: "string"` 探针列
  - ORM 字段类型：`timestamp(..., { mode: 'date' })` / `timestamp(..., { mode: 'string' })`
  - DB 列类型：`timestamp` / `timestamptz`
- 环境：
  - 进程 TZ：`UTC` 与 `Asia/Shanghai` 双跑
  - PG session TimeZone：`UTC`
  - driver 版本：`drizzle-orm@0.45.1` + `pg@8.18.0`
- 观测：
  - `epoch_ms`：`BIGINT` 列 round-trip 一致
  - `toISOString`：`mode: 'date'` 返回 `Date`
  - 原始值：`mode: 'string'` 返回字符串
- 结论标签：`有条件成立`
- 备注：`mode: 'string'` 只能作为显示/原值使用，禁止进入业务时间转换主路径。

### Case 4
- 输入：
  - 写入方式：`new Date('2024-04-11 15:24:53')`（字符串陷阱）
  - ORM 字段类型：不依赖 ORM（JS 解析行为）
  - DB 列类型：不适用
- 环境：
  - 进程 TZ：`UTC` vs `Asia/Shanghai`
  - PG session TimeZone：不适用
  - driver 版本：不适用
- 观测：
  - `epoch_ms`：
    - `UTC`：`1712849093000`
    - `Asia/Shanghai`：`1712820293000`
  - `toISOString`：由上游 parse 差异决定
  - 原始值：同一字符串在不同时区解析差 `8h`
- 结论标签：`不建议照抄`
- 备注：禁止业务路径直接 `new Date(str)` 解析无时区字符串。

### Case 5
- 输入：
  - 写入方式：`wallTimeToEpochMs(local, tz)`（固定 DST 策略）
  - ORM 字段类型：不适用（应用层策略）
  - DB 列类型：目标落 `BIGINT`
- 环境：
  - 进程 TZ：`UTC` 与 `Asia/Shanghai` 双跑
  - PG session TimeZone：`UTC`
  - driver 版本：不适用
- 观测：
  - `epoch_ms`：
    - `2026-03-08T02:30:00 America/New_York`：稳定报错（nonexistent reject）
    - `2026-11-01T01:30:00 America/New_York`：固定 `1793511000000`（earlier）
  - `toISOString`：可由 `epoch_ms`稳定反推
  - 原始值：重复小时 `earlier/later` 相差 `3600000ms`
- 结论标签：`成立`
- 备注：`REJECT + EARLIER` 策略可稳定覆盖 DST 临界点。

## 汇总结论
- 文章中“`timestamp`/`timestamptz` 语义差异会导致误解或偏移”的核心说法：`成立`。
- 对全球订单事实时间，统一 `*_at_ms (BIGINT epoch_ms)`：`成立` 且已工程化落地。
- Drizzle `mode:'string'` 与 JS 字符串解析路径风险：`有条件成立`，必须禁入业务主路径。
- Prisma 7 适配已完成并通过全量校验（扫描 + lint + runtime-check + tests + TZ 矩阵）。
