# Agent 时间治理落地指南（PostgreSQL + Prisma 7 + Drizzle）

本指南用于约束后续 Agent 在本项目中处理时间相关代码的方式。目标是保证：
- DB 事实时间统一为 UTC 语义的 Unix 毫秒时间戳（`BIGINT`）。
- 时区差异、DST 边界、字符串解析陷阱不会污染业务数据。
- API 输出可被前端稳定转换并显示为用户本地时间。

## 1. 时间模型（先分种类，再写代码）

### 1.1 Instant（绝对瞬时）
- 命名：`*_at_ms`（例如：`created_at_ms`、`paid_at_ms`、`completed_at_ms`）。
- DB：`BIGINT`。
- 服务内类型：`bigint`。
- API：`string`（避免 BigInt JSON 问题）。

### 1.2 Wall Time（墙上时间）
- 命名：`*_local` + `*_tz`（例如：`appointment_local` + `appointment_tz`）。
- `*_local` 格式固定：`YYYY-MM-DDTHH:mm:ss`。
- `*_tz`：IANA 时区名（例如：`Asia/Shanghai`、`America/New_York`）。
- 禁止把墙上时间直接塞到 `*_at_ms` 并丢弃时区。

## 2. Schema 创建规范

### 2.1 Prisma 7
- `schema.prisma` 中 `datasource db` 只保留 `provider`，不要写 `url`。
- 连接地址必须在根目录 `prisma.config.ts` 中配置。
- 业务事实时间字段必须是 `BigInt`。
- 如果把 `url` 写回 `schema.prisma`，Prisma 7 会直接在 schema 校验阶段报错（常见为 P1012 类错误），并提示将连接配置迁移到 `prisma.config.ts`。

示例（`prisma/schema.prisma`）：
```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

model Order {
  id          Int    @id @default(autoincrement())
  createdAtMs BigInt @map("created_at_ms")
}
```

命名约定（防止歧义）：
- DB 列名：统一 `snake_case`（例如 `created_at_ms`）。
- TS 字段名：可用 `camelCase`（例如 `createdAtMs`），但必须通过 `@map("created_at_ms")` 显式映射。

### 2.2 Drizzle
- 业务事实时间字段使用 `bigint(..., { mode: "bigint" })`。
- 业务 schema 禁止用 `timestamp/timestamptz` 作为事实来源。

示例（`src/drizzle/schema.ts`）：
```ts
createdAtMs: bigint('created_at_ms', { mode: 'bigint' }).notNull()
```

### 2.3 DB DDL 约束
- 关键 `*_at_ms` 字段必须加 CHECK 范围：
  - 下限：`946684800000`（2000-01-01T00:00:00Z）
  - 上限：`4102444800000`（2100-01-01T00:00:00Z）
- 可增加查询影子列（只用于查询，不可反向回写事实）：
```sql
created_at_utc TIMESTAMP GENERATED ALWAYS AS (
  to_timestamp(created_at_ms / 1000.0) AT TIME ZONE 'UTC'
) STORED
```

## 3. 数据库连接与时区设置

### 3.1 连接原则
- Prisma 7：使用 `@prisma/adapter-pg` + `new PrismaClient({ adapter })`。
- pg/Drizzle：连接后显式设置 session 时区为 UTC。
- 对连接池推荐“连接参数强制 UTC”，不要只靠人工在业务代码里手写 `SET TIME ZONE`。

推荐连接后执行：
```sql
SET TIME ZONE 'UTC';
SHOW TIMEZONE;
```

推荐连接池参数（pg/Drizzle）：
```ts
new Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c TimeZone=UTC',
});
```

若使用连接串方式，也可在连接参数中带入等效 `options=-c TimeZone=UTC`，确保新连接默认就是 UTC。

### 3.2 数据库默认值建议（可选但推荐）
- `ALTER DATABASE <db_name> SET timezone TO 'UTC';`
- `ALTER ROLE <role_name> SET timezone TO 'UTC';`

说明：应用层 `SET TIME ZONE 'UTC'` 与 DB 级默认值可以同时存在，确保多环境一致。

## 4. 服务端写入时间（唯一入口）

仅允许通过 `src/time/policy.ts` 处理时间。以下 5 个函数必须按用途使用，不可混用。

| 函数 | 输入 | 输出 | 用途（何时调用） | 失败条件 |
|---|---|---|---|---|
| `nowEpochMs()` | 无 | `bigint` | 生成“当前瞬时”并写入 `*_at_ms`（如创建订单） | 无（依赖系统时钟） |
| `assertEpochMsRange(ms)` | `bigint` | `void` | 写库前、业务计算后做边界保护 | 超出 `[946684800000, 4102444800000]` 直接抛错 |
| `parseApiEpochMs(raw)` | API 入参字符串 | `bigint` | 解析客户端传来的 `*_at_ms` 字符串后进入业务 | 非数字格式或越界抛错 |
| `toApiEpochMs(ms)` | `bigint` | API 字符串 | 把 DB 的 `bigint` 时间返回给 API | 越界抛错 |
| `wallTimeToEpochMs(local, tz)` | `YYYY-MM-DDTHH:mm:ss` + IANA 时区 | `bigint` | 把墙上时间（预约时间）转换成可存储瞬时 | 格式非法、时区非法、DST 不存在时间抛错 |

