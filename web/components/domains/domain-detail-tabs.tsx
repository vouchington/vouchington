'use client'
import { useState, type ReactNode } from 'react'
import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar'
import { entityMenubarTriggerClassName } from '@/components/shared/entity-menubar-classes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DomainDetailTabsProps {
  children: ReactNode | [ReactNode, ReactNode?, ReactNode?]
}

export function DomainDetailTabs({ children }: DomainDetailTabsProps) {
  const t = useTranslations()
  const [tab, setTab] = useState<'overview' | 'moderation' | 'crawlers'>('overview')
  const [overview, moderation, crawlers] = Array.isArray(children) ? children : [children]

  if (!moderation && !crawlers) return overview

  return (
    <div className='flex flex-col gap-3'>
      <Menubar
        aria-label={t('extracted.domains.domainDetailTabs.domainDetailNavigation_17ad2cfa')}
        className='h-auto min-h-9 w-full justify-start overflow-x-auto scrollbar-hide border-border/80 bg-background p-0.5 shadow-xs'
      >
        <MenubarMenu>
          <MenubarTrigger
            aria-current={tab === 'overview' ? 'page' : undefined}
            className={entityMenubarTriggerClassName}
            data-active={tab === 'overview' ? 'true' : 'false'}
            data-pw='domain-tab-overview'
            onClick={() => setTab('overview')}
          >
            {t('extracted.domains.domainDetailTabs.overview_d4b1ea57')}
          </MenubarTrigger>
        </MenubarMenu>
        {moderation && (
          <MenubarMenu>
            <MenubarTrigger
              aria-current={tab === 'moderation' ? 'page' : undefined}
              className={entityMenubarTriggerClassName}
              data-active={tab === 'moderation' ? 'true' : 'false'}
              data-pw='domain-tab-moderation'
              onClick={() => setTab('moderation')}
            >
              {t('extracted.domains.domainDetailTabs.moderation_126d4415')}
            </MenubarTrigger>
          </MenubarMenu>
        )}
        {crawlers && (
          <MenubarMenu>
            <MenubarTrigger
              aria-current={tab === 'crawlers' ? 'page' : undefined}
              className={entityMenubarTriggerClassName}
              data-active={tab === 'crawlers' ? 'true' : 'false'}
              data-pw='domain-tab-crawlers'
              onClick={() => setTab('crawlers')}
            >
              {t('extracted.domains.domainDetailTabs.crawlers_9bb7d6d4')}
            </MenubarTrigger>
          </MenubarMenu>
        )}
      </Menubar>
      {tab === 'overview' && overview}
      {tab === 'moderation' && moderation}
      {tab === 'crawlers' && crawlers}
    </div>
  )
}
