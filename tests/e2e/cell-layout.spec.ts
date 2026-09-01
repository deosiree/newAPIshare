import { expect, test } from '@playwright/test'

const editKey = 'cbe72d15-48f1-4ef1-a214-6283d2d140be'

async function openEdit(page: import('@playwright/test').Page) {
  await page.goto('/edit?k=' + editKey)
  await expect(page.locator('.ag-root-wrapper')).toBeVisible()
  await expect(page.locator('.ag-row').first()).toBeVisible()
}

test.describe('单元格双层布局编辑器', () => {
  test('有按钮单元格显示布局入口，普通文本单元格不显示', async ({ page }) => {
    await openEdit(page)
    await page.locator('.ag-row').first().locator('.ag-cell[col-id="name"]').click()
    await page.getByRole('button', { name: /格式面板/ }).click()
    await expect(page.getByRole('region', { name: '文字与按钮布局' })).toBeVisible()

    await page.getByRole('button', { name: /关闭/ }).last().click()
    await page.locator('.ag-row').first().locator('.ag-cell[col-id="status"]').click()
    await page.getByRole('button', { name: /格式面板/ }).click()
    await expect(page.getByRole('region', { name: '文字与按钮布局' })).toHaveCount(0)
  })

  test('拖拽区域可以切换上下/左右布局，并支持对齐、每行/每列和 1~100', async ({ page }) => {
    await openEdit(page)
    await page.locator('.ag-row').first().locator('.ag-cell[col-id="name"]').click()
    await page.getByRole('button', { name: /格式面板/ }).click()
    const editor = page.getByRole('region', { name: '文字与按钮布局' })
    await editor.getByTestId('layout-button-zone').dragTo(editor.getByTestId('layout-drop-right'))
    await expect(editor.locator('.layout-preview.cell-content-row')).toBeVisible()
    await editor.getByTestId('layout-button-zone').dragTo(editor.getByTestId('layout-drop-below'))
    await expect(editor.locator('.layout-preview.cell-content-column')).toBeVisible()

    await editor.getByLabel('按钮组对齐').selectOption('right')
    await editor.getByTestId('layout-flow').selectOption('row')
    const count = editor.getByTestId('layout-count')
    await expect(count).toHaveValue('1')
    await count.fill('3')
    await expect(count).toHaveValue('3')
    await count.fill('101')
    await expect(count).toHaveValue('100')
    await editor.getByTestId('layout-flow').selectOption('column')
    await expect(editor.locator('.layout-preview-buttons').locator('.mini')).toHaveCount(1)
  })

  test('保存按钮会发送包含布局的完整编辑快照', async ({ page }) => {
    await page.route('http://localhost:8788/save', async (route) => {
      const body = route.request().postDataJSON()
      expect(body.extras.layouts).toBeDefined()
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, pushed: false, msg: 'test' }) })
    })
    await openEdit(page)
    await page.locator('.ag-row').first().locator('.ag-cell[col-id="name"]').click()
    await page.getByRole('button', { name: /格式面板/ }).click()
    const editor = page.getByRole('region', { name: '文字与按钮布局' })
    await editor.getByTestId('layout-count').fill('2')
    await page.getByRole('button', { name: /保存/ }).first().click()
    await expect(page.getByText(/已保存到本地/)).toBeVisible()
  })
})
