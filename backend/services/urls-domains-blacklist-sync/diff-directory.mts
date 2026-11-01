import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Pid keeps an interrupted run's directory distinct from another worker's live diff.
const BLOCKLIST_DIFF_DIRECTORY_PREFIX = `blocklist-diff-${process.pid}-`

export function createBlocklistDiffDirectory(): string {
  return mkdtempSync(join(tmpdir(), BLOCKLIST_DIFF_DIRECTORY_PREFIX))
}

export function removeBlocklistDiffDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
}
