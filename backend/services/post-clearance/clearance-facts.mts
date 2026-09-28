const KNOWN_KEYS = new Set([
  'creation_moderation_bypassed',
  'moderation_version_policy_revision',
  'source_key',
  'moderation_training',
  'reason',
  'compensates_change_id',
  'restores_change_id',
  'audit_source',
  'source',
  'test_fixture',
])

export type ClearanceMetadataFacts = {
  creationModerationBypassed: boolean | null
  moderationVersionPolicyRevision: string | null
  sourceKey: string | null
  moderationTraining: boolean | null
  compensationReason: string | null
  compensatesChangeId: string | null
  restoresChangeId: string | null
  auditSource: string | null
}

export function clearanceMetadataFacts(metadata: Record<string, unknown>): ClearanceMetadataFacts {
  for (const key of Object.keys(metadata)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown post clearance metadata key: ${key}`)
  }
  const auditSource =
    text(metadata, 'audit_source') ??
    text(metadata, 'source') ??
    (metadata.test_fixture === true ? 'test_fixture' : null)
  return {
    creationModerationBypassed: triState(metadata, 'creation_moderation_bypassed'),
    moderationVersionPolicyRevision: text(metadata, 'moderation_version_policy_revision'),
    sourceKey: text(metadata, 'source_key'),
    moderationTraining: triState(metadata, 'moderation_training'),
    compensationReason: text(metadata, 'reason'),
    compensatesChangeId: text(metadata, 'compensates_change_id'),
    restoresChangeId: Object.hasOwn(metadata, 'restores_change_id')
      ? text(metadata, 'restores_change_id')
      : null,
    auditSource,
  }
}

function triState(metadata: Record<string, unknown>, key: string): boolean | null {
  if (!Object.hasOwn(metadata, key)) return null
  const value = metadata[key]
  if (typeof value !== 'boolean') throw new Error(`Invalid post clearance metadata: ${key}`)
  return value
}

function text(metadata: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(metadata, key)) return null
  const value = metadata[key]
  if (value == null) return null
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid post clearance metadata: ${key}`)
  }
  return value
}
