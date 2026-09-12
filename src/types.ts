export type Track = 'A' | 'B';

export interface Subtitle {
  id: string;
  track: Track;
  startMs: number;
  endMs: number;
  text: string;
}

export const REASONS = ['阅读过快', '重叠', '换屏过密'] as const;
export type Reason = (typeof REASONS)[number];

export interface RiskEntry {
  /** 条目标识：字幕自身 id */
  id: string;
  /** 该字幕命中的全部原因，按固定顺序汇总 */
  reasons: Reason[];
  /** 与其成对触发规则的字幕 id，去重升序 */
  relatedIds: string[];
  /** 涉及时间：自身及全部关联字幕 startMs 的最小值 */
  timeMs: number;
}
