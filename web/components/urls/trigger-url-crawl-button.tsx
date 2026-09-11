'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { enqueueUrlCrawl, refreshRssFeed } from '@/lib/api/client'

interface TriggerUrlCrawlButtonProps {
  id: string
  urlType: 'rss_feed' | 'referral_link' | 'url'
  rssFeedId: string | null
}

export function TriggerUrlCrawlButton({ id, urlType, rssFeedId }: TriggerUrlCrawlButtonProps) {
  const [isCrawling, setIsCrawling] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  async function handleCrawl() {
    if (isCrawling) return
    setIsCrawling(true)
    try {
      await enqueueUrlCrawl(id)
      toast.success('Crawl enqueued')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger crawl')
    } finally {
      setIsCrawling(false)
    }
  }

  async function handleRssSync() {
    if (isSyncing || !rssFeedId) return
    setIsSyncing(true)
    try {
      await refreshRssFeed(rssFeedId, {})
      toast.success('RSS sync triggered')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger RSS sync')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        loading={isCrawling}
        disabled={isCrawling || isSyncing}
        onClick={handleCrawl}
        className='w-full'
      >
        {isCrawling ? 'Triggering...' : 'Trigger Crawl'}
      </Button>
      {urlType === 'rss_feed' && rssFeedId && (
        <Button
          type='button'
          variant='secondary'
          loading={isSyncing}
          disabled={isSyncing || isCrawling}
          onClick={handleRssSync}
          className='w-full'
        >
          {isSyncing ? 'Syncing...' : 'Trigger RSS Sync'}
        </Button>
      )}
    </div>
  )
}
