import { describe, expect, it } from 'vitest'

import { runStaticWorkflowScript } from './test-helpers/static-workflow-script-fixture.mts'

describe('repository static-check workflow script', () => {
  it('uses an existing base commit without fetching', () => {
    const result = runStaticWorkflowScript('run-repository-static-checks.sh', {
      BASE_SHA: 'synthetic-base',
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.trace).toBe(
      'git cat-file -e synthetic-base^{commit}\nnode static-code-analysis/run-node-checks.mts --checks config-inventory-policy,repo-file-policy,scc-complexity,targeted-guardrails\n',
    )
  })

  it('fetches a missing base before running the same checks', () => {
    const result = runStaticWorkflowScript('run-repository-static-checks.sh', {
      BASE_SHA: 'synthetic-base',
      CAT_FILE_STATUS: '1',
    })

    expect(result.status).toBe(0)
    expect(result.trace).toBe(
      'git cat-file -e synthetic-base^{commit}\ngit fetch --no-tags --depth=1 origin synthetic-base\nnode static-code-analysis/run-node-checks.mts --checks config-inventory-policy,repo-file-policy,scc-complexity,targeted-guardrails\n',
    )
  })

  it('stops on a failed fetch', () => {
    const result = runStaticWorkflowScript('run-repository-static-checks.sh', {
      BASE_SHA: 'synthetic-base',
      CAT_FILE_STATUS: '1',
      FETCH_STATUS: '17',
    })

    expect(result.status).toBe(17)
    expect(result.trace).toBe(
      'git cat-file -e synthetic-base^{commit}\ngit fetch --no-tags --depth=1 origin synthetic-base\n',
    )
  })

  it('propagates a check failure', () => {
    const result = runStaticWorkflowScript('run-repository-static-checks.sh', {
      BASE_SHA: 'synthetic-base',
      NODE_STATUS: '23',
    })

    expect(result.status).toBe(23)
  })
})

describe('backend query-profile manifest workflow script', () => {
  it.each(['0', '-1', '1.5', 'unknown'])('rejects invalid shard count %s', expectedShards => {
    const result = runStaticWorkflowScript('check-backend-query-profile-manifests.sh', {
      EXPECTED_SHARDS: expectedShards,
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('::error::Invalid backend-unit shard count:')
    expect(result.trace).toBe('')
  })

  it('rejects incomplete manifest evidence', () => {
    const result = runStaticWorkflowScript(
      'check-backend-query-profile-manifests.sh',
      { EXPECTED_SHARDS: '2' },
      ['backend-query-profile-hits-shard-1.json'],
    )

    expect(result.status).toBe(2)
    expect(result.stderr).toBe('::error::Expected 2 query-profile hit manifests, found 1\n')
    expect(result.trace).toBe('')
  })

  it('passes manifests in shard order to the checker', () => {
    const result = runStaticWorkflowScript(
      'check-backend-query-profile-manifests.sh',
      { EXPECTED_SHARDS: '2' },
      ['backend-query-profile-hits-shard-2.json', 'backend-query-profile-hits-shard-1.json'],
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.trace).toBe(
      'node backend/test-helpers/request-query-profile-manifest-check.mts backend-query-profile-hits/backend-query-profile-hits-shard-1.json backend-query-profile-hits/backend-query-profile-hits-shard-2.json\n',
    )
  })

  it('propagates the manifest checker failure', () => {
    const result = runStaticWorkflowScript(
      'check-backend-query-profile-manifests.sh',
      { EXPECTED_SHARDS: '1', NODE_STATUS: '23' },
      ['backend-query-profile-hits-shard-1.json'],
    )

    expect(result.status).toBe(23)
  })
})
