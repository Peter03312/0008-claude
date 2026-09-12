import { expect, test, type Page } from '@playwright/test';

// a1 与 a2 同轨重叠（1500 < 2000）；a2 与 b1 换屏过密（1700 - 1500 = 200 < 500）
const valid = [
  { id: 'a1', track: 'A', startMs: 0, endMs: 2000, text: '你好世界' },
  { id: 'a2', track: 'A', startMs: 1500, endMs: 4000, text: '测试字幕' },
  { id: 'b1', track: 'B', startMs: 1700, endMs: 5000, text: 'B轨字幕' },
];

async function upload(page: Page, data: unknown, name = 'subs.json') {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
}

async function applyShift(page: Page, track: 'A' | 'B', offset: string) {
  await page.getByTestId(`shift-track-${track}`).click();
  await page.getByTestId('shift-offset-input').fill(offset);
  await page.getByTestId('shift-apply').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('导入后调整 A 轨：风险与时间带刷新，撤销完整还原', async ({ page }) => {
  await upload(page, valid);
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
  await expect(page.getByTestId('risk-entry')).toHaveCount(3);
  // 初始无撤销快照
  await expect(page.getByTestId('shift-undo')).toBeDisabled();

  // 调整前先选中 a2：高亮 a1、a2、b1 三块
  await page.locator('[data-risk-id="a2"]').click();
  await expect(page.locator('.block.highlighted')).toHaveCount(3);

  // A 轨 +1000：a1[1000,3000]、a2[2500,5000]；重叠仍在，换屏过密（a2-b1 差 200）消失
  await applyShift(page, 'A', '1000');

  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，2 个风险条目');
  await expect(page.getByTestId('risk-entry')).toHaveCount(2);
  await expect(page.locator('[data-risk-id="a1"]')).toBeVisible();
  await expect(page.locator('[data-risk-id="a2"]')).toBeVisible();
  await expect(page.locator('[data-risk-id="b1"]')).toHaveCount(0);

  // 时间带：仅 A 轨移动，B 轨 b1 保持原样
  await expect(page.locator('[data-sub-id="a1"]')).toHaveAttribute(
    'title',
    /00:00:01\.000 → 00:00:03\.000/,
  );
  await expect(page.locator('[data-sub-id="a2"]')).toHaveAttribute(
    'title',
    /00:00:02\.500 → 00:00:05\.000/,
  );
  await expect(page.locator('[data-sub-id="b1"]')).toHaveAttribute(
    'title',
    /00:00:01\.700 → 00:00:05\.000/,
  );

  // id、track、text 不变
  await expect(page.locator('[data-sub-id="a1"]')).toHaveText('a1');

  // 定位保留：调整前选中 a2，调整后关联仅剩 a1，高亮收敛为两块
  await expect(page.locator('[data-sub-id="a2"]')).toHaveClass(/selected/);
  await expect(page.locator('.block.highlighted')).toHaveCount(2);
  await expect(page.getByTestId('shift-undo')).toBeEnabled();
  await expect(page.getByTestId('shift-error')).toHaveCount(0);

  // 撤销：字幕、风险顺序与选中关系全部还原
  await page.getByTestId('shift-undo').click();
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
  await expect(page.getByTestId('risk-entry')).toHaveCount(3);
  const ids = await page.locator('[data-testid="risk-entry"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-risk-id')),
  );
  expect(ids).toEqual(['a1', 'a2', 'b1']);
  await expect(page.locator('[data-sub-id="a1"]')).toHaveAttribute(
    'title',
    /00:00:00\.000 → 00:00:02\.000/,
  );
  await expect(page.locator('[data-sub-id="a2"]')).toHaveClass(/selected/);
  await expect(page.locator('.block.highlighted')).toHaveCount(3);
  await expect(page.getByTestId('shift-undo')).toBeDisabled();
});

