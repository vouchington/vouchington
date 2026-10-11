import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = load(readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')) as {
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}

describe('backend-unit sampler opt-in', () => {
  it('starts samplers only for diagnostics=1 without changing the test command status', () => {
    const runScript = workflow.jobs?.['backend-tests']?.steps?.find(
      step => step.name === 'Run backend tests',
    )?.run
    const samplerBlock = /if \[ "\$VITEST_DIAGNOSTICS" = 1 \]; then\n[\s\S]*?\nfi/u.exec(
      runScript ?? '',
    )?.[0]
    expect(samplerBlock).toBeDefined()
    const script = `start_sampler() { printf '%s\\n' "$1"; }\n${samplerBlock}\nexit 17`
    const env = { ...process.env }
    delete env.VITEST_DIAGNOSTICS

    for (const value of [undefined, '0', '1']) {
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: value === undefined ? env : { ...env, VITEST_DIAGNOSTICS: value },
      })
      expect(result.status).toBe(17)
      expect(result.stderr).toBe('')
      expect(result.stdout.trim().split('\n').filter(Boolean)).toEqual(
        value === '1'
          ? ['sample_runner_resources', 'sample_postgres_waits', 'sample_runner_pressure']
          : [],
      )
    }
  })
})
