import { useCallback, useState } from 'react';
import FileLoader from './components/FileLoader';
import RiskList from './components/RiskList';
import Timeline from './components/Timeline';
import TrackShift from './components/TrackShift';
import {
  analyzeSubtitles,
  shiftTrack,
  validateSubtitles,
} from './subtitles';
import type { RiskEntry, Subtitle, Track } from './types';

/** 最近一次成功调整前的快照：字幕、风险顺序与选中关系 */
interface UndoSnapshot {
  subtitles: Subtitle[];
  risks: RiskEntry[];
  selectedId: string | null;
}

/** 解析非零整数毫秒输入 */
function parseOffset(input: string): number | null {
  const trimmed = input.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n === 0) return null;
  return n;
}

export default function App() {
  const [subtitles, setSubtitles] = useState<Subtitle[] | null>(null);
  const [risks, setRisks] = useState<RiskEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<UndoSnapshot | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setSelectedId(null);
    // 重新导入（无论成功或失败）都清空撤销快照与调整提示
    setSnapshot(null);
    setShiftError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      // 非法文件：拒绝整份并清除旧结果
      setSubtitles(null);
      setRisks([]);
      setError('文件不是合法的 JSON');
      return;
    }
    const result = validateSubtitles(parsed);
    if (!result.ok) {
      setSubtitles(null);
      setRisks([]);
      setError(result.error);
      return;
    }
    setSubtitles(result.subtitles);
    setRisks(analyzeSubtitles(result.subtitles));
    setError(null);
  }, []);

  const handleShift = useCallback(
    (track: Track, offsetInput: string) => {
      if (!subtitles) return;
      const offset = parseOffset(offsetInput);
      if (offset === null) {
        setShiftError('偏移量必须是非零整数毫秒（如 -500 或 1000）。');
        return;
      }
      const result = shiftTrack(subtitles, track, offset);
      if (!result.ok) {
        const v = result.violation;
        const where =
          v.kind === 'below-zero'
            ? `越过零点（${v.nextStartMs} < 0）`
            : `超过四小时上限（${v.nextEndMs} > 14400000）`;
        setShiftError(
          `整次调整已拒绝：首个越界字幕为 ${v.id}，调整后开始/结束时间将位于 0～14400000 毫秒之外，${where}；该轨时间未改动。`,
        );
        return;
      }
      // 成功：保存调整前快照，以候选集合替换当前数据，复用既有校核规则
      setSnapshot({ subtitles, risks, selectedId });
      setSubtitles(result.subtitles);
      setRisks(analyzeSubtitles(result.subtitles));
      // 当前定位仅在目标仍存在时保留
      if (selectedId && !result.subtitles.some((s) => s.id === selectedId)) {
        setSelectedId(null);
      }
      setShiftError(null);
    },
    [subtitles, risks, selectedId],
  );

  const handleUndo = useCallback(() => {
    if (!snapshot) return;
    // 恢复调整前的字幕、风险顺序和选中关系（单级撤销）
    setSubtitles(snapshot.subtitles);
    setRisks(snapshot.risks);
    setSelectedId(snapshot.selectedId);
    setShiftError(null);
    setSnapshot(null);
  }, [snapshot]);

  return (
    <div className="app">
      <header>
        <h1>字幕风险校核器</h1>
        <FileLoader onFile={handleFile} />
        {fileName && (
          <span className="file-name" data-testid="file-name">
            {fileName}
          </span>
        )}
      </header>
      {error && (
        <div className="error" role="alert" data-testid="error">
          导入失败：{error}
        </div>
      )}
      {subtitles && (
        <>
          <div className="summary" data-testid="summary">
            共 {subtitles.length} 条字幕，{risks.length} 个风险条目
          </div>
          <TrackShift
            canUndo={snapshot !== null}
            error={shiftError}
            onShift={handleShift}
            onUndo={handleUndo}
          />
          <RiskList risks={risks} selectedId={selectedId} onSelect={setSelectedId} />
          <Timeline
            subtitles={subtitles}
            risks={risks}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </>
      )}
      {!subtitles && !error && (
        <p className="hint" data-testid="hint">
          请选择本地 JSON 字幕文件（顶层为数组）。
        </p>
      )}
    </div>
  );
}
