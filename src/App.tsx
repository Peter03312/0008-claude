import { useCallback, useState } from 'react';
import FileLoader from './components/FileLoader';
import RiskList from './components/RiskList';
import Timeline from './components/Timeline';
import { analyzeSubtitles, validateSubtitles } from './subtitles';
import type { RiskEntry, Subtitle } from './types';

export default function App() {
  const [subtitles, setSubtitles] = useState<Subtitle[] | null>(null);
  const [risks, setRisks] = useState<RiskEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setSelectedId(null);
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
