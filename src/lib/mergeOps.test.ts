import { describe, expect, it } from 'vitest'
import { buildMergeRange, hasMergeOverlap, normalizeMergeRanges, parseMergeRange, removeMergeRange, isValidMergeRange, resolveMergeColumnIndexes } from './mergeOps'

describe('mergeOps', () => {
  it('only accepts horizontal same-row ranges', () => {
    expect(parseMergeRange('B2:D2')).toEqual({ startRow: 2, startColumn: 2, endRow: 2, endColumn: 4 })
    expect(isValidMergeRange('B2:D2')).toBe(true)
    expect(isValidMergeRange('B2:B2')).toBe(false)
    expect(isValidMergeRange('B2:D3')).toBe(false)
  })

  it('rejects overlapping merge ranges', () => {
    expect(hasMergeOverlap(['B2:D2'], 'C2:E2')).toBe(true)
    expect(hasMergeOverlap(['B2:D2'], 'E2:F2')).toBe(false)
  })

  it('supports AG Grid ranges that only expose start and end columns', () => {
    expect(resolveMergeColumnIndexes([], ["name", "status", "url"], "name", "url")).toEqual([0, 1, 2])
    expect(resolveMergeColumnIndexes(["name", "url"], ["name", "status", "url"])).toEqual([0, 2])
  })

  it('normalizes, deduplicates and removes merge ranges', () => {
    expect(buildMergeRange({ startRow: 1, startColumn: 2, endRow: 1, endColumn: 4 })).toBe('B2:D2')
    expect(normalizeMergeRanges(['d2:b2', 'B2:D2', 'A1:C2', 'bad'])).toEqual(['B2:D2'])
    expect(removeMergeRange(['B2:D2', 'A2:C2'], 'b2:d2')).toEqual(['A2:C2'])
  })
})
