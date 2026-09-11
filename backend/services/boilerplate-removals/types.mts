import type { ExtractDomRemovalsResult } from '@jongleberry/vurst-html'

export type BoilerplateRemoval = {
  id: string
  hostname_id: string
  parent_path: string
  results: ExtractDomRemovalsResult
  created_at: Date
  updated_at: Date
}
