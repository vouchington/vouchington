import { clientApi } from './instance'

export function getCopyrightNoticeAssociationTarget(
  id: string,
  signal?: AbortSignal,
): Promise<{
  copyright_notice: {
    id: string
    jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk'
    received_at: string
  }
}> {
  return clientApi.get(`/api/v1/copyright-notices/${id}/association-target`, { signal })
}
