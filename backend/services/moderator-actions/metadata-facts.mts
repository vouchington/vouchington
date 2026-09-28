const ROLES = new Set(['owner', 'moderator', 'member'])
const RESTRICTION_TYPES = new Set([
  'require_post_approval',
  'no_new_member_posts',
  'no_links',
  'approved_members_only',
])
const KNOWN_KEYS = new Set([
  'role',
  'previous_role',
  'restriction_id',
  'restriction_type',
  'restriction_ids',
  'restriction_types',
  'expires_at',
  'reason',
  'imageId',
  'topic_slugs',
  'source_key',
  'moderation_training',
])

export type ModeratorActionMetadataFacts = {
  role: string | null
  previousRole: string | null
  expiresAt: string | null
  expiresAtPresent: boolean
  reason: string | null
  imageId: string | null
  sourceKey: string | null
  moderationTraining: boolean | null
  topicSlugs: string[]
  restrictions: Array<{ id: string; type: string }>
}

export function moderatorActionMetadataFacts(
  metadata: Record<string, unknown> | undefined,
): ModeratorActionMetadataFacts {
  const value = metadata ?? {}
  for (const key of Object.keys(value)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown moderator action metadata key: ${key}`)
  }
  const singular =
    Object.hasOwn(value, 'restriction_id') || Object.hasOwn(value, 'restriction_type')
  const plural =
    Object.hasOwn(value, 'restriction_ids') || Object.hasOwn(value, 'restriction_types')
  if (singular && plural) throw new Error('Moderator action restrictions are singular or a list')
  return {
    role: roleValue(value, 'role'),
    previousRole: roleValue(value, 'previous_role'),
    expiresAt: expiresAtValue(value),
    expiresAtPresent: Object.hasOwn(value, 'expires_at'),
    reason: textValue(value, 'reason'),
    imageId: textValue(value, 'imageId'),
    sourceKey: textValue(value, 'source_key'),
    moderationTraining: booleanValue(value, 'moderation_training'),
    topicSlugs: stringList(value, 'topic_slugs'),
    restrictions: singular ? singularRestrictions(value) : listRestrictions(value),
  }
}

function roleValue(metadata: Record<string, unknown>, key: string): string | null {
  const value = textValue(metadata, key)
  if (value != null && !ROLES.has(value)) throw new Error(`Invalid moderator action role: ${key}`)
  return value
}

function textValue(metadata: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(metadata, key)) return null
  const value = metadata[key]
  if (value == null) return null
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid moderator action metadata: ${key}`)
  }
  return value
}

function booleanValue(metadata: Record<string, unknown>, key: string): boolean | null {
  if (!Object.hasOwn(metadata, key)) return null
  const value = metadata[key]
  if (typeof value !== 'boolean') throw new Error(`Invalid moderator action metadata: ${key}`)
  return value
}

function expiresAtValue(metadata: Record<string, unknown>): string | null {
  if (!Object.hasOwn(metadata, 'expires_at')) return null
  const value = metadata.expires_at
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('Invalid moderator action metadata: expires_at')
  return value
}

function stringList(metadata: Record<string, unknown>, key: string): string[] {
  if (!Object.hasOwn(metadata, key)) return []
  const value = metadata[key]
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`Invalid moderator action metadata: ${key}`)
  }
  return value
}

function singularRestrictions(
  metadata: Record<string, unknown>,
): Array<{ id: string; type: string }> {
  const id = textValue(metadata, 'restriction_id')
  const type = textValue(metadata, 'restriction_type')
  if (!id || !type || !RESTRICTION_TYPES.has(type)) {
    throw new Error('Invalid moderator action restriction')
  }
  return [{ id, type }]
}

function listRestrictions(metadata: Record<string, unknown>): Array<{ id: string; type: string }> {
  const ids = stringList(metadata, 'restriction_ids')
  const types = stringList(metadata, 'restriction_types')
  if (ids.length !== types.length) throw new Error('Invalid moderator action restriction list')
  return ids.map((id, index) => {
    const type = types[index]!
    if (!RESTRICTION_TYPES.has(type)) throw new Error('Invalid moderator action restriction')
    return { id, type }
  })
}

export function flattenSlugs(facts: ModeratorActionMetadataFacts[]) {
  const ordinals: number[] = []
  const positions: number[] = []
  const values: string[] = []
  facts.forEach((fact, index) => {
    fact.topicSlugs.forEach((slug, position) => {
      ordinals.push(index + 1)
      positions.push(position)
      values.push(slug)
    })
  })
  return { ordinals, positions, values }
}

export function flattenRestrictions(facts: ModeratorActionMetadataFacts[]) {
  const ordinals: number[] = []
  const positions: number[] = []
  const restrictionIds: string[] = []
  const types: string[] = []
  facts.forEach((fact, index) => {
    fact.restrictions.forEach((restriction, position) => {
      ordinals.push(index + 1)
      positions.push(position)
      restrictionIds.push(restriction.id)
      types.push(restriction.type)
    })
  })
  return { ordinals, positions, ids: restrictionIds, types }
}
