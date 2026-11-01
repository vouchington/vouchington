import { existsSync, mkdtempSync } from 'node:fs'
import { expect, vi } from 'vitest'

/** Diff directories recorded by the test's wrapped `mkdtempSync`. */
export function createdBlocklistDiffDirectories(): string[] {
  const created: string[] = []
  for (const result of vi.mocked(mkdtempSync).mock.results) {
    if (result.type !== 'return' || typeof result.value !== 'string') continue
    if (!result.value.includes('blocklist-diff-')) continue
    created.push(result.value)
  }
  return created
}

/** The case created `count` blocklist diff directories and removed each one. */
export function expectRemovedBlocklistDiffDirectories(count: number): void {
  const created = createdBlocklistDiffDirectories()
  expect(created).toHaveLength(count)
  expect(created.filter(path => existsSync(path))).toEqual([])
}
