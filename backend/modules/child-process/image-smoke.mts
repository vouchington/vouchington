import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { CommandFailedError, runCommand } from './index.mts'

const SORT_BIN = '/usr/bin/sort'
const COMM_BIN = '/usr/bin/comm'
const SMOKE_TIMEOUT_MS = 5_000

// Runs inside the worker-io CLI image and from the host smoke test. `sort -u`
// and `comm` go through the typed wrapper, and TMPDIR must be writable because
// GNU sort spills there.
export async function runWorkerIoCliSmoke(): Promise<void> {
  const root = process.env.TMPDIR
  if (root === undefined || root.length === 0) {
    throw new Error('TMPDIR must point at writable ephemeral storage')
  }
  const probe = join(root, 'worker-io-cli-writable')
  writeFileSync(probe, 'ok')

  const sorted = await collectStdout(SORT_BIN, ['-u'], 'b\na\nb\n')
  if (sorted !== 'a\nb\n') {
    throw new Error(`sort -u returned ${JSON.stringify(sorted)}`)
  }

  const dir = mkdtempSync(join(root, 'worker-io-comm-'))
  try {
    const left = join(dir, 'left')
    const right = join(dir, 'right')
    writeFileSync(left, 'a\nb\nc\n')
    writeFileSync(right, 'b\n')
    const onlyLeft = await collectStdout(COMM_BIN, ['-23', left, right])
    if (onlyLeft !== 'a\nc\n') {
      throw new Error(`comm -23 returned ${JSON.stringify(onlyLeft)}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(probe, { force: true })
  }
}

async function collectStdout(
  command: string,
  args: readonly string[],
  stdin?: string,
): Promise<string> {
  const chunks: Buffer[] = []
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
  try {
    await runCommand({ command, args, stdin, stdout, timeoutMs: SMOKE_TIMEOUT_MS })
  } catch (err) {
    if (err instanceof CommandFailedError) {
      throw new Error(`worker-io cli smoke failed: ${err.message}`, { cause: err })
    }
    throw err
  }
  return Buffer.concat(chunks).toString('utf8')
}

if (import.meta.main) {
  await runWorkerIoCliSmoke()
}
