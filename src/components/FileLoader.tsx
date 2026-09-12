interface Props {
  onFile: (file: File) => void;
}

export default function FileLoader({ onFile }: Props) {
  return (
    <input
      type="file"
      accept="application/json,.json"
      data-testid="file-input"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          onFile(file);
        }
        // 允许重复选择同一文件
        e.target.value = '';
      }}
    />
  );
}
