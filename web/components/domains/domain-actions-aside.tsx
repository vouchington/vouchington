'use client'

import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { ReportInlineButton } from '@/components/shared/report-menu-item'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DomainActionsAsideProps {
  hostnameId: string
}

export function DomainActionsAside({ hostnameId }: DomainActionsAsideProps) {
  const t = useTranslations()
  return (
    <Card
      className='p-4'
      data-pw='domain-actions-aside'
    >
      <h3 className='text-sm font-semibold'>
        {t('extracted.domains.domainActionsAside.actions_ff8059dc')}
      </h3>
      <ButtonGroup className='mt-3'>
        <EntityBookmarkButton
          entityType='url_hostname'
          entityId={hostnameId}
          preset='mute'
          size='touchSm'
          tooltip={t('extracted.domains.domainActionsAside.hideThisDomainFromYourFeed_27a18a75')}
          data-pw='domain-mute-button'
        />
        <EntityBookmarkButton
          entityType='url_hostname'
          entityId={hostnameId}
          preset='block'
          size='touchSm'
          tooltip={t('extracted.domains.domainActionsAside.blockContentFromThisDomain_7c3b277b')}
          data-pw='domain-block-button'
        />
        <ReportInlineButton
          entityType='url_hostname'
          entityId={hostnameId}
          isAuthenticated
        />
      </ButtonGroup>
    </Card>
  )
}
