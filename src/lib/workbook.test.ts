import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { loadWorkbook, saveWorkbook } from './workbook'

describe('workbook', () => {
  it('读取并写回第一张工作表的数据、样式、行高、列宽，同时保留其他工作表', async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet('站点')
    main.columns = [{ header: '公益站', key: 'name', width: 28 }, { header: '状态', key: 'status', width: 14 }]
    main.addRow({ name: '示例站', status: '有效' })
    main.getCell('A2').font = { bold: true, color: { argb: 'FFFF0000' } }
    main.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    main.getRow(2).height = 32
    source.addWorksheet('说明').getCell('A1').value = '保留内容'
    const original = await source.xlsx.writeBuffer()

    const document = await loadWorkbook(original)
    expect(document.rows).toEqual([{ name: '示例站', status: '有效', uid: 'row-1' }])
    expect(document.columns[0].width).toBe(28)
    expect(document.rows[0].uid).toBeTruthy()
    const nameStyle = Object.values(document.styles).find((style) => style.font?.bold)
    expect(nameStyle?.font?.bold).toBe(true)
    expect(nameStyle?.font?.color).toBe('#FF0000')
    expect(document.rowHeights[2]).toBe(32)

    document.rows[0].status = '失效'
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    expect(reopened.getWorksheet('站点')?.getCell('B2').value).toBe('失效')
    expect(reopened.getWorksheet('站点')?.getCell('A2').font.bold).toBe(true)
    expect(reopened.getWorksheet('说明')?.getCell('A1').value).toBe('保留内容')
  })

  it('清除样式后写回不会残留旧字体、填充和对齐', async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet('站点')
    main.columns = [{ header: '公益站', key: 'name', width: 20 }]
    main.addRow({ name: '示例站' })
    main.getCell('A2').font = { bold: true, color: { argb: 'FFFF0000' } }
    main.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    main.getCell('A2').alignment = { horizontal: 'center', wrapText: true }

    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    document.styles = {}
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    const cell = reopened.getWorksheet('站点')?.getCell('A2')
    expect(cell?.font.bold).not.toBe(true)
    expect(cell?.font.color?.argb).not.toBe('FFFF0000')
    const fill = cell?.fill as { fgColor?: { argb?: string } } | undefined
    expect(fill?.fgColor?.argb).not.toBe('FFFFFF00')
    expect(cell?.alignment?.horizontal).not.toBe('center')
    expect(cell?.alignment?.wrapText).not.toBe(true)
  })

  it('删除末尾行后写回不会重新加载空行', async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet('站点')
    main.columns = [{ header: '公益站', key: 'name' }]
    main.addRow({ name: '第一行' })
    main.addRow({ name: '第二行' })
    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    document.rows.splice(1, 1)
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    const rows: string[] = []
    reopened.getWorksheet('站点')?.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(String(row.getCell(1).value ?? ''))
    })
    expect(rows).toEqual(['第一行'])
  })

  it('损坏的工作簿给出可识别错误', async () => {
    await expect(loadWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow('XLSX')
  })
})
