'use client'

import type { ReactNode } from 'react'
import type {
  PublicContentProvenance,
  StaffContentProvenance,
} from '@voucha/types/entities/content-provenance'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import { publicProvenanceLabel } from './provenance-label'
import { PROVENANCE_TEST_IDS, type ProvenanceTestIdPrefix } from './provenance-test-ids'

export interface ProvenanceBadgesProps {
  /** The entity the badges belong to; it sets the `data-pw` ids, such as `post-provenance-badge`. */
  testIdPrefix: ProvenanceTestIdPrefix
  provenance?: PublicContentProvenance
  staffProvenance?: StaffContentProvenance
  /** Detail pages also name the raw OAuth client behind the entity. Cards show the channel only. */
  showClient?: boolean
}

function ProvenanceBadge({
  testId,
  variant,
  children,
}: {
  testId: string
  variant: 'outline' | 'secondary'
  children: ReactNode
}) {
  return (
    <Badge
      variant={variant}
      className='whitespace-nowrap text-xs'
      // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- ids come from a literal table keyed by the finite prefix union; a default would add a ghost selector
      data-pw={testId}
    >
      {children}
    </Badge>
  )
}

/**
 * The "via API", "via MCP" or "via {app}" label for content written through the API or MCP,
 * composed from the `{ via, app }` facts, and, for administrators and moderators, the raw channel
 * and OAuth client. The server decides who sees what, so this renders exactly the fields the
 * response carries.
 */
export function ProvenanceBadges({
  testIdPrefix,
  provenance,
  staffProvenance,
  showClient = false,
}: ProvenanceBadgesProps) {
  const t = useTranslations()
  const ids = PROVENANCE_TEST_IDS[testIdPrefix]
  const client = showClient ? staffProvenance?.oauth_client : null
  return (
    <>
      {provenance ? (
        <ProvenanceBadge
          testId={ids.badge}
          variant='outline'
        >
          {publicProvenanceLabel(t, provenance)}
        </ProvenanceBadge>
      ) : null}
      {staffProvenance ? (
        <ProvenanceBadge
          testId={ids.channel}
          variant='secondary'
        >
          {t('shared.provenance.channel', { channel: staffProvenance.created_via })}
        </ProvenanceBadge>
      ) : null}
      {client ? (
        <>
          <ProvenanceBadge
            testId={ids.client}
            variant='secondary'
          >
            {t('shared.provenance.client', {
              name: client.client_name,
              clientId: client.client_id,
            })}
          </ProvenanceBadge>
          <ProvenanceBadge
            testId={ids.clientVerification}
            variant='secondary'
          >
            {client.verified ? t('shared.provenance.verified') : t('shared.provenance.unverified')}
          </ProvenanceBadge>
        </>
      ) : null}
    </>
  )
}
