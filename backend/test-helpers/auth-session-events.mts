import { expect } from 'vitest'
import { flush } from '@data-stores/analytics/backend-local'
import path from 'node:path'
import fs from 'node:fs'

export async function readAuthSessionRows(testDir: string): Promise<Record<string, unknown>[]> {
  const tableDir = path.join(testDir, 'auth_sessions')
  const fileNames = await fs.promises.readdir(tableDir).catch((err: unknown) => {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return []
    throw err
  })

  return (
    await Promise.all(
      fileNames.map(async fileName => {
        const raw = await fs.promises.readFile(path.join(tableDir, fileName), 'utf8')
        return raw
          .trim()
          .split('\n')
          .flatMap(line => (line ? [JSON.parse(line) as Record<string, unknown>] : []))
      }),
    )
  ).flat()
}
export async function expectAuthSessionEvent(
  testDir: string,
  did: string,
  sid: string,
  eventType: string,
): Promise<void> {
  await flush()
  const rows = await readAuthSessionRows(testDir)
  const matchingRows = rows.filter(row => row.device_id === did && row.session_id === sid)
  expect(matchingRows.length).toBeGreaterThanOrEqual(1)
  expect(matchingRows.map(row => row.event_type)).toContain(eventType)
}
