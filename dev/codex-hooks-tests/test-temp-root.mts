import { mkdtempSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Captured at import time; codex hook tests do not mutate RUNNER_TEMP after import.
export const TEST_TMP_ROOT = process.env.RUNNER_TEMP || tmpdir()

export function makeTestTempDirSync(prefix: string): string {
  return mkdtempSync(join(TEST_TMP_ROOT, prefix))
}

export function makeTestTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(TEST_TMP_ROOT, prefix))
}

export async function withTestTempDir<T>(
  prefix: string,
  callback: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await makeTestTempDir(prefix)
  try {
    return await callback(dir)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}
