'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SearchTab, SearchTabOption } from '../command-search-data'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SearchTabsProps {
  activeTab: SearchTab
  onTabChange: (tab: SearchTab) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  tabsRef: React.RefObject<HTMLFieldSetElement | null>
  tabs: SearchTabOption[]
}

export function SearchTabs({ activeTab, onTabChange, onKeyDown, tabsRef, tabs }: SearchTabsProps) {
  const t = useTranslations()
  return (
    <fieldset
      ref={tabsRef}
      className='flex gap-1 border-b px-3 py-2'
    >
      <legend className='sr-only'>
        {t('extracted.commandSearch.searchTabs.filterByType_51035b5b')}
      </legend>
      {tabs.map(tab => (
        <Button
          key={tab.value}
          type='button'
          variant='ghost'
          size='sm'
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`search-tab-${tab.value}`}
          onClick={() => onTabChange(tab.value)}
          onKeyDown={onKeyDown}
          aria-pressed={activeTab === tab.value}
          className={cn(
            'h-auto rounded-full px-3 py-1 text-xs font-medium transition-colors',
            activeTab === tab.value
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          {t(tab.label)}
        </Button>
      ))}
    </fieldset>
  )
}