DST 策略已固化且不可覆写：
- spring-forward 不存在时间：`reject`
- fall-back 重复时间：`earlier`

典型调用链：
1. 业务写入“当前时间”：`nowEpochMs()` -> `assertEpochMsRange(ms)` -> 存入 `*_at_ms`。
2. API 接收瞬时时间：`parseApiEpochMs(raw)` -> 业务处理 -> 存入 `*_at_ms`。
3. API 输出瞬时时间：DB 读出 `bigint` -> `toApiEpochMs(ms)` -> 返回字符串。
4. 预约场景（墙上时间）：`wallTimeToEpochMs(local, tz)` -> 存 `*_at_ms`（并保留 `*_local + *_tz`）。

禁止：
- 在业务目录直接 `new Date()` / `Date.now()`
- 直接 `new Date("YYYY-MM-DD HH:mm:ss")` 解析无时区字符串
- 绕开 `policy.ts` 直接将字符串或 `number` 写入 `*_at_ms`

## 5. DB -> API 转换规范

### 5.1 Instant 字段
- 从 DB 读取 `bigint` 后，用 `toApiEpochMs(ms)` 输出字符串。
- API 返回示例：
```json
{
  "created_at_ms": "1770508800000"
}
```

### 5.2 Wall Time 字段
- 直接返回 `*_local` + `*_tz`，不要隐式转换为单一 epoch 后丢失时区语义。

## 6. 前端展示规范

### 6.1 展示 Instant（用户本地时区）
- 前端拿到 `*_at_ms`（字符串）后转 `Number` 再构造 `Date`：
```ts
const date = new Date(Number(created_at_ms));
```
- 安全性说明：本项目强制毫秒范围 2000~2100（约 `4.1e12`），远小于 JS `Number` 安全整数上限（约 `9e15`），因此该转换在本项目约束内安全。
- 使用 `Intl.DateTimeFormat` 按用户本地时区显示（默认）：
```ts
new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(date);
```

### 6.2 指定某个时区展示（例如门店时区）
```ts
new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
}).format(date);
```

## 7. CI 与守卫

必须通过以下门禁：
- `scripts/check-time-policy.sh`：禁止业务 schema/migration 使用 `timestamp/timestamptz/DateTime` 作为事实列。
- ESLint：除 `src/time/policy.ts` 外，业务代码禁止 `new Date()` 与 `Date.now()`。
- `src/time/runtime-check.ts`：时区数据可用性自检（至少含 `Asia/Shanghai`、`America/New_York`）。
- 单测矩阵：
  - `tests/prisma-timezone.spec.ts`
  - `tests/drizzle-timezone.spec.ts`
  - `tests/dst-boundary.spec.ts`
  - `tests/string-parse-trap.spec.ts`
  - `tests/driver-regression.spec.ts`
  - `TZ=UTC` 与 `TZ=Asia/Shanghai` 双跑

## 8. Agent 提交前自查清单

每次改动时间相关逻辑前，先自查：
1. 新字段属于 Instant 还是 Wall Time？
2. Instant 是否严格使用 `*_at_ms` + `BIGINT` + `bigint`？
3. Wall Time 是否保存 `*_local + *_tz`？
4. 是否绕开了 `src/time/policy.ts`？
5. 是否引入了 `new Date()` 手滑写法？
6. lint、runtime-check、tests、tz-matrix 是否全部通过？

## 9. 常见违规反例（禁止）

反例 1：把无时区字符串直接喂给 `new Date()`
```ts
// ❌ 禁止：语义依赖运行时本地时区
new Date('2024-04-11 15:24:53');
```

反例 2：把墙上时间转 epoch 后丢掉原始时区
```ts
// ❌ 禁止：仅保存 epoch_ms，丢失 local+tz
save({ appointment_at_ms: wallTimeToEpochMs(local, tz) });
```
正确做法：至少同时保存 `appointment_local` + `appointment_tz`。

反例 3：把 `timestamp/timestamptz/DateTime` 当业务事实列
```sql
-- ❌ 禁止：事实时间列不应直接用 timestamp/timestamptz
created_at TIMESTAMPTZ NOT NULL
```
正确做法：事实列统一 `created_at_ms BIGINT NOT NULL`，必要时加 `created_at_utc` 影子列用于查询。
