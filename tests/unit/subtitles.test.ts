import { describe, expect, it } from 'vitest';
import {
  MAX_END_MS,
  analyzeSubtitles,
  compareSubtitles,
  countChars,
  formatMs,
  minDurationMs,
  validateSubtitles,
} from '../../src/subtitles';
import type { Subtitle } from '../../src/types';

// 默认文本 2 字符 → 最低显示时长 1160ms；不涉及阅读规则的用例时长均 ≥ 1200ms
const sub = (
  id: string,
  track: 'A' | 'B',
  startMs: number,
  endMs: number,
  text = '字幕',
): Subtitle => ({ id, track, startMs, endMs, text });

describe('validateSubtitles', () => {
  it('接受空数组', () => {
    const r = validateSubtitles([]);
    expect(r).toEqual({ ok: true, subtitles: [] });
  });

  it('接受边界值 0 与 14400000', () => {
    const r = validateSubtitles([
      { id: 'a', track: 'A', startMs: 0, endMs: MAX_END_MS, text: 'x' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('拒绝非数组', () => {
    expect(validateSubtitles({}).ok).toBe(false);
    expect(validateSubtitles('[]').ok).toBe(false);
    expect(validateSubtitles(null).ok).toBe(false);
  });

  it('拒绝非对象项', () => {
    expect(validateSubtitles([1]).ok).toBe(false);
    expect(validateSubtitles([null]).ok).toBe(false);
    expect(validateSubtitles([[]]).ok).toBe(false);
  });

  it('拒绝非字符串 id 与重复 id', () => {
    expect(
      validateSubtitles([{ id: 1, track: 'A', startMs: 0, endMs: 1, text: 'x' }]).ok,
    ).toBe(false);
    const dup = [
      { id: 'a', track: 'A', startMs: 0, endMs: 1, text: 'x' },
      { id: 'a', track: 'B', startMs: 2, endMs: 3, text: 'y' },
    ];
    const r = validateSubtitles(dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('重复');
  });

  it('拒绝非法 track', () => {
    expect(
      validateSubtitles([{ id: 'a', track: 'C', startMs: 0, endMs: 1, text: 'x' }]).ok,
    ).toBe(false);
    expect(
      validateSubtitles([{ id: 'a', track: 'a', startMs: 0, endMs: 1, text: 'x' }]).ok,
    ).toBe(false);
  });

  it('拒绝非整数时间', () => {
    expect(
      validateSubtitles([{ id: 'a', track: 'A', startMs: 0.5, endMs: 1, text: 'x' }]).ok,
    ).toBe(false);
    expect(
      validateSubtitles([{ id: 'a', track: 'A', startMs: 0, endMs: Number.NaN, text: 'x' }]).ok,
    ).toBe(false);
  });

  it('拒绝越界时间区间', () => {
    const base = { id: 'a', track: 'A', text: 'x' };
    expect(validateSubtitles([{ ...base, startMs: -1, endMs: 1 }]).ok).toBe(false);
    expect(validateSubtitles([{ ...base, startMs: 5, endMs: 5 }]).ok).toBe(false);
    expect(validateSubtitles([{ ...base, startMs: 6, endMs: 5 }]).ok).toBe(false);
    expect(
      validateSubtitles([{ ...base, startMs: 0, endMs: MAX_END_MS + 1 }]).ok,
    ).toBe(false);
  });

  it('拒绝空 text 与非字符串 text', () => {
    expect(
      validateSubtitles([{ id: 'a', track: 'A', startMs: 0, endMs: 1, text: '' }]).ok,
    ).toBe(false);
    expect(
      validateSubtitles([{ id: 'a', track: 'A', startMs: 0, endMs: 1, text: 3 }]).ok,
    ).toBe(false);
  });

  it('任一项非法即拒绝整份', () => {
    const r = validateSubtitles([
      { id: 'ok', track: 'A', startMs: 0, endMs: 1000, text: 'x' },
      { id: 'bad', track: 'A', startMs: 0, endMs: 1000, text: '' },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe('countChars / minDurationMs', () => {
  it('去除全部 Unicode 空白后按码点计数', () => {
    expect(countChars('a b\nc\td')).toBe(4);
    // NBSP、表意空格、行分隔符、段分隔符
    expect(countChars(' 　  ')).toBe(0);
    // 细空格
    expect(countChars('  ')).toBe(0);
  });

  it('按码点而非 UTF-16 单元计数', () => {
    expect(countChars('😀')).toBe(1);
    expect(countChars('é')).toBe(2); // e + 组合重音符
  });

  it('最低显示时长 = 800 + 字符数 × 180', () => {
    expect(minDurationMs('')).toBe(800);
    expect(minDurationMs('ab')).toBe(1160);
    expect(minDurationMs('😀')).toBe(980);
  });
});

describe('规则：阅读过快', () => {
  it('实际时长恰好等于最低时长不记', () => {
    // 2 字符 → 1160ms
    expect(analyzeSubtitles([sub('a', 'A', 0, 1160)])).toEqual([]);
  });

  it('实际时长少 1ms 即记', () => {
    const risks = analyzeSubtitles([sub('a', 'A', 0, 1159)]);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ id: 'a', reasons: ['阅读过快'], relatedIds: [] });
  });
});

describe('规则：重叠', () => {
  it('后项 startMs 等于前项 endMs 不记', () => {
    expect(
      analyzeSubtitles([sub('a', 'A', 0, 1200), sub('b', 'A', 1200, 2400)]),
    ).toEqual([]);
  });

  it('后项 startMs 小于前项 endMs 时双方记', () => {
    const risks = analyzeSubtitles([sub('a', 'A', 0, 2001), sub('b', 'A', 1000, 3000)]);
    expect(risks.map((r) => r.id)).toEqual(['a', 'b']);
    expect(risks[0].reasons).toEqual(['重叠']);
    expect(risks[0].relatedIds).toEqual(['b']);
    expect(risks[1].reasons).toEqual(['重叠']);
    expect(risks[1].relatedIds).toEqual(['a']);
  });

  it('跨轨不记重叠', () => {
    expect(
      analyzeSubtitles([sub('a', 'A', 0, 2000), sub('b', 'B', 500, 1700)]),
    ).toEqual([]);
  });

  it('仅比较排序后的相邻对（不传递）', () => {
    // 排序：x[0,5000] y[1000,2200] z[3000,4200]
    // x-y 重叠；y-z 不重叠；x-z 区间虽相交但不相邻，不记
    const risks = analyzeSubtitles([
      sub('z', 'A', 3000, 4200),
      sub('x', 'A', 0, 5000),
      sub('y', 'A', 1000, 2200),
    ]);
    expect(risks.map((r) => r.id)).toEqual(['x', 'y']);
    expect(risks[0].reasons).toEqual(['重叠']);
  });

  it('startMs 相同按 endMs 排序后判定', () => {
    // 排序：b[0,1300] a[0,1500]；a.start 0 < b.end 1300 → 重叠
    const risks = analyzeSubtitles([sub('a', 'A', 0, 1500), sub('b', 'A', 0, 1300)]);
    expect(risks.map((r) => r.id)).toEqual(['a', 'b']);
    expect(risks.every((r) => r.reasons.includes('重叠'))).toBe(true);
  });

  it('startMs、endMs 均相同按 id 排序后判定', () => {
    const risks = analyzeSubtitles([sub('b', 'A', 0, 1200), sub('a', 'A', 0, 1200)]);
    expect(risks.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('规则：换屏过密', () => {
  it('startMs 差等于 500 不记', () => {
    expect(
      analyzeSubtitles([sub('a', 'A', 0, 1200), sub('b', 'B', 500, 1700)]),
    ).toEqual([]);
  });

  it('startMs 差为 499 时双方记', () => {
    const risks = analyzeSubtitles([sub('a', 'A', 0, 1200), sub('b', 'B', 499, 1699)]);
    expect(risks.map((r) => r.id)).toEqual(['a', 'b']);
    expect(risks[0].reasons).toEqual(['换屏过密']);
    expect(risks[1].reasons).toEqual(['换屏过密']);
  });

  it('跨轨也记', () => {
    const risks = analyzeSubtitles([sub('a', 'A', 0, 1200), sub('b', 'B', 100, 1300)]);
    expect(risks.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('仅比较全体排序后的相邻对', () => {
    // 排序：a(0) b(400) c(2000)；a-b 过密，b-c 差 1600 不记
    const risks = analyzeSubtitles([
      sub('c', 'A', 2000, 3200),
      sub('a', 'A', 0, 1200),
      sub('b', 'B', 400, 1600),
    ]);
    expect(risks.map((r) => r.id)).toEqual(['a', 'b']);
    expect(risks.every((r) => r.reasons.includes('换屏过密'))).toBe(true);
  });
});

describe('条目汇总与排序', () => {
  it('单字幕命中多规则时仅生成一个条目并汇总全部原因', () => {
    // s1：10 字符 → 最低 2600ms，实际 2000ms → 阅读过快；与 s2 重叠；与 s3 过密
    const risks = analyzeSubtitles([
      sub('s1', 'A', 1000, 3000, '一二三四五六七八九十'),
      sub('s2', 'A', 2500, 6000),
      sub('s3', 'B', 1200, 5000),
    ]);
    expect(risks).toHaveLength(3);
    const s1 = risks.find((r) => r.id === 's1')!;
    expect(s1.reasons).toEqual(['阅读过快', '重叠', '换屏过密']);
    expect(s1.relatedIds).toEqual(['s2', 's3']);
  });

  it('同一对字幕触发多条规则时关联去重', () => {
    // a、b 同轨重叠且 startMs 差 < 500
    const risks = analyzeSubtitles([sub('a', 'A', 0, 2000), sub('b', 'A', 100, 2100)]);
    const a = risks.find((r) => r.id === 'a')!;
    expect(a.reasons).toEqual(['重叠', '换屏过密']);
    expect(a.relatedIds).toEqual(['b']);
  });

  it('关联 id 去重升序', () => {
    // 全体排序 a(0) c(100) b(200)：c 与 a、b 均过密
    const risks = analyzeSubtitles([
      sub('b', 'A', 200, 1400),
      sub('a', 'A', 0, 1200),
      sub('c', 'B', 100, 1300),
    ]);
    const c = risks.find((r) => r.id === 'c')!;
    expect(c.reasons).toEqual(['换屏过密']);
    expect(c.relatedIds).toEqual(['a', 'b']);
  });

  it('涉及时间取自身及关联字幕 startMs 的最小值', () => {
    const risks = analyzeSubtitles([
      sub('early', 'A', 1000, 9000),
      sub('late', 'A', 8000, 9500),
    ]);
    expect(risks.find((r) => r.id === 'late')!.timeMs).toBe(1000);
    expect(risks.find((r) => r.id === 'early')!.timeMs).toBe(1000);
  });

  it('条目按涉及时间升序、同时间按 id 升序', () => {
    // q0 阅读过快（5 字符 → 1700 > 100）；b 与 a 重叠，a 的涉及时间被 b 拉早到 5000
    const risks = analyzeSubtitles([
      sub('q0', 'B', 0, 100, '一二三四五'),
      sub('b', 'A', 5000, 6200),
      sub('a', 'A', 5500, 6700),
    ]);
    expect(risks.map((r) => r.id)).toEqual(['q0', 'a', 'b']);
    expect(risks[1].timeMs).toBe(5000);
    expect(risks[2].timeMs).toBe(5000);
  });
});

describe('compareSubtitles / formatMs', () => {
  it('按 startMs、endMs、id 升序', () => {
    const sorted = [
      sub('c', 'A', 0, 100),
      sub('b', 'A', 0, 100),
      sub('a', 'A', 0, 50),
      sub('d', 'A', 1, 2),
    ].sort(compareSubtitles);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('格式化时间', () => {
    expect(formatMs(0)).toBe('00:00:00.000');
    expect(formatMs(3661234)).toBe('01:01:01.234');
    expect(formatMs(MAX_END_MS)).toBe('04:00:00.000');
  });
});
