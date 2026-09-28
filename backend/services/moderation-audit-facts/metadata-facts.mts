const REPORT_ENTITY_TYPES = new Set(['post', 'comment', 'user', 'url_hostname', 'rss_feed_item'])

export type TrainingMetadataFacts = {
  sourceKey: string | null
  outcome: string | null
  sourceType: string | null
  score: number | null
  scorePresent: boolean
  recommendedAction: string | null
  reason: string | null
  reportEntityType: string | null
  reportReason: string | null
  reportPostId: string | null
  reportUserId: string | null
  reportHostnameId: string | null
  reportRssFeedItemId: string | null
  communityTrusted: boolean | null
  communityTrustedPresent: boolean
  clearanceStatus: string | null
  promptId: string | null
  promptModelName: string | null
  promptModelProvider: string | null
  testText: string | null
  expectedFlagged: boolean | null
  expectedFlaggedPresent: boolean
  expectedReason: string | null
  actualFlagged: boolean | null
  actualFlaggedPresent: boolean
  actualReason: string | null
}

const KNOWN_KEYS = new Set([
  'source_key',
  'outcome',
  'source_type',
  'score',
  'recommended_action',
  'reason',
  'entity_type',
  'entity_id',
  'report_reason',
  'community_trusted',
  'clearance_status',
  'prompt_id',
  'prompt_model_name',
  'prompt_model_provider',
  'test_text',
  'expected_flagged',
  'expected_reason',
  'actual_flagged',
  'actual_reason',
])

export function trainingMetadataFacts(metadata: Record<string, unknown>): TrainingMetadataFacts {
  for (const key of Object.keys(metadata)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown moderation training metadata key: ${key}`)
  }
  const entityType = optionalString(metadata, 'entity_type')
  if (entityType != null && !REPORT_ENTITY_TYPES.has(entityType)) {
    throw new Error(`Unknown moderation training report entity: ${entityType}`)
  }
  const entityId = optionalString(metadata, 'entity_id')
  if ((entityType == null) !== (entityId == null) && Object.hasOwn(metadata, 'entity_type')) {
    throw new Error('Report training metadata requires entity_type and entity_id together')
  }
  return {
    sourceKey: optionalString(metadata, 'source_key'),
    outcome: optionalString(metadata, 'outcome'),
    sourceType: optionalString(metadata, 'source_type'),
    score: scoreValue(metadata),
    scorePresent: Object.hasOwn(metadata, 'score'),
    recommendedAction: optionalString(metadata, 'recommended_action'),
    reason: optionalString(metadata, 'reason'),
    reportEntityType: entityType,
    reportReason: optionalString(metadata, 'report_reason'),
    reportPostId: entityType === 'post' || entityType === 'comment' ? entityId : null,
    reportUserId: entityType === 'user' ? entityId : null,
    reportHostnameId: entityType === 'url_hostname' ? entityId : null,
    reportRssFeedItemId: entityType === 'rss_feed_item' ? entityId : null,
    communityTrusted: booleanValue(metadata, 'community_trusted'),
    communityTrustedPresent: Object.hasOwn(metadata, 'community_trusted'),
    clearanceStatus: optionalString(metadata, 'clearance_status'),
    promptId: optionalString(metadata, 'prompt_id'),
    promptModelName: optionalString(metadata, 'prompt_model_name'),
    promptModelProvider: optionalString(metadata, 'prompt_model_provider'),
    testText: optionalString(metadata, 'test_text'),
    expectedFlagged: booleanValue(metadata, 'expected_flagged'),
    expectedFlaggedPresent: Object.hasOwn(metadata, 'expected_flagged'),
    expectedReason: optionalString(metadata, 'expected_reason'),
    actualFlagged: booleanValue(metadata, 'actual_flagged'),
    actualFlaggedPresent: Object.hasOwn(metadata, 'actual_flagged'),
    actualReason: optionalString(metadata, 'actual_reason'),
  }
}

export function trainingMetadataFromRow(row: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  assign(metadata, 'source_key', row.metadata_source_key)
  assign(metadata, 'outcome', row.metadata_outcome)
  assign(metadata, 'source_type', row.metadata_source_type)
  if (row.metadata_score_present === true) metadata.score = row.metadata_score ?? null
  assign(metadata, 'recommended_action', row.metadata_recommended_action)
  assign(metadata, 'reason', row.metadata_reason)
  if (typeof row.metadata_report_entity_type === 'string') {
    metadata.entity_type = row.metadata_report_entity_type
    metadata.entity_id =
      row.metadata_report_post_id ??
      row.metadata_report_user_id ??
      row.metadata_report_hostname_id ??
      row.metadata_report_rss_feed_item_id
    assign(metadata, 'report_reason', row.metadata_report_reason)
  }
  if (row.metadata_community_trusted_present === true) {
    metadata.community_trusted = row.metadata_community_trusted ?? null
  }
  assign(metadata, 'clearance_status', row.metadata_clearance_status)
  assign(metadata, 'prompt_id', row.metadata_prompt_id)
  assign(metadata, 'prompt_model_name', row.metadata_prompt_model_name)
  assign(metadata, 'prompt_model_provider', row.metadata_prompt_model_provider)
  assign(metadata, 'test_text', row.metadata_test_text)
  if (row.metadata_expected_flagged_present === true) {
    metadata.expected_flagged = row.metadata_expected_flagged ?? null
  }
  assign(metadata, 'expected_reason', row.metadata_expected_reason)
  if (row.metadata_actual_flagged_present === true) {
    metadata.actual_flagged = row.metadata_actual_flagged ?? null
  }
  assign(metadata, 'actual_reason', row.metadata_actual_reason)
  return metadata
}

function assign(metadata: Record<string, unknown>, key: string, value: unknown): void {
  if (value != null) metadata[key] = value
}

function optionalString(metadata: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(metadata, key)) return null
  const value = metadata[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`Invalid moderation training metadata: ${key}`)
  return value
}

function booleanValue(metadata: Record<string, unknown>, key: string): boolean | null {
  if (!Object.hasOwn(metadata, key)) return null
  const value = metadata[key]
  if (value == null) return null
  if (typeof value !== 'boolean') throw new Error(`Invalid moderation training metadata: ${key}`)
  return value
}

function scoreValue(metadata: Record<string, unknown>): number | null {
  if (!Object.hasOwn(metadata, 'score')) return null
  const value = metadata.score
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid moderation training metadata: score')
  }
  return value
}
