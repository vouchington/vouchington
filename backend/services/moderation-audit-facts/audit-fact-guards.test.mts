import { describe, expect, it } from 'vitest'
import { dispositionEvidenceFacts } from './evidence-facts.mts'
import { trainingMetadataFacts, trainingMetadataFromRow } from './metadata-facts.mts'
import { promptAuditSide } from './prompt-audit-fields.mts'

describe('moderation audit fact guards', () => {
  it('rejects malformed disposition evidence', () => {
    expect(() => dispositionEvidenceFacts({ flagged_categories: 'spam' })).toThrow(
      'flagged_categories',
    )
    expect(() => dispositionEvidenceFacts({ composite_score: Number.NaN })).toThrow(
      'composite_score',
    )
    expect(() => dispositionEvidenceFacts({ error_code: '' })).toThrow('error_code')
    expect(dispositionEvidenceFacts({ error_code: 'provider_timeout' }).errorCode).toBe(
      'provider_timeout',
    )
    expect(() =>
      dispositionEvidenceFacts({ signals: [{ signal: '', score: 1, flagged: true }] }),
    ).toThrow('signal')
    expect(() =>
      dispositionEvidenceFacts({ signals: [{ signal: 'spam', score: Number.NaN, flagged: true }] }),
    ).toThrow('signal')
  })

  it('rejects malformed training metadata and rebuilds present nulls', () => {
    expect(() => trainingMetadataFacts({ entity_type: 'nope' })).toThrow('report entity')
    expect(() => trainingMetadataFacts({ entity_type: 'post' })).toThrow('together')
    expect(() => trainingMetadataFacts({ score: 'high' })).toThrow('score')
    expect(
      trainingMetadataFromRow({
        metadata_community_trusted_present: true,
        metadata_expected_flagged_present: true,
        metadata_actual_flagged_present: true,
      }),
    ).toMatchObject({
      community_trusted: null,
      expected_flagged: null,
      actual_flagged: null,
    })
  })

  it('rejects malformed prompt audit fields', () => {
    expect(() => promptAuditSide({ unexpected: true })).toThrow('Unknown community agent prompt')
    expect(() => promptAuditSide({ on_flag_action: 'delete' })).toThrow('on_flag_action')
    expect(() => promptAuditSide({ activated_at: 'not-a-date' })).toThrow('activated_at')
  })
})
