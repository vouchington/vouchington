import { mentionConfigs, mentionConfigByType } from './config.mts'
import { createLookupMap } from './lookup-maps.mts'
import { buildResolvedPostMention, isCommentPostEntity } from './post-resolutions.mts'
import { getRootPostsForCommentMentions } from './root-post-lookups.mts'
import type { EntityMention, ResolvedMention } from './types.mts'

/**
 * Resolves entity mentions by looking them up in the database
 */
export async function resolveEntityMentions(mentions: EntityMention[]): Promise<ResolvedMention[]> {
  const resolved: ResolvedMention[] = []
  const identifiersByType = new Map(mentionConfigs.map(config => [config.type, [] as string[]]))
  for (const mention of mentions) {
    const identifiers = identifiersByType.get(mention.type)
    if (identifiers) identifiers.push(mention.identifier)
  }

  const results = await Promise.allSettled(
    mentionConfigs.map(config => config.batchGet(identifiersByType.get(config.type) ?? [])),
  )

  const lookupByType = new Map<string, Map<string, unknown | null>>()
  const lookupErrorByType = new Map<string, boolean>()

  for (let i = 0; i < mentionConfigs.length; i++) {
    const config = mentionConfigs[i]
    const identifiers = identifiersByType.get(config.type) ?? []
    const result = results[i]
    if (result?.status === 'fulfilled') {
      lookupByType.set(
        config.type,
        createLookupMap(identifiers, result.value as Array<unknown | null>),
      )
      lookupErrorByType.set(config.type, false)
    } else {
      lookupByType.set(config.type, createLookupMap(identifiers, []))
      lookupErrorByType.set(config.type, true)
    }
  }

  const rootLookup = await getRootPostsForCommentMentions(mentions, lookupByType, lookupErrorByType)

  for (const mention of mentions) {
    const config = mentionConfigByType.get(mention.type)
    if (!config) {
      resolved.push({
        type: 'unresolved',
        raw: mention.raw,
        reason: 'error',
      })
      continue
    }

    const lookupError = lookupErrorByType.get(mention.type) ?? false
    if (lookupError) {
      resolved.push({
        type: 'unresolved',
        raw: mention.raw,
        reason: 'error',
      })
      continue
    }

    const lookup = lookupByType.get(mention.type)
    const entity = lookup?.get(mention.identifier) ?? null

    const rootLookupFailed =
      mention.type === 'post' &&
      lookupError === false &&
      rootLookup.failed &&
      isCommentPostEntity(entity)
    if (rootLookupFailed) {
      resolved.push({
        type: 'unresolved',
        raw: mention.raw,
        reason: 'error',
      })
      continue
    }

    if (entity) {
      if (mention.type === 'post') {
        resolved.push(buildResolvedPostMention(mention, entity, rootLookup.roots))
        continue
      }
      resolved.push(config.buildResolved(mention, entity))
      continue
    }

    resolved.push({
      type: 'unresolved',
      raw: mention.raw,
      reason: 'not_found',
    })
  }

  return resolved
}
