'use client'

import { useEffect, useRef, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  adminDeleteCuratedAside,
  adminListCuratedAsides,
  adminReorderCuratedAsides,
} from '@/lib/api/client/admin-curated-asides'
import onError from '@/lib/on-error'
import { useRouter } from 'next/navigation'
import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CuratedAsidesTabPanel } from './curated-asides-tab-panel'
import { getTabs } from './curated-asides-tabs'

type TabItems = Partial<Record<CuratedAsideType, CuratedAsideItem[]>>
type TabLoading = Partial<Record<CuratedAsideType, boolean>>

interface CuratedAsidesPageProps {
  activeAsideType: CuratedAsideType
}

const LOADING_DEFAULTS: TabLoading = {
  topic: false,
  source: false,
  community: false,
}

function sortCuratedItems(items: CuratedAsideItem[]): CuratedAsideItem[] {
  return items.toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

export default function CuratedAsidesPage({ activeAsideType }: CuratedAsidesPageProps) {
  const t = useTranslations()
  const router = useRouter()
  const tabs = getTabs(t)
  const tabByValue: Record<CuratedAsideType, (typeof tabs)[number]> = {
    topic: tabs[0],
    source: tabs[1],
    community: tabs[2],
  }
  const [items, setItems] = useState<TabItems>({})
  const [loading, setLoading] = useState<TabLoading>({
    ...LOADING_DEFAULTS,
    [activeAsideType]: true,
  })
  const [reordering, setReordering] = useState<TabLoading>({})
  const reorderingTabs = useRef(new Set<CuratedAsideType>())

  useEffect(() => {
    let cancelled = false
    adminListCuratedAsides(activeAsideType)
      .then(result => {
        if (cancelled) return
        setItems(prev => ({ ...prev, [activeAsideType]: result.curated_aside_items }))
      })
      .catch(error => {
        if (cancelled) return
        onError(error, {
          fallback: t(
            'extracted.curatedAsides.curatedAsidesClient.failedToLoadActiveasidetypeCuratedAsides_72554671',
            { activeAsideType },
          ),
        })
      })
      .finally(() => {
        if (cancelled) return
        setLoading(prev => ({ ...prev, [activeAsideType]: false }))
      })

    return () => {
      cancelled = true
    }
  }, [activeAsideType, t])

  function handleAdd(tabValue: CuratedAsideType) {
    return (item: CuratedAsideItem) => {
      setItems(prev => {
        const current = prev[tabValue] ?? []
        const next = current.filter(i => i.id !== item.id && i.entity_id !== item.entity_id)
        return { ...prev, [tabValue]: sortCuratedItems([...next, item]) }
      })
    }
  }

  async function handleDelete(tabValue: CuratedAsideType, id: string) {
    try {
      await adminDeleteCuratedAside(id)
      setItems(prev => ({
        ...prev,
        [tabValue]: (prev[tabValue] ?? []).filter(i => i.id !== id),
      }))
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.curatedAsides.curatedAsidesClient.failedToDeleteCuratedItem_96346ae3',
        ),
      })
    }
  }

  async function handleReorder(tabValue: CuratedAsideType, fromIndex: number, toIndex: number) {
    if (reorderingTabs.current.has(tabValue)) return
    const current = items[tabValue] ?? []
    if (
      fromIndex < 0 ||
      fromIndex >= current.length ||
      toIndex < 0 ||
      toIndex >= current.length ||
      fromIndex === toIndex
    ) {
      return
    }
    reorderingTabs.current.add(tabValue)
    setReordering(prev => ({ ...prev, [tabValue]: true }))
    const reordered = [...current]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved!)
    const updated = reordered.map((item, i) => ({ ...item, position: i }))
    setItems(prev => ({ ...prev, [tabValue]: updated }))
    try {
      await adminReorderCuratedAsides(
        tabValue,
        updated.map(i => i.id),
      )
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.curatedAsides.curatedAsidesClient.failedToReorderCuratedItems_469ed821',
        ),
      })
      setItems(prev => ({ ...prev, [tabValue]: current }))
    } finally {
      reorderingTabs.current.delete(tabValue)
      setReordering(prev => ({ ...prev, [tabValue]: false }))
    }
  }

  return (
    <div data-pw='curated-asides-page'>
      <Tabs
        value={activeAsideType}
        onValueChange={tabValue => {
          const tab = tabByValue[tabValue as CuratedAsideType]
          if (!tab) return
          if (!items[tab.value]) {
            setLoading(prev => ({ ...prev, [tab.value]: true }))
          }
          router.push(tab.href)
        }}
      >
        <AdminPageHeader
          title={t('extracted.curatedAsides.curatedAsidesClient.curatedAsides_8798b0ff')}
          description={t(
            'extracted.curatedAsides.curatedAsidesClient.manageCuratedContentShownInSidebarWidgets_3f4a5b6c',
          )}
        />
        <TabsList className='mt-4'>
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <CuratedAsidesTabPanel
          activeAsideType={activeAsideType}
          items={items[activeAsideType] ?? []}
          loading={Boolean(loading[activeAsideType])}
          reordering={Boolean(reordering[activeAsideType])}
          onAdd={handleAdd(activeAsideType)}
          onDelete={id => handleDelete(activeAsideType, id)}
          onReorder={(fromIndex, toIndex) => handleReorder(activeAsideType, fromIndex, toIndex)}
          t={t}
        />
      </Tabs>
    </div>
  )
}
