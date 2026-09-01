import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { cellLayoutKey, columnLayoutKey } from "./cellLayout"
import { loadWorkbook, saveWorkbook } from "./workbook"

describe("workbook", () => {
  it("reads and writes the first worksheet while preserving styles, sizes, and other sheets", async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet("main")
    main.columns = [{ header: "name", key: "name", width: 28 }, { header: "status", key: "status", width: 14 }]
    main.addRow({ name: "demo", status: "valid" })
    main.getCell("A2").font = { bold: true, color: { argb: "FFFF0000" } }
    main.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }
    main.getRow(2).height = 32
    source.addWorksheet("extra").getCell("A1").value = "keep me"
    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    expect(document.rows).toEqual([{ name: "demo", status: "valid", uid: "row-1" }])
    expect(document.columns[0].width).toBe(28)
    expect(document.styles["row-1|name"].font?.bold).toBe(true)
    expect(document.styles["row-1|name"].font?.color).toBe("#FF0000")
    expect(document.rowHeights[2]).toBe(32)
    document.rows[0].status = "invalid"
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    expect(reopened.getWorksheet("main")?.getCell("B2").value).toBe("invalid")
    expect(reopened.getWorksheet("main")?.getCell("A2").font.bold).toBe(true)
    expect(reopened.getWorksheet("extra")?.getCell("A1").value).toBe("keep me")
  })

  it("reads and writes the hidden layout worksheet", async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet("main")
    main.columns = [{ header: "name", key: "name" }, { header: "url", key: "url" }]
    main.addRow({ name: "demo", url: "https://example.com" })
    main.getCell("A2").font = { bold: true, color: { argb: "FFFF0000" } }
    source.addWorksheet("extra").getCell("A1").value = "keep me"
    const layout = source.addWorksheet("__newAPIshare_layout")
    layout.state = "hidden"
    layout.addRow(["version", "scope", "uid", "field", "direction", "textAlign", "buttonAlign", "buttonFlow", "buttonCount", "gap"])
    layout.addRow([1, "column", "", "url", "row", "center", "right", "column", 2, 6])
    layout.addRow([1, "cell", "row-1", "url", "column", "center", "left", "row", 3, 8])
    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    expect(document.layouts[columnLayoutKey("url")]).toEqual({ direction: "row", textAlign: "center", buttonGroup: { align: "right", flow: "column", count: 2, gap: 6 } })
    expect(document.layouts[cellLayoutKey("row-1", "url")]).toEqual({ direction: "column", textAlign: "center", buttonGroup: { align: "left", flow: "row", count: 3, gap: 8 } })
    document.layouts[columnLayoutKey("url")] = { direction: "column", textAlign: "center", buttonGroup: { align: "center", flow: "row", count: 1, gap: 8 } }
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    expect(reopened.getWorksheet("__newAPIshare_layout")?.state).toBe("hidden")
    expect(reopened.getWorksheet("__newAPIshare_layout")?.getCell("H2").value).toBe("row")
    expect(reopened.getWorksheet("__newAPIshare_layout")?.getCell("I2").value).toBe(1)
    expect(reopened.getWorksheet("extra")?.getCell("A1").value).toBe("keep me")
  })

  it("reads and writes main worksheet merge ranges without changing other sheets", async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet("main")
    main.addRow(["name", "status", "url"])
    main.addRow(["demo", "ok", "https://example.com"])
    main.mergeCells("B2:D2")
    source.addWorksheet("extra").getCell("A1").value = "keep me"
    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    expect(document.merges).toEqual(["B2:D2"])
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    expect(Object.keys(((reopened.getWorksheet("main") as any)?._merges) ?? {})).toContain("B2")
    expect(reopened.getWorksheet("main")?.getCell("A2").value).toBe("demo")
    expect(reopened.getWorksheet("extra")?.getCell("A1").value).toBe("keep me")
  })

  it("clears old cell styles when style metadata is empty", async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet("main")
    main.columns = [{ header: "name", key: "name", width: 20 }]
    main.addRow({ name: "demo" })
    main.getCell("A2").font = { bold: true, color: { argb: "FFFF0000" } }
    main.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }
    main.getCell("A2").alignment = { horizontal: "center", wrapText: true }
    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    document.styles = {}
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    const cell = reopened.getWorksheet("main")?.getCell("A2")
    expect(cell?.font.bold).not.toBe(true)
    expect(cell?.font.color?.argb).not.toBe("FFFF0000")
    expect((cell?.fill as { fgColor?: { argb?: string } }).fgColor?.argb).not.toBe("FFFFFF00")
    expect(cell?.alignment?.horizontal).not.toBe("center")
    expect(cell?.alignment?.wrapText).not.toBe(true)
  })

  it("does not reload a deleted trailing row", async () => {
    const source = new ExcelJS.Workbook()
    const main = source.addWorksheet("main")
    main.columns = [{ header: "name", key: "name" }]
    main.addRow({ name: "first" })
    main.addRow({ name: "second" })
    const document = await loadWorkbook(await source.xlsx.writeBuffer())
    document.rows.splice(1, 1)
    const output = await saveWorkbook(document)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(output)
    const rows: string[] = []
    reopened.getWorksheet("main")?.eachRow((row, rowNumber) => { if (rowNumber > 1) rows.push(String(row.getCell(1).value ?? "")) })
    expect(rows).toEqual(["first"])
  })

  it("reports a recognizable error for a damaged workbook", async () => {
    await expect(loadWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow("XLSX")
  })
})
