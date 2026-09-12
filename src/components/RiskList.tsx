import { formatMs } from '../subtitles';
import type { RiskEntry } from '../types';

interface Props {
  risks: RiskEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function RiskList({ risks, selectedId, onSelect }: Props) {
  if (risks.length === 0) {
    return (
      <p className="no-risk" data-testid="no-risk">
        未发现风险。
      </p>
    );
  }
  return (
    <ul className="risk-list" data-testid="risk-list">
      {risks.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={`risk-entry${r.id === selectedId ? ' selected' : ''}`}
            data-testid="risk-entry"
            data-risk-id={r.id}
            onClick={() => onSelect(r.id)}
          >
            <span className="risk-id">{r.id}</span>
            <span className="risk-time">{formatMs(r.timeMs)}</span>
            <span className="risk-reasons">{r.reasons.join('、')}</span>
            {r.relatedIds.length > 0 && (
              <span className="risk-related">关联：{r.relatedIds.join(', ')}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
