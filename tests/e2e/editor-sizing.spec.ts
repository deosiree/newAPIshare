import { expect, test } from '@playwright/test'

const editKey = 'cbe72d15-48f1-4ef1-a214-6283d2d140be'

async function openEdit(page: import('@playwright/test').Page) {
  await page.goto('/edit?k=' + editKey)
  await expect(page.locator('.ag-root-wrapper')).toBeVisible()
  await expect(page.locator('.ag-row').first()).toBeVisible()
}

test.describe('编辑器尺寸与格式操作', () => {
  test('行号底部手柄可以拖拽调整单行高度', async ({ page }) => {
    await openEdit(page)
    const row = page.locator('.ag-row').first()
    const handle = page.locator('.row-resize-handle').first()
    await expect(handle).toBeVisible()
    const before = await row.boundingBox()
    const handleBox = await handle.boundingBox()
    expect(before?.height).toBeTruthy()
    expect(handleBox).not.toBeNull()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2 + 40)
    await page.mouse.up()
    await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThan((before?.height ?? 0) + 20)
  })

  test('列头右侧手柄可以拖拽调整列宽', async ({ page }) => {
    await openEdit(page)
    const header = page.locator('.ag-header-cell[col-id= name]')
    const resizeHandle = header.locator('.ag-header-cell-resize').first()
    await expect(resizeHandle).toBeVisible()
    const before = await header.boundingBox()
    const handleBox = await resizeHandle.boundingBox()
    expect(before?.width).toBeTruthy()
    expect(handleBox).not.toBeNull()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 60, handleBox!.y + handleBox!.height / 2)
    await page.mouse.up()
    await expect.poll(async () => (await header.boundingBox())?.width ?? 0).toBeGreaterThan((before?.width ?? 0) + 30)
  })

  test('格式面板修改背景颜色后单元格即时显示填充色', async ({ page }) => {
    await openEdit(page)
    const cell = page.locator('.ag-row').first().locator('.ag-cell[col-id=status]')
    await cell.click()
    await page.getByRole('button', { name: /格式面板/ }).click()
    const fill = page.locator('.format-panel input[type=color]').nth(1)
    await fill.fill('#ff00aa')
    await expect.poll(async () => cell.evaluate((element) => {
      const inline = (element as HTMLElement).style.backgroundColor
      const computed = getComputedStyle(element).backgroundColor
      return inline || computed
    })).toMatch(/rgb\(255, 0, 170\)|#ff00aa/i)
  })


  test("最适合的行高会考虑按钮高度并保持按钮可见", async ({ page }) => {
    await openEdit(page)
    const row = page.locator(".ag-row").first()
    const buttonCell = row.locator(".ag-cell[col-id=name]")
    await expect(buttonCell.locator(".mini").first()).toBeVisible()
    const before = await row.boundingBox()
    expect(before?.height).toBeTruthy()
    await page.locator(".drop").filter({ hasText: "最适合的行高" }).locator("summary").click()
    await page.getByRole("button", { name: "最适合的行高", exact: true }).click()
    await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThan((before?.height ?? 0) + 10)
    await expect(buttonCell.locator(".mini").first()).toBeVisible()
  })

})
