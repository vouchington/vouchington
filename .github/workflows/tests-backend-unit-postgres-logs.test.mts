import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowText = readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')
const workflow = load(workflowText) as {
  jobs?: Record<
    string,
    {
      services?: Record<string, { env?: Record<string, string> }>
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
  it('logs deadlock errors and lock waits and keeps the failed shard diagnostics', () => {
    const shard = workflow.jobs?.['backend-tests']
    const steps = shard?.steps ?? []
    const initdbArgs = shard?.services?.postgres?.env?.POSTGRES_INITDB_ARGS?.split(' ')
    const show = steps.find(step => step.name === 'Show PostgreSQL lock diagnostics')
    const upload = steps.find(
      step => step.with?.name === 'backend-postgres-log-shard-${{ matrix.shard }}',
    )
    const script = readFileSync(
      '.github/workflows/tests-backend-unit-postgres-lock-logs.sh',
      'utf8',
    )

    expect(initdbArgs).toContain('log_min_messages=error')
    expect(initdbArgs).toContain('log_lock_waits=on')
    expect(initdbArgs?.some(arg => arg.startsWith('deadlock_timeout='))).toBe(false)
    expect(initdbArgs?.some(arg => arg.startsWith('log_statement='))).toBe(false)
    expect(steps.some(step => step.name === 'Show PostgreSQL lock diagnostic settings')).toBe(true)
    expect(show?.if).toBe('failure()')
    expect(show?.env?.POSTGRES_CONTAINER).toBe('${{ job.services.postgres.id }}')
    expect(script).toContain('deadlock detected|still waiting for')
    expect(upload?.if).toBe('failure()')
    expect(String(upload?.with?.path).trim().split('\n')).toEqual([
      'backend-postgres.log',
      'backend-postgres-relations.csv',
    ])
    expect(upload?.with?.['retention-days']).toBe(7)
  })
})
