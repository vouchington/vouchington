import { describe, expect, it } from 'vitest'
import { postgresWorkflowPolicyViolations, type OpsWorkflow } from './workflow-ops-policy.mts'

const common = '-c max_connections=300 -c log_min_messages=log'
const eager = `${common} -c autovacuum_naptime=1s -c autovacuum_analyze_threshold=0 -c autovacuum_analyze_scale_factor=0`
const path = '.github/workflows/tests-backend-unit.yml'
const sources = {
  [path]: `image: ghcr.io/vouchington/dependency-pgvector:synthetic@sha256:${'b'.repeat(64)}`,
  '.github/workflows/initialize-smoke-test.yml':
    'run: source .github/workflows/initialize-smoke-test/prepare-postgres.sh',
  '.github/workflows/initialize-smoke-test/prepare-postgres.sh': `docker run -e POSTGRES_INITDB_ARGS="${common}"`,
}

function workflow(args: string, job = 'backend-tests'): OpsWorkflow {
  return { jobs: { [job]: { services: { postgres: { env: { POSTGRES_INITDB_ARGS: args } } } } } }
}

describe('PostgreSQL workflow service settings', () => {
  it('requires eager autoanalyze for backend unit shards', () => {
    expect(postgresWorkflowPolicyViolations(sources, { [path]: workflow(eager) })).toEqual([])
    for (const args of [
      common,
      eager.replace('-c autovacuum_naptime=1s', ''),
      eager.replace('-c autovacuum_analyze_threshold=0', ''),
      eager.replace('-c autovacuum_analyze_scale_factor=0', ''),
    ]) {
      expect(postgresWorkflowPolicyViolations(sources, { [path]: workflow(args) })).toEqual([
        `${path}#backend-tests POSTGRES_INITDB_ARGS must equal ${eager}`,
      ])
    }
  })

  it('retains default settings outside the backend unit job', () => {
    for (const [file, job] of [
      [path, 'other-job'],
      ['.github/workflows/schema.yml', 'backend-tests'],
    ]) {
      expect(postgresWorkflowPolicyViolations(sources, { [file]: workflow(common, job) })).toEqual(
        [],
      )
      expect(postgresWorkflowPolicyViolations(sources, { [file]: workflow(eager, job) })).toEqual([
        `${file}#${job} POSTGRES_INITDB_ARGS must equal ${common}`,
      ])
    }
  })
})
