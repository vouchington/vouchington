import { execFile as execFileCallback } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const smokeScript = resolve('cloudflare-worker/scripts/tests/smoke-test-cloudflare-worker.sh')

async function writeExecutable(path: string, body: string): Promise<void> {
  await writeFile(path, `#!/bin/bash\nset -euo pipefail\n${body}`)
  await chmod(path, 0o755)
}

async function runSmoke(firstNodeOutput: string): Promise<{
  allocations: string
  events: string[]
  result: Awaited<ReturnType<typeof execFile>> | Error
}> {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-cloudflare-smoke-retry-'))
  const bin = join(directory, 'bin')
  const allocationsFile = join(directory, 'allocations')
  const launchesFile = join(directory, 'launches')
  const eventsFile = join(directory, 'events')
  await mkdir(bin)
  await writeExecutable(join(bin, 'pnpm'), 'echo build >> "$EVENTS_FILE"')
  await writeExecutable(
    join(bin, 'python3'),
    `count=0
[ -f "$ALLOCATIONS_FILE" ] && count=$(<"$ALLOCATIONS_FILE")
count=$((count + 1))
echo "$count" > "$ALLOCATIONS_FILE"
echo allocate >> "$EVENTS_FILE"
if [ "$count" -eq 1 ]; then echo '2200 2201'; else echo '2202 2203'; fi`,
  )
  await writeExecutable(
    join(bin, 'node'),
    `count=0
[ -f "$LAUNCHES_FILE" ] && count=$(<"$LAUNCHES_FILE")
count=$((count + 1))
echo "$count" > "$LAUNCHES_FILE"
if [ "$count" -eq 1 ]; then printf '%s\\n' "$FIRST_NODE_OUTPUT" >&2; exit 1; fi
trap 'exit 0' INT TERM
while true; do /bin/sleep 1; done`,
  )
  await writeExecutable(
    join(bin, 'curl'),
    `count=0
[ -f "$LAUNCHES_FILE" ] && count=$(<"$LAUNCHES_FILE")
if [ "$count" -ge 2 ]; then printf '200'; else printf '000'; fi`,
  )

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    ALLOCATIONS_FILE: allocationsFile,
    LAUNCHES_FILE: launchesFile,
    EVENTS_FILE: eventsFile,
    FIRST_NODE_OUTPUT: firstNodeOutput,
  }
  let result: Awaited<ReturnType<typeof execFile>> | Error
  try {
    result = await execFile('bash', [smokeScript], { env, timeout: 10_000 })
    return {
      allocations: await readFile(allocationsFile, 'utf8'),
      events: (await readFile(eventsFile, 'utf8')).trim().split('\n'),
      result,
    }
  } catch (error) {
    result = error as Error
    return {
      allocations: await readFile(allocationsFile, 'utf8'),
      events: (await readFile(eventsFile, 'utf8')).trim().split('\n'),
      result,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('Cloudflare Worker smoke port collision recovery', () => {
  it('builds once, allocates immediately before launch, and retries one exact bind collision', async () => {
    const run = await runSmoke('Error: listen EADDRINUSE: address already in use 127.0.0.1:2200')

    expect(run.result).not.toBeInstanceOf(Error)
    expect(run.events).toEqual(['build', 'allocate', 'allocate'])
    expect(run.allocations.trim()).toBe('2')
  })

  it('fails immediately without reallocating after an unrelated startup error', async () => {
    const run = await runSmoke('Error: Cannot find module worker-entry.mjs')

    expect(run.result).toBeInstanceOf(Error)
    expect(run.events).toEqual(['build', 'allocate'])
    expect(run.allocations.trim()).toBe('1')
  })
})
