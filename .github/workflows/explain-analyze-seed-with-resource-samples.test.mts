import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = '.github/workflows/explain-analyze-seed-with-resource-samples.sh'

// The sampler backgrounds `sleep 2`. A pid still alive after the step exits is the
// orphan the runner would terminate. The wrapper records that pid and execs the real binary.
function recordSleepThenExec(): string {
  return [
    '#!/usr/bin/env bash',
    'printf \'%s %s\\n\' "$$" "$*" >> "$SAMPLER_SLEEP_LOG"',
    'exec "$SAMPLER_SLEEP_BIN" "$@"',
    '',
  ].join('\n')
}

function realSleepBinary(): string {
  const found = spawnSync('bash', ['-c', 'PATH=/usr/bin:/bin command -v sleep'], {
    encoding: 'utf8',
  })
  expect(found.status).toBe(0)
  const path = found.stdout.trim()
  expect(path.startsWith('/')).toBe(true)
  return path
}

function survivingSleeps(logPath: string): string[] {
  const survivors: string[] = []
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const match = /^(\d+) (\S+)$/.exec(line.trim())
    if (match?.[1] === undefined) continue
    const listed = spawnSync('ps', ['-p', match[1], '-o', 'pid=,command='], { encoding: 'utf8' })
    if (listed.status === 0 && listed.stdout.trim().length > 0) survivors.push(listed.stdout.trim())
    spawnSync('kill', ['-KILL', match[1]])
  }
  return survivors
}

function runSeedSampler(nodeExitCode: number): {
  orphans: string[]
  startedSampler: boolean
  status: number | null
} {
  const cwd = mkdtempSync(join(tmpdir(), 'explain-seed-sampler-'))
  const sleepLog = join(cwd, 'sleep-log')
  writeFileSync(sleepLog, '')
  const bin = join(cwd, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'sleep'), recordSleepThenExec())
  chmodSync(join(bin, 'sleep'), 0o755)
  writeFileSync(
    join(bin, 'node'),
    `#!/usr/bin/env bash\n"$SAMPLER_SLEEP_BIN" 0.5\nexit ${nodeExitCode}\n`,
  )
  chmodSync(join(bin, 'node'), 0o755)
  for (const command of ['docker', 'timeout']) {
    writeFileSync(join(bin, command), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(join(bin, command), 0o755)
  }
  // A captured stdout pipe keeps this subshell alive until `sleep` returns, so the
  // orphan never outlives the step. Discarding stdio is the exit the runner reaps.
  const result = spawnSync('bash', ['-c', 'source "$1"', 'bash', join(process.cwd(), scriptPath)], {
    cwd,
    encoding: 'utf8',
    stdio: 'ignore',
    env: {
      ...process.env,
      GITHUB_WORKSPACE: cwd,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      POSTGRES_CONTAINER_ID: 'sampler-test',
      SAMPLER_SLEEP_BIN: realSleepBinary(),
      SAMPLER_SLEEP_LOG: sleepLog,
    },
  })
  const startedSampler = readFileSync(sleepLog, 'utf8')
    .split('\n')
    .some(line => line.trim().endsWith(' 2'))
  const orphans = survivingSleeps(sleepLog)
  rmSync(cwd, { force: true, recursive: true })
  return { orphans, startedSampler, status: result.status }
}

describe('explain-analyze seed resource sampler', () => {
  it('is the script the seed step runs', () => {
    const workflow = readFileSync('.github/workflows/explain-analyze.yml', 'utf8')
    expect(workflow).toContain(`source "$GITHUB_WORKSPACE/${scriptPath}"`)
  })

  it('reaps the sampler sleep before the step exits', () => {
    const { orphans, startedSampler, status } = runSeedSampler(0)
    expect(status).toBe(0)
    expect(startedSampler).toBe(true)
    expect(orphans).toEqual([])
  })

  it('keeps a seed failure when the sampler is running', () => {
    const { orphans, startedSampler, status } = runSeedSampler(7)
    expect(status).toBe(7)
    expect(startedSampler).toBe(true)
    expect(orphans).toEqual([])
  })
})
