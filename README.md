# 字幕风险校核器

歌剧排练临时改词后，字幕员在进控制台前对字幕文件做纯前端校核：阅读时间不足、同轨重叠、换屏过密。

## 输入格式

仅读取本地 JSON 文件（顶层为数组）。每项：

| 字段 | 要求 |
| --- | --- |
| `id` | 字符串，全文件唯一 |
| `track` | `"A"` 或 `"B"` |
| `startMs` / `endMs` | 整数，且 `0 ≤ startMs < endMs ≤ 14400000` |
| `text` | 非空字符串 |

任一项非法即拒绝整份文件，并清除旧结果。

## 校核规则

- **阅读过快**：字符数按去除全部 Unicode 空白后的码点计算；最低显示时长为
  `800 + 字符数 × 180` 毫秒，实际时长不足即记。
- **重叠**：同轨按 `startMs`、`endMs`、`id` 升序排列，相邻后项 `startMs` 小于前项
  `endMs` 时双方记（相等不记）。
- **换屏过密**：全体按同序排列，相邻项 `startMs` 差小于 500 毫秒时双方记
  （等于 500 不记）。

每个字幕至多生成一个风险条目，汇总其全部原因；关联字幕为与其成对触发规则的
字幕 id 去重升序集合；条目标识为自身 id；涉及时间取自身及全部关联字幕
`startMs` 的最小值；条目按涉及时间、条目标识升序展示。

页面以 A/B 双轨时间带展示，点击风险条目即定位并高亮自身及全部关联字幕块。

## 开发

```bash
npm install
npm run dev        # 本地开发服务器
npm run build      # 类型检查 + 产物构建
npm run preview    # 预览构建产物
```

## 测试

```bash
npm test           # Vitest：规则边界与排序
npx playwright install chromium   # 首次运行 e2e 前安装浏览器
npm run test:e2e   # Playwright：非法清除、修正重导、点击高亮
```

## Docker 运行

```bash
docker compose up --build        # 默认宿主端口 8080
WEB_PORT=9000 docker compose up  # 通过 WEB_PORT 覆盖宿主端口
```

容器内由 nginx 监听 80 端口，`WEB_PORT` 仅映射宿主端口。

## 示例

`examples/subtitles.json` 为可导入的示例文件（含各类风险）。
