import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { CommandRunner } from '../benchmarks/topic-metrics/database-lifecycle.mts'

interface MigrationChildIdentity {
  name: string
  role: 'concurrent'
  oid: number
  pid: number
  pgid: number
}
type Owner = Pick<MigrationChildIdentity, 'name' | 'role' | 'oid'>

export async function readMigrationChildIdentity(
  path: string,
  owner: Owner,
  complete: boolean,
): Promise<MigrationChildIdentity> {
  const evidence: unknown = JSON.parse(await readFile(path, 'utf8'))
  assert.ok(typeof evidence === 'object' && evidence !== null)
  assert.ok('name' in evidence && evidence.name === owner.name)
  assert.ok('role' in evidence && evidence.role === owner.role)
  assert.ok('oid' in evidence && evidence.oid === owner.oid)
  assert.ok(
    'pid' in evidence &&
      typeof evidence.pid === 'number' &&
      Number.isSafeInteger(evidence.pid) &&
      evidence.pid > 0,
  )
  assert.ok(
    'pgid' in evidence &&
      typeof evidence.pgid === 'number' &&
      Number.isSafeInteger(evidence.pgid) &&
      evidence.pgid > 0,
  )
  if (complete) {
    assert.ok('status' in evidence && evidence.status === 'closed')
    assert.ok('canonicalClosed' in evidence && evidence.canonicalClosed === true)
    assert.ok('alternateClosed' in evidence && evidence.alternateClosed === true)
    assert.ok(
      'observedClients' in evidence &&
        typeof evidence.observedClients === 'number' &&
        evidence.observedClients > 0,
    )
  }
  return { ...owner, pid: evidence.pid, pgid: evidence.pgid }
}

export async function migrationChildGroupMembers(
  run: CommandRunner,
  identity: MigrationChildIdentity,
): Promise<number[]> {
  const processes = await run('ps', ['-eo', 'pid=,pgid='])
  return processes.stdout.split('\n').flatMap(line => {
    const fields = line.trim().split(/\s+/).map(Number)
    return fields.length === 2 && fields[1] === identity.pgid ? [fields[0]] : []
  })
}

export async function recordMigrationChildFailure(
  run: CommandRunner,
  evidencePath: string,
  directory: string,
  owner: Owner,
): Promise<void> {
  const identity = await readMigrationChildIdentity(`${evidencePath}.started`, owner, false)
  const remainingMembers = await migrationChildGroupMembers(run, identity)
  await writeFile(
    join(directory, 'parent-failure.json'),
    JSON.stringify({
      ...identity,
      remainingMembers,
      status: 'FAILED_RETAINED',
      poolAndServerClosureCertified: false,
    }),
  )
}

/** Parent computes the remaining budget and registers this launch before invoking it. */
export async function launchMigrationControlChild(
  seconds: number,
  owner: Owner,
  url: string,
  evidencePath: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const root = resolve(import.meta.dirname, '../../../..')
  await promisify(execFile)(
    'python3',
    [
      join(root, 'node_modules/vouchington-tooling/scripts/run-bounded.py'),
      String(seconds),
      process.execPath,
      ...process.execArgv,
      join(import.meta.dirname, 'migration-control-child.mts'),
      owner.role,
      owner.name,
      String(owner.oid),
      evidencePath,
    ],
    {
      cwd: root,
      env: { ...environment, DATABASE_URL: url, READ_DATABASE_URL: url },
      maxBuffer: 8 * 1024 * 1024,
    },
  )
}
