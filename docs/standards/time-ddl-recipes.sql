-- PostgreSQL 时间治理 DDL 模板
-- 事实来源：*_at_ms BIGINT (UTC Unix 毫秒)
-- 范围：2000-01-01T00:00:00Z ~ 2100-01-01T00:00:00Z
-- 946684800000 = 2000-01-01T00:00:00Z
-- 4102444800000 = 2100-01-01T00:00:00Z

-- 示例：订单表时间字段
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_created_at_ms_range
  CHECK (created_at_ms BETWEEN 946684800000 AND 4102444800000);

-- 影子列（仅查询/报表用途，非事实来源）
ALTER TABLE orders
  ADD COLUMN created_at_utc TIMESTAMP GENERATED ALWAYS AS (
    to_timestamp(created_at_ms / 1000.0) AT TIME ZONE 'UTC'
  ) STORED;

-- 索引建议
CREATE INDEX IF NOT EXISTS idx_orders_created_at_ms ON orders (created_at_ms);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_utc ON orders (created_at_utc);
