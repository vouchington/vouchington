import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  env?: Record<string, string>
  run?: string
}

type Workflow = {
  jobs: { 'explain-analyze': { steps: Step[] } }
}

const ANCHOR_ENV = 'EXPLAIN_SEED_ANCHOR_DATE'
const PROOF_INSTANTS = [
  '2026-10-05T23:59:40Z',
  '2026-10-06T00:01:13Z',
  '2026-10-31T12:00:00Z',
] as const

function proofInstants(): readonly string[] {
  const override = process.env.VOUCH_PROOF_NOW
  if (override === undefined) return PROOF_INSTANTS
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(override)) {
    throw new Error('VOUCH_PROOF_NOW must be a UTC instant')
  }
  return [override]
}

function explainAnalyzeJob() {
  const workflow = load(readFileSync('.github/workflows/explain-analyze.yml', 'utf8')) as Workflow
  return workflow.jobs['explain-analyze']
}

describe('explain-analyze seed anchor day', () => {
  it('exports the UTC day 735 minutes before the job, not the runner zone day', () => {
    const pinStep = explainAnalyzeJob().steps.find(candidate =>
      candidate.run?.includes(`${ANCHOR_ENV}=`),
    )
    const script = `
set -euo pipefail
date() {
  case "$*" in
    "-u -d -735 minutes +%Y-%m-%d") printf '%s\\n' "$VOUCH_UTC_DAY" ;;
    "-d -735 minutes +%Y-%m-%d") printf '%s\\n' "$VOUCH_LOCAL_DAY" ;;
    *) echo "unexpected date call: $*" >&2; return 1 ;;
  esac
}
${pinStep?.run ?? 'exit 1'}
printf '%s\\n' "$VOUCH_UTC_DAY" "$VOUCH_LOCAL_DAY"
`
    for (const instant of proofInstants()) {
      const directory = mkdtempSync(join(tmpdir(), 'explain-anchor-'))
      const githubEnv = join(directory, 'github-env')
      const at = new Date(new Date(instant).getTime() - 735 * 60_000)
      const zone = at.getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago'
      const utcDay = at.toISOString().slice(0, 10)
      const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at)
      try {
        const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
          env: {
            ...process.env,
            GITHUB_ENV: githubEnv,
            VOUCH_UTC_DAY: utcDay,
            VOUCH_LOCAL_DAY: localDay,
          },
          encoding: 'utf8',
        })
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
        expect(result.stdout.trim().split('\n')).toEqual([utcDay, localDay])
        const exported = readFileSync(githubEnv, 'utf8')
        expect(exported).toBe(`${ANCHOR_ENV}=${utcDay}\n`)
        expect(localDay).not.toBe(utcDay)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })
})
