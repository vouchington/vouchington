import { ApiError } from '@vouchington/api-client'
import type { Translator } from '@ts-shared/ui-messages'

/** Localized recovery for the shared REST and MCP relation-admission refusal. */
export function getRelationLimitMessage(
  error: unknown,
  predicate: string,
  t: Translator,
): string | null {
  if (!(error instanceof ApiError) || error.code !== 'RELATION_LIMIT_REACHED') return null
  return predicate === 'follow'
    ? t('shared.relationLimit.follow')
    : t('shared.relationLimit.subscribe')
}
