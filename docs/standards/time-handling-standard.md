# 时间处理守则（PostgreSQL）

## 1. 目标
- 本项目统一处理全球订单时间。
- 事实时间只存 UTC 语义的 Unix 毫秒时间戳。
- 通过 DB 约束 + 静态扫描 + 测试回归三道门禁防止回归。

## 2. 时间模型

### 2.1 Instant（绝对瞬时）
- 字段命名：`*_at_ms`（如 `created_at_ms`、`paid_at_ms`）。
- DB 类型：`BIGINT`。
- 服务内类型：`bigint`。
- API 输出：`string`（避免 BigInt JSON 精度/兼容问题）。

### 2.2 Wall Time（墙上时间）
- 字段组合：`*_local` + `*_tz`。
- `*_local` 格式固定：`YYYY-MM-DDTHH:mm:ss`。
- `*_tz` 必须是 IANA 时区名（如 `Asia/Shanghai`）。
- 禁止把 wall time 直接写入 `*_at_ms` 且丢失 `*_tz`。

## 3. DST 策略（全项目唯一）
- `nonexistent`（春季跳时不存在时间）：`REJECT`。
- `ambiguous`（秋季回拨重复时间）：`EARLIER`。
- 策略由 `src/time/policy.ts` 固化，业务代码不得覆写。

## 4. DB 约束
- 关键 `*_at_ms` 字段必须加范围 CHECK：
  - 下限：`946684800000`（2000-01-01）。
  - 上限：`4102444800000`（2100-01-01）。
- 建议增加查询影子列：
  - `*_utc TIMESTAMP GENERATED ALWAYS AS (to_timestamp(*_at_ms / 1000.0) AT TIME ZONE 'UTC') STORED`。
- 影子列仅用于查询，不得作为事实来源反向回写。

## 5. 编码规范
- 业务代码禁止直接 `new Date()` / `Date.now()`。
- 唯一合法入口：`src/time/policy.ts`。
- 禁止在业务 schema/migration 使用 `timestamp/timestamptz/DateTime` 作为事实时间列。

## 6. 运行环境要求
- 运行环境必须支持 IANA 时区数据（tzdata/ICU）。
- 自检脚本必须通过：
  - `Intl.supportedValuesOf('timeZone')` 包含 `Asia/Shanghai` 与 `America/New_York`。

## 7. Prisma 7 适配要求
- `schema.prisma` 的 `datasource` 禁止配置 `url`，统一在根目录 `prisma.config.ts` 配置：
  - `import 'dotenv/config'`
  - `defineConfig({ datasource: { url: env('DATABASE_URL') } })`
- PostgreSQL 场景必须使用 `@prisma/adapter-pg`，并以 `new PrismaClient({ adapter })` 初始化。
- 业务 `BigInt` 字段在 Prisma 中保持 `BigInt`，进入 API 层统一转换为字符串。

## 8. Code Review 清单
- 新增时间字段是否遵守 `*_at_ms` / `*_local + *_tz` 二选一。
- 是否存在业务代码直接 `new Date()`。
- 是否补充了 DST 边界测试与字符串陷阱测试。
- 是否补充了 DB CHECK 约束。

## 9. 验证结论模板
每条结论必须包含：
1. 输入：写入方式 + ORM 字段类型 + DB 列类型。
2. 环境：进程 TZ + PG session TimeZone + driver 版本。
3. 观测：`epoch_ms` / `toISOString` / 原始值。
4. 标签：`成立`、`有条件成立`、`不建议照抄`。
