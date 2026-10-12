import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rmdir, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PoolClient } from '@data-stores/psql/types'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'

/** Same-host quarantine survives a fixture owner's exit; it never expires by PID or age. */
export async function claimEmbeddingQuotaLease(client: PoolClient, key: string) {
  const endpoint = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))
    throw new Error('Embedding quota leases require the normal local database endpoint')
  const { rows } = await client.query<{
    database: string
    oid: string
    address: string | null
    port: number | null
  }>(
    allowUnannotatedQuery(`SELECT current_database() AS database, oid::text AS oid,
      inet_server_addr()::text AS address, inet_server_port() AS port
    FROM pg_database WHERE datname = current_database()`),
  )
  const identity = rows[0]
  if (
    !identity ||
    !identity.address ||
    !identity.port ||
    !/^\d+$/.test(identity.oid) ||
    (!/^voucha[-_]/.test(identity.database) &&
      !(
        process.env.GITHUB_ACTIONS === 'true' &&
        process.env.CI_PROJECT === 'backend-unit' &&
        identity.database === 'postgres'
      ))
  )
    throw new Error('Embedding quota leases require an owned non-main database')
  const serverIdentity = {
    ...identity,
    address: ['127.0.0.1/32', '::1/128', '127.0.0.1', '::1'].includes(identity.address ?? '')
      ? 'loopback'
      : identity.address,
  }
  // Never hash or persist the credential-bearing URL, its username, or query parameters.
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        endpoint: `loopback:${endpoint.port || '5432'}`,
        identity: serverIdentity,
        key,
      }),
    )
    .digest('hex')
  const root = join(homedir(), '.local', 'state', 'voucha', 'embedding-quota-leases')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = join(root, digest)
  try {
    await mkdir(directory, { mode: 0o700 })
  } catch (err) {
    throw new Error('Embedding quota admission refused: lease exists or cannot be claimed', {
      cause: err,
    })
  }
  const nonce = randomUUID()
  const metadata = join(directory, 'owner.json')
  // Any failure after mkdir retains the directory, including incomplete metadata.
  const file = await open(metadata, 'wx', 0o600)
  const failures: unknown[] = []
  try {
    await file.writeFile(
      JSON.stringify({
        nonce,
        identity,
        key,
        pid: process.pid,
        claimedAt: new Date().toISOString(),
      }),
    )
    await file.sync()
  } catch (err) {
    failures.push(err)
  } finally {
    try {
      await file.close()
    } catch (err) {
      failures.push(err)
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Quota lease metadata failed; witness retained', {
      cause: failures[0],
    })
  let removed = false
  return {
    directory,
    nonce,
    identity,
    /** Caller must first prove physical drain and every required restoration phase. */
    removeAfterRestoration: async () => {
      if (removed) return
      const owner: unknown = JSON.parse(await readFile(metadata, 'utf8'))
      if (!owner || typeof owner !== 'object' || !('nonce' in owner) || owner.nonce !== nonce)
        throw new Error('Quota lease removal refused: owner nonce does not match')
      await unlink(metadata)
      await rmdir(directory)
      removed = true
    },
  }
}
