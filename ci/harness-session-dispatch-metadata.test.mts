import { describe, expect, it, vi } from 'vitest'

import { HarnessDispatchError } from 'auto-harness-client/actions'

import { buildHarnessDispatchMetadata } from './harness-session-dispatch-metadata.mts'

const baseEnv = {
  AGENT_REF: 'main',
  EXPECTED_HEAD_SHA: 'a'.repeat(40),
  COMPLETION_MODE: 'pr',
  ISSUE_NUMBER: '',
  TRIGGER_COMMENT_ID: '',
  PUBLISH_CONTRACT: 'none',
  PUBLISH_BASE_REF: '',
  PUBLISH_TARGET_PR_NUMBER: '',
  PUBLISH_TITLE_PREFIX: '',
  PUBLISH_TITLE_SUFFIX: '',
  PUBLISH_DUPLICATE_KEY: '',
  EXISTING_ISSUE_MAINTENANCE: 'false',
  ALLOW_DUPLICATE_ISSUE_COMPLETION: 'false',
  PR_LABEL: '',
  PR_SHEPHERD_VERSION: '',
  CHECKPOINT_ISSUE_NUMBER: '',
  SLACK_SOURCE: '',
  SOURCE_RUN_ID: '',
  SOURCE_RUN_ATTEMPT: '',
  SOURCE_RUN_CONCLUSION: '',
  PUBLISH_RELATED_CANDIDATES: '[]',
}

describe('buildHarnessDispatchMetadata', () => {
  it('forwards required fields, keeps false booleans, and drops unset optional ones', () => {
    expect(buildHarnessDispatchMetadata(baseEnv)).toEqual({
      agentRef: 'main',
      expectedHeadSha: 'a'.repeat(40),
      completionMode: 'pr',
      publishContract: 'none',
      existingIssueMaintenance: 'false',
      allowDuplicateIssueCompletion: 'false',
    })
  })

  it('omits publish-related-candidates when empty', () => {
    const result = buildHarnessDispatchMetadata({ ...baseEnv, PUBLISH_RELATED_CANDIDATES: '[]' })
    expect(result).not.toHaveProperty('publishRelatedCandidates')
  })

  it('serializes non-empty publish-related-candidates to a metadata string', () => {
    const result = buildHarnessDispatchMetadata({
      ...baseEnv,
      PUBLISH_RELATED_CANDIDATES: '["#123","#456"]',
    })
    expect(result.publishRelatedCandidates).toBe('["#123","#456"]')
    expect(typeof result.publishRelatedCandidates).toBe('string')
    expect(JSON.parse(result.publishRelatedCandidates ?? '')).toEqual(['#123', '#456'])
  })

  it.each([600, 5000])(
    'drops a publish-related-candidates payload of %i bytes instead of failing the step (no hard ceiling)',
    padLength => {
      const oversized = JSON.stringify(['x'.repeat(padLength)])
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      const result = buildHarnessDispatchMetadata({
        ...baseEnv,
        PUBLISH_RELATED_CANDIDATES: oversized,
      })
      expect(result).not.toHaveProperty('publishRelatedCandidates')
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining('publish-related-candidates dropped'),
      )
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining('bytes exceeds the 512-byte non-gating limit'),
      )
      stderr.mockRestore()
    },
  )

  it('rejects a metadata field over the 512-character bound', () => {
    expect(() => buildHarnessDispatchMetadata({ ...baseEnv, PR_LABEL: 'x'.repeat(513) })).toThrow(
      HarnessDispatchError,
    )
    expect(() => buildHarnessDispatchMetadata({ ...baseEnv, PR_LABEL: 'x'.repeat(513) })).toThrow(
      'prLabel exceeds 512 characters',
    )
  })

  it('rejects publish-related-candidates that is not a JSON array', () => {
    expect(() =>
      buildHarnessDispatchMetadata({ ...baseEnv, PUBLISH_RELATED_CANDIDATES: '{}' }),
    ).toThrow('publish-related-candidates must be a JSON array')
  })
})
