import { describe, expect, it } from 'vitest';
import { MAX_END_MS, shiftTrack } from '../../src/subtitles';
import type { Subtitle } from '../../src/types';

const sub = (
  id: string,
  track: 'A' | 'B',
  startMs: number,
  endMs: number,
  text = `${id}-词`,
): Subtitle => ({ id, track, startMs, endMs, text });

describe('shiftTrack：仅目标轨偏移', () => {
  it('只调整目标轨的开始与结束时间，另一轨原样保留', () => {
    const input = [
      sub('a1', 'A', 1000, 2000),
      sub('b1', 'B', 3000, 4000),
      sub('a2', 'A', 5000, 6000),
    ];
    const r = shiftTrack(input, 'A', 500);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtitles).toEqual([
      { id: 'a1', track: 'A', startMs: 1500, endMs: 2500, text: 'a1-词' },
      { id: 'b1', track: 'B', startMs: 3000, endMs: 4000, text: 'b1-词' },
      { id: 'a2', track: 'A', startMs: 5500, endMs: 6500, text: 'a2-词' },
    ]);
  });

  it('负偏移整体前移，时长不变', () => {
    const input = [sub('a1', 'A', 2000, 3200), sub('b1', 'B', 0, 1000)];
    const r = shiftTrack(input, 'A', -700);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a1 = r.subtitles.find((s) => s.id === 'a1')!;
    expect([a1.startMs, a1.endMs]).toEqual([1300, 2500]);
    expect(a1.endMs - a1.startMs).toBe(1200);
    // B 轨对象引用保持不变
    expect(r.subtitles.find((s) => s.id === 'b1')).toBe(input[1]);
  });

  it('目标轨候选为新对象，id、track、text 不发生变化', () => {
    const input = [sub('a1', 'A', 1000, 2000, '原词')];
    const r = shiftTrack(input, 'A', 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtitles[0]).not.toBe(input[0]);
    expect(input[0].startMs).toBe(1000);
    expect(input[0].endMs).toBe(2000);
    expect(r.subtitles[0]).toMatchObject({
      id: 'a1',
      track: 'A',
      text: '原词',
      startMs: 1100,
      endMs: 2100,
    });
  });

  it('结果保持原数组顺序', () => {
    const input = [
      sub('late', 'A', 9000, 9500),
      sub('early', 'A', 1000, 1500),
      sub('b', 'B', 2000, 2500),
    ];
    const r = shiftTrack(input, 'A', 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtitles.map((s) => s.id)).toEqual(['late', 'early', 'b']);
  });

  it('实际发生调整时标记 changed，且结果为全新候选集合', () => {
    const input = [sub('a1', 'A', 1000, 2000)];
    const r = shiftTrack(input, 'A', 100);
    expect(r).toMatchObject({ ok: true, changed: true });
  });

  it('空文件或目标轨无字幕时为空操作（changed: false），不记为成功调整', () => {
    expect(shiftTrack([], 'A', 1000)).toEqual({
      ok: true,
      changed: false,
      subtitles: [],
    });
    const input = [sub('b1', 'B', 100, 200)];
    const r = shiftTrack(input, 'A', -50);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.changed).toBe(false);
      // 原数组原样返回，不产生任何新对象
      expect(r.subtitles).toBe(input);
    }
  });
});

describe('shiftTrack：边界值可接受', () => {
  it('负偏移恰好落到零点（nextStartMs === 0）可接受', () => {
    const r = shiftTrack([sub('a1', 'A', 100, 2000)], 'A', -100);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subtitles[0].startMs).toBe(0);
      expect(r.subtitles[0].endMs).toBe(1900);
    }
  });

  it('正偏移恰好落到四小时上限（nextEndMs === 14400000）可接受', () => {
    const r = shiftTrack(
      [sub('a1', 'A', MAX_END_MS - 500, MAX_END_MS - 100)],
      'A',
      100,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subtitles[0].startMs).toBe(MAX_END_MS - 400);
      expect(r.subtitles[0].endMs).toBe(MAX_END_MS);
    }
  });

  it('零点处字幕正偏移、上限处字幕负偏移均可接受', () => {
    expect(shiftTrack([sub('lo', 'A', 0, 1000)], 'A', 1).ok).toBe(true);
    expect(
      shiftTrack([sub('hi', 'A', MAX_END_MS - 1000, MAX_END_MS)], 'A', -1).ok,
    ).toBe(true);
    // 上限处字幕再正移 1ms 即拒绝
    const over = shiftTrack(
      [sub('hi', 'A', MAX_END_MS - 1000, MAX_END_MS)],
      'A',
      1,
    );
    expect(over.ok).toBe(false);
  });
});

describe('shiftTrack：越界原子拒绝', () => {
  it('nextStartMs 为 -1 时整次拒绝（below-zero）', () => {
    const input = [sub('a1', 'A', 100, 2000)];
    const r = shiftTrack(input, 'A', -101);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation).toEqual({
        id: 'a1',
        nextStartMs: -1,
        nextEndMs: 1899,
        kind: 'below-zero',
      });
    }
  });

  it('nextEndMs 超过上限 1ms 时整次拒绝（above-limit）', () => {
    const input = [sub('a1', 'A', MAX_END_MS - 1000, MAX_END_MS - 1)];
    const r = shiftTrack(input, 'A', 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation.kind).toBe('above-limit');
      expect(r.violation.id).toBe('a1');
      expect(r.violation.nextEndMs).toBe(MAX_END_MS + 1);
    }
  });

  it('按统一排序（startMs、endMs、id）报告首个越界字幕', () => {
    // 正偏移：x 不越界；排序后 y 先于 z 越界，应报告 y
    const input = [
      sub('z', 'A', MAX_END_MS - 20, MAX_END_MS - 10),
      sub('x', 'A', 0, 1000),
      sub('y', 'A', MAX_END_MS - 90, MAX_END_MS - 30),
    ];
    const r = shiftTrack(input, 'A', 50);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation.id).toBe('y');
      expect(r.violation.kind).toBe('above-limit');
      expect(r.violation.nextEndMs).toBe(MAX_END_MS + 20);
    }
  });

  it('另一轨越界不影响本轨调整', () => {
    const input = [
      sub('a1', 'A', 100, 2000),
      sub('b1', 'B', MAX_END_MS - 100, MAX_END_MS),
    ];
    const r = shiftTrack(input, 'A', 500);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subtitles.find((s) => s.id === 'a1')!.startMs).toBe(600);
      expect(r.subtitles.find((s) => s.id === 'b1')).toBe(input[1]);
    }
  });

  it('拒绝时不修改任何原对象（原子性）', () => {
    const input = [
      sub('a1', 'A', 100, 2000),
      sub('a2', 'A', 3000, 4000),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    const r = shiftTrack(input, 'A', -101);
    expect(r.ok).toBe(false);
    expect(input).toEqual(snapshot);
    expect(input[0].startMs).toBe(100);
  });
});

describe('shiftTrack：非法偏移量', () => {
  it('零与非整数偏移抛出异常', () => {
    const input = [sub('a1', 'A', 100, 2000)];
    expect(() => shiftTrack(input, 'A', 0)).toThrow();
    expect(() => shiftTrack(input, 'A', 0.5)).toThrow();
    expect(() => shiftTrack(input, 'A', Number.NaN)).toThrow();
  });
});
