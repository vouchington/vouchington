import type { ViewHostname } from '@services/urls-hostnames/types'

export type ViewUrl = {
  __entity_type: 'url'
  id: string
  hostname: ViewHostname
  canonical_url_id: string | null
  url: string
  pathname: string
  search_params: Record<string, string>
}
