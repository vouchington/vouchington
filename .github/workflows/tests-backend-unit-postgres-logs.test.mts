import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowText = readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')
const workflow = load(workflowText) as {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        env?: Record<string, string>
        if?: string
        name?: string
        with?: Record<string, string | number>
      }>
    }
  >
}

describe('backend-unit PostgreSQL lock diagnostics', () => {
  it('logs lock waits and keeps the PostgreSQL log of a failed shard', () => {
    const steps = workflow.jobs?.['backend-tests']?.steps ?? []
    const show = steps.find(step => step.name === 'Show PostgreSQL lock diagnostics')
    const upload = steps.find(
      step => step.with?.name === 'backend-postgres-log-shard-${{ matrix.shard }}',
    )
    const script = readFileSync(
      '.github/workflows/tests-backend-unit-postgres-lock-logs.sh',
      'utf8',
    )

    expect(workflowText).toContain('-c log_lock_waits=on')
    expect(workflowText).not.toContain('-c deadlock_timeout')
    expect(workflowText).not.toContain('-c log_statement')
    expect(show?.if).toBe('failure()')
    expect(show?.env?.POSTGRES_CONTAINER).toBe('${{ job.services.postgres.id }}')
    expect(script).toContain('deadlock detected|still waiting for')
    expect(upload?.if).toBe('failure()')
    expect(upload?.with?.['retention-days']).toBe(3)
  })
})