test('选择 B 轨只移动 B 轨字幕', async ({ page }) => {
  await upload(page, valid);
  await applyShift(page, 'B', '1000');
  await expect(page.locator('[data-sub-id="b1"]')).toHaveAttribute(
    'title',
    /00:00:02\.700 → 00:00:06\.000/,
  );
  // A 轨时间不变
  await expect(page.locator('[data-sub-id="a1"]')).toHaveAttribute(
    'title',
    /00:00:00\.000 → 00:00:02\.000/,
  );
  // 起点间距全部拉开后，只剩 a1-a2 同轨重叠
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，2 个风险条目');
  await page.getByTestId('shift-undo').click();
  await expect(page.locator('[data-sub-id="b1"]')).toHaveAttribute(
    'title',
    /00:00:01\.700 → 00:00:05\.000/,
  );
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
});

test('越界整次拒绝：面板说明首个越界字幕，现有结果与选中不被污染', async ({
  page,
}) => {
  await upload(page, valid);
  // 先建立选中关系
  await page.locator('[data-risk-id="a2"]').click();
  await expect(page.locator('[data-sub-id="a2"]')).toHaveClass(/selected/);

  // a1.startMs = 0，前移 100ms 越过零点
  await applyShift(page, 'A', '-100');

  await expect(page.getByTestId('shift-error')).toBeVisible();
  await expect(page.getByTestId('shift-error')).toContainText('a1');
  await expect(page.getByTestId('shift-error')).toContainText('整次调整已拒绝');
  // 页面保留当前字幕、风险与高亮
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
  await expect(page.getByTestId('risk-entry')).toHaveCount(3);
  await expect(page.locator('[data-sub-id="a1"]')).toHaveAttribute(
    'title',
    /00:00:00\.000 → 00:00:02\.000/,
  );
  await expect(page.locator('.block.highlighted')).toHaveCount(3);
  await expect(page.locator('[data-sub-id="a2"]')).toHaveClass(/selected/);
  // 失败不产生撤销快照
  await expect(page.getByTestId('shift-undo')).toBeDisabled();

  // 非法输入（0、小数）同样拒绝且不污染
  await applyShift(page, 'A', '0');
  await expect(page.getByTestId('shift-error')).toContainText('非零整数');
  await expect(page.getByTestId('risk-entry')).toHaveCount(3);
  await applyShift(page, 'A', '1.5');
  await expect(page.getByTestId('shift-error')).toContainText('非零整数');
  await expect(page.locator('[data-sub-id="a1"]')).toHaveAttribute(
    'title',
    /00:00:00\.000 → 00:00:02\.000/,
  );

  // 失败后再执行合法调整仍可成功，错误清除
  await applyShift(page, 'A', '1000');
  await expect(page.getByTestId('shift-error')).toHaveCount(0);
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，2 个风险条目');
});

test('重新导入文件清空撤销快照：成功导入', async ({ page }) => {
  await upload(page, valid);
  await applyShift(page, 'A', '1000');
  await expect(page.getByTestId('shift-undo')).toBeEnabled();
  await expect(page.getByTestId('summary')).toContainText('2 个风险条目');

  await upload(page, valid, 'reimport.json');
  // 快照被清空，无法撤销回调整前
  await expect(page.getByTestId('shift-undo')).toBeDisabled();
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
});

test('重新导入非法文件清空撤销快照并按原行为清除结果', async ({ page }) => {
  await upload(page, valid);
  await applyShift(page, 'A', '1000');
  await expect(page.getByTestId('shift-undo')).toBeEnabled();

  const invalid = [
    { id: 'x1', track: 'A', startMs: 0, endMs: 2000, text: 'ok' },
    { id: 'x1', track: 'B', startMs: 3000, endMs: 5000, text: 'dup' },
  ];
  await upload(page, invalid, 'bad.json');
  await expect(page.getByTestId('error')).toContainText('重复');
  await expect(page.locator('[data-sub-id]')).toHaveCount(0);
  await expect(page.getByTestId('track-shift')).toHaveCount(0);
});
