import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { CreateCommunityInput } from './create-types.mts'

export type CommunityInsert = {
  id: string
  slug: string
  defaultLanguage: string | null
  currentUserId: string
  provenance: ContentProvenance
  input: CreateCommunityInput
}
