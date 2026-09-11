import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  on?: { workflow_call?: { inputs?: Record<string, unknown> } }
  permissions?: Record<string, string>
  jobs?: Record<
    string,
    {
      'runs-on'?: string[]
      permissions?: Record<string, string>
      env?: Record<string, string>
      steps?: Array<{
        name?: string
        run?: string
        uses?: string
        'continue-on-error'?: boolean
        with?: Record<string, unknown>
      }>
    }
  >
}

const workflow = load(readFileSync('.github/workflows/ci-record-state.yml', 'utf8')) as Workflow

describe('CI state recorder', () => {
  it('records a compact producer-only map on a permissionless utility runner', () => {
    expect(Object.keys(workflow.on?.workflow_call?.inputs ?? {}).sort()).toEqual([
      'deferred',
      'head-sha',
      'pr-number',
      'processing-result',
      'producer-results',
      'tested-sha',
    ])
    expect(workflow.permissions).toEqual({})

    const job = workflow.jobs?.['record-state']
    expect(job?.['runs-on']).toEqual(['self-hosted'])
    expect(job?.permissions).toEqual({})
    expect(job?.env).toEqual({ BASH_ENV: '/dev/null' })

    const record = job?.steps?.find(step => step.name === 'Record producer state')
    expect(record?.run).toContain('with_entries(.value |= .result)')
    expect(record?.run).not.toContain('toJSON(needs)')

    const runnerTemp = mkdtempSync(join(tmpdir(), 'ci-record-state-'))
    try {
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', record?.run ?? ''], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DEFERRED: 'true',
          HEAD_SHA: 'head-sha',
          PRODUCER_RESULTS: '{"test-web":{"result":"success"},"storybook":{"result":"skipped"}}',
          PR_NUMBER: '8277',
          PROCESSING_RESULT: 'success',
          RUNNER_TEMP: runnerTemp,
          TESTED_SHA: 'tested-sha',
        },
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(JSON.parse(readFileSync(join(runnerTemp, 'ci-state.json'), 'utf8'))).toEqual({
        version: 'ci-state:v1',
        prNumber: 8277,
        headSha: 'head-sha',
        testedSha: 'tested-sha',
        processingResult: 'success',
        deferred: true,
        producers: { 'test-web': 'success', storybook: 'skipped' },
      })
    } finally {
      rmSync(runnerTemp, { recursive: true })
    }
  })

  it('uploads a replaceable one-day SHA-scoped record without gating CI', () => {
    const upload = workflow.jobs?.['record-state']?.steps?.find(step =>
      step.uses?.startsWith('actions/upload-artifact@'),
    )
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.['continue-on-error']).toBe(true)
    expect(upload?.with).toEqual({
      name: 'ci-state-${{ inputs.tested-sha }}',
      path: '${{ runner.temp }}/ci-state.json',
      'retention-days': 1,
      overwrite: true,
    })
  })
})
