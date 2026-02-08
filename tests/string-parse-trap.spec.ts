import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { assertWallTimeLocalFormat } from '../src/time/policy.js';

function parseEpochWithTz(tz: string, value: string): number {
  const output = execFileSync(
    process.execPath,
    ['-e', `console.log(new Date(${JSON.stringify(value)}).getTime())`],
    {
      env: {
        ...process.env,
        TZ: tz,
      },
      encoding: 'utf8',
    }
  ).trim();

  return Number(output);
}

describe('string 解析陷阱', () => {
  it('new Date("YYYY-MM-DD HH:mm:ss") 在不同时区会得到不同 epoch（禁止业务路径使用）', () => {
    const raw = '2024-04-11 15:24:53';
    const utcMs = parseEpochWithTz('UTC', raw);
    const shMs = parseEpochWithTz('Asia/Shanghai', raw);

    expect(utcMs - shMs).toBe(8 * 3600 * 1000);
  });

  it('墙上时间 local 格式必须严格匹配 YYYY-MM-DDTHH:mm:ss', () => {
    expect(() => assertWallTimeLocalFormat('2024-04-11 15:24:53')).toThrow(/invalid local datetime format/);
    expect(() => assertWallTimeLocalFormat('2024-04-11T15:24:53')).not.toThrow();
  });
});
