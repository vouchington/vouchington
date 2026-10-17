import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export async function createMigrationControlJournal(
  role: string,
  name: string,
  oid: number,
  evidencePath: string,
) {
  const identity = { role, name, oid, pid: process.pid }
  // Even failure to determine the process group leaves the actual root identity before app effects.
  await writeFile(
    evidencePath,
    JSON.stringify({ ...identity, pgid: null, status: 'started', phase: 'identity' }),
  )
  const result = await exec('ps', ['-o', 'pgid=', '-p', String(process.pid)])
  const pgid = Number(result.stdout.trim())
  assert.ok(Number.isSafeInteger(pgid) && pgid > 0, 'Expected actual native child process group')
  // Immutable startup identity survives an interrupted later phase/terminal write.
  await writeFile(`${evidencePath}.started`, JSON.stringify({ ...identity, pgid }), { flag: 'wx' })
  const record = async (phase: string, status: string, details: Record<string, unknown> = {}) => {
    await writeFile(evidencePath, JSON.stringify({ ...identity, pgid, phase, status, ...details }))
  }
  await record('before-import', 'started')
  return record
}
