import { REASONS } from './types';
import type { Reason, RiskEntry, Subtitle } from './types';

/** 时间带上界：4 小时 */
export const MAX_END_MS = 14_400_000;
/** 最低显示时长基数（毫秒） */
export const MIN_BASE_MS = 800;
/** 每个字符附加的最低显示时长（毫秒） */
export const PER_CHAR_MS = 180;
/** 换屏过密阈值（毫秒）：相邻 startMs 差严格小于该值才记 */
export const DENSE_GAP_MS = 500;

/** 字符数：去除全部 Unicode 空白后按码点计数 */
export function countChars(text: string): number {
  return [...text.replace(/\p{White_Space}/gu, '')].length;
}

/** 最低显示时长：800 + 字符数 × 180 */
export function minDurationMs(text: string): number {
  return MIN_BASE_MS + countChars(text) * PER_CHAR_MS;
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 统一排序：startMs、endMs、id 升序 */
export function compareSubtitles(a: Subtitle, b: Subtitle): number {
  return a.startMs - b.startMs || a.endMs - b.endMs || compareIds(a.id, b.id);
}

export type ValidationResult =
  | { ok: true; subtitles: Subtitle[] }
  | { ok: false; error: string };

/**
 * 校验 JSON 数组。任一项非法即整份拒绝。
 * 每项须含：唯一字符串 id、track ∈ {A, B}、整数 startMs/endMs、
 * 非空 text，且 0 ≤ startMs < endMs ≤ 14400000。
 */
export function validateSubtitles(data: unknown): ValidationResult {
  if (!Array.isArray(data)) {
    return { ok: false, error: '文件内容必须是 JSON 数组' };
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < data.length; i++) {
    const item: unknown = data[i];
    const label = `第 ${i + 1} 项`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { ok: false, error: `${label}不是对象` };
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string') {
      return { ok: false, error: `${label}的 id 必须是字符串` };
    }
    if (seenIds.has(record.id)) {
      return { ok: false, error: `id "${record.id}" 重复` };
    }
    seenIds.add(record.id);
    if (record.track !== 'A' && record.track !== 'B') {
      return { ok: false, error: `${label}的 track 必须是 "A" 或 "B"` };
    }
    if (!Number.isInteger(record.startMs) || !Number.isInteger(record.endMs)) {
      return { ok: false, error: `${label}的 startMs 与 endMs 必须是整数` };
    }
    const startMs = record.startMs as number;
    const endMs = record.endMs as number;
    if (!(startMs >= 0 && startMs < endMs && endMs <= MAX_END_MS)) {
      return {
        ok: false,
        error: `${label}须满足 0 ≤ startMs < endMs ≤ ${MAX_END_MS}`,
      };
    }
    if (typeof record.text !== 'string' || record.text.length === 0) {
      return { ok: false, error: `${label}的 text 必须是非空字符串` };
    }
  }
  return { ok: true, subtitles: data as Subtitle[] };
}

/**
 * 规则校核：
 * 1. 阅读过快：实际时长 < 800 + 字符数 × 180；
 * 2. 重叠：同轨按统一排序后，相邻后项 startMs < 前项 endMs（相等不记）；
 * 3. 换屏过密：全体按统一排序后，相邻 startMs 差 < 500（等于 500 不记）。
 * 每个字幕至多一个条目，汇总全部原因。
 */
export function analyzeSubtitles(subtitles: Subtitle[]): RiskEntry[] {
  const reasonMap = new Map<string, Set<Reason>>();
  const relatedMap = new Map<string, Set<string>>();

  const flag = (id: string, reason: Reason, otherId?: string) => {
    let reasons = reasonMap.get(id);
    if (!reasons) {
      reasons = new Set();
      reasonMap.set(id, reasons);
    }
    reasons.add(reason);
    if (otherId !== undefined) {
      let related = relatedMap.get(id);
      if (!related) {
        related = new Set();
        relatedMap.set(id, related);
      }
      related.add(otherId);
    }
  };

  const flagPair = (a: Subtitle, b: Subtitle, reason: Reason) => {
    flag(a.id, reason, b.id);
    flag(b.id, reason, a.id);
  };

  // 阅读过快
  for (const s of subtitles) {
    if (s.endMs - s.startMs < minDurationMs(s.text)) {
      flag(s.id, '阅读过快');
    }
  }

  // 重叠：同轨相邻对
  for (const track of ['A', 'B'] as const) {
    const sorted = subtitles.filter((s) => s.track === track).sort(compareSubtitles);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMs < sorted[i - 1].endMs) {
        flagPair(sorted[i - 1], sorted[i], '重叠');
      }
    }
  }

  // 换屏过密：全体相邻对
  const all = [...subtitles].sort(compareSubtitles);
  for (let i = 1; i < all.length; i++) {
    if (all[i].startMs - all[i - 1].startMs < DENSE_GAP_MS) {
      flagPair(all[i - 1], all[i], '换屏过密');
    }
  }

  const byId = new Map(subtitles.map((s) => [s.id, s]));
  const entries: RiskEntry[] = [];
  for (const [id, reasons] of reasonMap) {
    const relatedIds = [...(relatedMap.get(id) ?? [])].sort(compareIds);
    const self = byId.get(id)!;
    const timeMs = relatedIds.reduce(
      (min, rid) => Math.min(min, byId.get(rid)!.startMs),
      self.startMs,
    );
    entries.push({
      id,
      reasons: REASONS.filter((r) => reasons.has(r)),
      relatedIds,
      timeMs,
    });
  }
  entries.sort((a, b) => a.timeMs - b.timeMs || compareIds(a.id, b.id));
  return entries;
}

/** 格式化为 HH:MM:SS.mmm */
export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const milli = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
}
