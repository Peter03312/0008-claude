import { expect, test, type Page } from '@playwright/test';

// a1 与 a2 同轨重叠（1500 < 2000）；a2 与 b1 换屏过密（1700 - 1500 = 200 < 500）
const valid = [
  { id: 'a1', track: 'A', startMs: 0, endMs: 2000, text: '你好世界' },
  { id: 'a2', track: 'A', startMs: 1500, endMs: 4000, text: '测试字幕' },
  { id: 'b1', track: 'B', startMs: 1700, endMs: 5000, text: 'B轨字幕' },
];

// 第二项 id 重复，整份非法
const invalid = [
  { id: 'x1', track: 'A', startMs: 0, endMs: 2000, text: 'ok' },
  { id: 'x1', track: 'B', startMs: 3000, endMs: 5000, text: 'dup' },
];

async function upload(page: Page, data: unknown, name = 'subs.json') {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('非法文件拒绝整份并清除旧结果', async ({ page }) => {
  await upload(page, valid);
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
  await expect(page.locator('[data-sub-id]')).toHaveCount(3);
  await expect(page.getByTestId('risk-entry')).toHaveCount(3);

  await upload(page, invalid, 'bad.json');
  await expect(page.getByTestId('error')).toBeVisible();
  await expect(page.getByTestId('error')).toContainText('重复');
  // 旧结果已清除
  await expect(page.locator('[data-sub-id]')).toHaveCount(0);
  await expect(page.getByTestId('risk-entry')).toHaveCount(0);
  await expect(page.getByTestId('summary')).toHaveCount(0);
});

test('修正后重新导入恢复结果', async ({ page }) => {
  await upload(page, invalid, 'bad.json');
  await expect(page.getByTestId('error')).toBeVisible();
  await expect(page.locator('[data-sub-id]')).toHaveCount(0);

  await upload(page, valid, 'fixed.json');
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('summary')).toContainText('共 3 条字幕，3 个风险条目');
  await expect(page.locator('[data-sub-id]')).toHaveCount(3);
  await expect(page.getByTestId('risk-entry')).toHaveCount(3);
});

test('点击风险条目定位并高亮自身及全部关联块', async ({ page }) => {
  await upload(page, valid);
  // a2：重叠（关联 a1）+ 换屏过密（关联 b1）
  await page.locator('[data-risk-id="a2"]').click();
  await expect(page.locator('[data-sub-id="a2"]')).toHaveClass(/selected/);
  await expect(page.locator('.block.highlighted')).toHaveCount(3);
  await expect(page.locator('[data-sub-id="a1"]')).toHaveClass(/highlighted/);
  await expect(page.locator('[data-sub-id="b1"]')).toHaveClass(/highlighted/);
  // a1 只与 a2 关联
  await page.locator('[data-risk-id="a1"]').click();
  await expect(page.locator('.block.highlighted')).toHaveCount(2);
  await expect(page.locator('[data-sub-id="b1"]')).not.toHaveClass(/highlighted/);
});
