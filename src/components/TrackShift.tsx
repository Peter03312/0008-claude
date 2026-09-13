import { useState } from 'react';
import type { Track } from '../types';

interface Props {
  /** 是否存在最近一次成功调整的撤销快照 */
  canUndo: boolean;
  /** 上次失败原因（输入非法或整次越界拒绝） */
  error: string | null;
  /** 各轨当前字幕条数，用于提示空轨 */
  trackCounts: Record<Track, number>;
  onShift: (track: Track, offsetInput: string) => void;
  onUndo: () => void;
}

export default function TrackShift({
  canUndo,
  error,
  trackCounts,
  onShift,
  onUndo,
}: Props) {
  const [track, setTrack] = useState<Track>('A');
  const [offset, setOffset] = useState('');
  const trackEmpty = trackCounts[track] === 0;

  return (
    <form
      className="track-shift"
      data-testid="track-shift"
      onSubmit={(e) => {
        e.preventDefault();
        onShift(track, offset);
      }}
    >
      <span className="shift-label">整轨偏移</span>
      <div className="shift-tracks" role="group" aria-label="选择轨道">
        {(['A', 'B'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={track === t ? 'active' : ''}
            data-testid={`shift-track-${t}`}
            data-empty={trackCounts[t] === 0}
            aria-pressed={track === t}
            onClick={() => setTrack(t)}
          >
            {t} 轨（{trackCounts[t]}）
          </button>
        ))}
      </div>
      {trackEmpty && (
        <span
          className="shift-note"
          role="status"
          data-testid="shift-empty-note"
        >
          {track} 轨当前无字幕，执行偏移不会改变任何时间，也不会记录撤销。
        </span>
      )}
      <input
        className="shift-offset"
        data-testid="shift-offset-input"
        type="number"
        step="1"
        inputMode="numeric"
        placeholder="非零整数毫秒，如 -500 或 1000"
        aria-label="偏移量（毫秒，非零整数）"
        value={offset}
        onChange={(e) => setOffset(e.target.value)}
      />
      <button
        type="submit"
        className="shift-apply"
        data-testid="shift-apply"
      >
        执行偏移
      </button>
      <button
        type="button"
        className="shift-undo"
        data-testid="shift-undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        撤销上一次调整
      </button>
      {error && (
        <div className="shift-error" role="alert" data-testid="shift-error">
          {error}
        </div>
      )}
    </form>
  );
}
