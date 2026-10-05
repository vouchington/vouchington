'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Post } from '@/types/posts'

export interface PostProvenanceBadgesProps {
  provenance?: Post['provenance']
  staffProvenance?: Post['staff_provenance']
  /** Detail pages also name the raw OAuth client behind the post. Cards show the channel only. */
  showClient?: boolean
}

/**
 * The "via API", "via MCP" or "via {app}" label for posts written through the API or MCP, and, for
 * administrators and moderators, the raw channel and OAuth client. The server decides who sees
 * what, so this renders exactly the fields the response carries.
 */
export function PostProvenanceBadges({
  provenance,
  staffProvenance,
  showClient = false,
}: PostProvenanceBadgesProps) {
  const t = useTranslations()
  const client = showClient ? staffProvenance?.oauth_client : null
  const viaKey = provenance?.via === 'mcp' ? 'shared.provenance.viaMcp' : 'shared.provenance.viaApi'
  return (
    <>
      {provenance ? (
        <Badge
          variant='outline'
          className='whitespace-nowrap text-xs'
          data-pw='post-provenance-badge'
        >
          {provenance.app_name !== null
            ? t('shared.provenance.viaApp', { app: provenance.app_name })
            : t(viaKey)}
        </Badge>
      ) : null}
      {staffProvenance ? (
        <Badge
          variant='secondary'
          className='whitespace-nowrap text-xs'
          data-pw='post-provenance-channel'
        >
          {t('shared.provenance.channel', { channel: staffProvenance.created_via })}
        </Badge>
      ) : null}
      {client ? (
        <>
          <Badge
            variant='secondary'
            className='whitespace-nowrap text-xs'
            data-pw='post-provenance-client'
          >
            {t('shared.provenance.client', {
              name: client.client_name,
              clientId: client.client_id,
            })}
          </Badge>
          <Badge
            variant='secondary'
            className='whitespace-nowrap text-xs'
            data-pw='post-provenance-client-verification'
          >
            {client.verified ? t('shared.provenance.verified') : t('shared.provenance.unverified')}
          </Badge>
        </>
      ) : null}
    </>
  )
}
