import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const smokeScript = resolve('lambdas/image-resize/scripts/tests/smoke-test-image-lambda.sh')
const smokeScriptSource = readFileSync(smokeScript, 'utf8')

async function writeExecutable(path: string, body: string): Promise<void> {
  await writeFile(path, `#!/bin/bash\nset -euo pipefail\n${body}`)
  await chmod(path, 0o755)
}

// The "stays up until gracefully shut down" fake node must be a real Node process, not a bash
// script with `trap ... INT`. The smoke script backgrounds it with `&` from a non-interactive
// shell with job control off, so bash sets SIGINT to SIG_IGN for it before exec — and per POSIX,
// a signal that is already ignored on shell entry can never be re-trapped by that shell, so a
// bash-script stand-in can only ever respond to the script's SIGTERM cleanup path, never to the
// SIGINT the success path actually sends. A real `node` process doesn't have that restriction
// (Node's runtime installs its own SIGINT handling regardless), which is also why the real,
// unmodified dev-server.mts shuts down cleanly on `kill -INT` despite registering no signal
// handler of its own — this fixture just needs the same real interpreter to match.
async function writeNodeExecutable(path: string, body: string): Promise<void> {
  await writeFile(path, `#!${process.execPath}\n${body}`)
  await chmod(path, 0o755)
}

interface SmokeRun {
  allocations: string
  events: string[]
  result: Awaited<ReturnType<typeof execFile>> | Error
}

// Both fake node scripts append 'launch' before doing anything else, so the events
// sequence proves reallocation always happens before the next launch, never after.
const FAKE_PYTHON3 = `count=0
[ -f "$ALLOCATIONS_FILE" ] && count=$(<"$ALLOCATIONS_FILE")
count=$((count + 1))
echo "$count" > "$ALLOCATIONS_FILE"
echo allocate >> "$EVENTS_FILE"
echo $((41000 + count))`

async function runSmoke(firstNodeOutput: string, timeout = 15_000): Promise<SmokeRun> {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-image-lambda-smoke-retry-'))
  const bin = join(directory, 'bin')
  const allocationsFile = join(directory, 'allocations')
  const launchesFile = join(directory, 'launches')
  const eventsFile = join(directory, 'events')
  await mkdir(bin)
  await writeExecutable(join(bin, 'python3'), FAKE_PYTHON3)
  // First launch dies with the caller-supplied message (an exact bind collision, or an
  // unrelated startup error); every subsequent launch stays up until the script sends
  // SIGINT for a graceful shutdown, mirroring a dev server that came up cleanly.
  await writeNodeExecutable(
    join(bin, 'node'),
    `const fs = require('node:fs')
fs.appendFileSync(process.env.EVENTS_FILE, 'launch\\n')
let count = 0
if (fs.existsSync(process.env.LAUNCHES_FILE)) {
  count = Number(fs.readFileSync(process.env.LAUNCHES_FILE, 'utf8').trim())
}
count += 1
fs.writeFileSync(process.env.LAUNCHES_FILE, String(count))
if (count === 1) {
  process.stderr.write(process.env.FIRST_NODE_OUTPUT + '\\n')
  process.exit(1)
}
setInterval(() => {}, 1 << 30)`,
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
    result = await execFile('bash', [smokeScript], { env, timeout })
  } catch (error) {
    result = error as Error
  }
  try {
    const [allocations, events] = await Promise.all([
      readFile(allocationsFile, 'utf8'),
      readFile(eventsFile, 'utf8'),
    ])
    return { allocations, events: events.trim().split('\n'), result }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

// Regression coverage for defect (1): the readiness check used to be
// `grep -q "Lambda dev server:"`, which trusts a log line instead of a served request. This
// fake node prints that banner but never lets curl see a 200, so a script that still trusted
// the log-grep would exit 0 the moment it saw the line; the current HTTP-poll script must
// instead run out the 20s readiness window and fail.
async function runNeverReady(timeout = 35_000): Promise<SmokeRun> {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-image-lambda-smoke-never-ready-'))
  const bin = join(directory, 'bin')
  const allocationsFile = join(directory, 'allocations')
  const eventsFile = join(directory, 'events')
  await mkdir(bin)
  await writeExecutable(join(bin, 'python3'), FAKE_PYTHON3)
  await writeExecutable(
    join(bin, 'node'),
    `echo launch >> "$EVENTS_FILE"
echo 'Lambda dev server: http://localhost:41001'
trap 'exit 0' INT TERM
while true; do /bin/sleep 1; done`,
  )
  await writeExecutable(join(bin, 'curl'), `printf '000'`)

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    ALLOCATIONS_FILE: allocationsFile,
    EVENTS_FILE: eventsFile,
  }
  let result: Awaited<ReturnType<typeof execFile>> | Error
  try {
    result = await execFile('bash', [smokeScript], { env, timeout })
  } catch (error) {
    result = error as Error
  }
  try {
    const [allocations, events] = await Promise.all([
      readFile(allocationsFile, 'utf8'),
      readFile(eventsFile, 'utf8'),
    ])
    return { allocations, events: events.trim().split('\n'), result }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('Image lambda smoke port collision recovery', () => {
  it('retries once on an exact bind collision, then succeeds', async () => {
    const run = await runSmoke('Error: listen EADDRINUSE: address already in use :::41001')

    expect(run.result).not.toBeInstanceOf(Error)
    expect(run.events).toEqual(['allocate', 'launch', 'allocate', 'launch'])
    expect(run.allocations.trim()).toBe('2')
  })

  it('fails immediately without reallocating after an unrelated startup error', async () => {
    const run = await runSmoke("Error: Cannot find module 'image-resize/index.mts'")

    expect(run.result).toBeInstanceOf(Error)
    expect(run.events).toEqual(['allocate', 'launch'])
    expect(run.allocations.trim()).toBe('1')
  })

  it('does not accept the startup banner as readiness (regression for defect 1)', async () => {
    const run = await runNeverReady()

    expect(run.result).toBeInstanceOf(Error)
    expect(run.events).toEqual(['allocate', 'launch'])
    expect(run.allocations.trim()).toBe('1')
  }, 45_000)
})

describe('Image lambda smoke test hardening', () => {
  it('uses HTTP readiness with an allocated port and a cleanup trap', () => {
    expect(smokeScriptSource).toContain('ci/allocate-browser-safe-ports.py 1')
    expect(smokeScriptSource).toContain('trap cleanup EXIT INT TERM')
    expect(smokeScriptSource).toContain('http://127.0.0.1:${IMAGE_LAMBDA_PORT}/health')
    expect(smokeScriptSource).toContain('S3_BUCKET_IMAGES=test-images')
    expect(smokeScriptSource).toContain('S3_BUCKET_RENDERS=test-renders')
    expect(smokeScriptSource).not.toContain('grep -q "Lambda dev server:"')
  })
})
