import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_END_MS, formatMs } from '../subtitles';
import type { RiskEntry, Subtitle } from '../types';

interface Props {
  subtitles: Subtitle[];
  risks: RiskEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TOTAL_S = MAX_END_MS / 1000;
const ZOOMS = [0.5, 1, 2, 5, 10];

export default function Timeline({ subtitles, risks, selectedId, onSelect }: Props) {
  const [pxPerSec, setPxPerSec] = useState(2);
  const containerRef = useRef<HTMLDivElement>(null);

  // 高亮集合：选中条目自身 + 全部关联字幕
  const highlighted = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) {
      set.add(selectedId);
      const entry = risks.find((r) => r.id === selectedId);
      entry?.relatedIds.forEach((id) => set.add(id));
    }
    return set;
  }, [selectedId, risks]);

  // 点击条目后定位到自身块
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-sub-id="${CSS.escape(selectedId)}"]`,
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedId, pxPerSec]);

  const width = TOTAL_S * pxPerSec;
  const tickStep = pxPerSec >= 5 ? 300 : 1800;
  const ticks: number[] = [];
  for (let t = 0; t <= TOTAL_S; t += tickStep) {
    ticks.push(t);
  }

  const renderBlock = (s: Subtitle) => (
    <div
      key={s.id}
      data-sub-id={s.id}
      className={[
        'block',
        `track-${s.track.toLowerCase()}`,
        highlighted.has(s.id) ? 'highlighted' : '',
        s.id === selectedId ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: (s.startMs / 1000) * pxPerSec,
        width: Math.max(((s.endMs - s.startMs) / 1000) * pxPerSec, 2),
      }}
      title={`${s.id} [${formatMs(s.startMs)} → ${formatMs(s.endMs)}] ${s.text}`}
      onClick={() => onSelect(s.id)}
    >
      {s.id}
    </div>
  );

  return (
    <div className="timeline-wrapper">
      <div className="zoom">
        缩放：
        {ZOOMS.map((z) => (
          <button
            key={z}
            type="button"
            className={z === pxPerSec ? 'active' : ''}
            onClick={() => setPxPerSec(z)}
          >
            {z}x
          </button>
        ))}
      </div>
      <div className="timeline" ref={containerRef} data-testid="timeline">
        <div className="timeline-inner" style={{ width }}>
          <div className="axis">
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: t * pxPerSec }}>
                {formatMs(t * 1000).slice(0, 5)}
              </span>
            ))}
          </div>
          {(['A', 'B'] as const).map((track) => (
            <div key={track} className="lane" data-testid={`lane-${track}`}>
              <span className="lane-label">{track}</span>
              {subtitles.filter((s) => s.track === track).map(renderBlock)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
