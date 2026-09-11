import type { UserWarningItem } from '@/lib/api/client/warnings'

export interface MyWarningViewModel {
  id: string
  communitySlug: string | null
  createdAt: string
  publicMessage: string | null
}

export function projectMyWarnings(warnings: readonly UserWarningItem[]): MyWarningViewModel[] {
  return warnings.map(warning => ({
    id: warning.id,
    communitySlug: warning.community_slug,
    createdAt: warning.created_at,
    publicMessage: warning.public_message,
  }))
}
