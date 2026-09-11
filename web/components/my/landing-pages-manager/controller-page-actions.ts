import { useRef } from 'react'
import { toast } from 'sonner'
import {
  createMyLandingPage,
  deleteMyLandingPage,
  getMyLandingPageClient,
  setDefaultMyLandingPage,
  updateMyLandingPage,
} from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import type { LandingPage, LandingPageWithItems } from '@/types/landing-pages'
import { showLandingPageError, withLoading } from './controller-helpers'

interface LandingPagePageActionsParams {
  newSlug: string
  newSubtitle: string
  newTitle: string
  pages: LandingPage[]
  selectedPage: LandingPageWithItems | null
  setActivePage: (page: LandingPageWithItems | null) => void
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setNewSlug: React.Dispatch<React.SetStateAction<string>>
  setNewSubtitle: React.Dispatch<React.SetStateAction<string>>
  setNewTitle: React.Dispatch<React.SetStateAction<string>>
  setPages: React.Dispatch<React.SetStateAction<LandingPage[]>>
  setSelectedPage: React.Dispatch<React.SetStateAction<LandingPageWithItems | null>>
  slug: string
  subtitle: string
  title: string
}

export function useLandingPagePageActions({
  newSlug,
  newSubtitle,
  newTitle,
  pages,
  selectedPage,
  setActivePage,
  setLoading,
  setNewSlug,
  setNewSubtitle,
  setNewTitle,
  setPages,
  setSelectedPage,
  slug,
  subtitle,
  title,
}: LandingPagePageActionsParams) {
  const latestLoadRequestId = useRef(0)

  async function loadPage(pageId: string) {
    const requestId = ++latestLoadRequestId.current
    setLoading(true)
    try {
      const response = await getMyLandingPageClient(pageId)
      if (requestId === latestLoadRequestId.current) setActivePage(response.landing_page)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to load landing page')
    } finally {
      if (requestId === latestLoadRequestId.current) setLoading(false)
    }
  }

  async function createPage(event: React.FormEvent) {
    event.preventDefault()
    await withLoading(
      setLoading,
      async () => {
        const { landing_page } = await createMyLandingPage({
          title: newTitle,
          subtitle: newSubtitle || null,
          slug: newSlug,
        })
        const created = await getMyLandingPageClient(landing_page.id)
        setPages(prev =>
          [...prev, created.landing_page].toSorted(
            (a, b) => Number(b.is_default) - Number(a.is_default),
          ),
        )
        setActivePage(created.landing_page)
        setNewTitle('')
        setNewSubtitle('')
        setNewSlug('')
        toast.success('Landing page created')
      },
      'Failed to create landing page',
    )
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedPage) return
    await withLoading(
      setLoading,
      async () => {
        const { landing_page } = await updateMyLandingPage(selectedPage.id, {
          title,
          subtitle: subtitle || null,
          slug,
        })
        setPages(prev =>
          prev.map(page => (page.id === selectedPage.id ? { ...page, ...landing_page } : page)),
        )
        setSelectedPage(prev => (prev ? { ...prev, ...landing_page } : prev))
        toast.success('Landing page updated')
      },
      'Failed to update landing page',
    )
  }

  function selectPage(pageId: string) {
    loadPage(pageId).catch(error => showLandingPageError(error, 'Failed to load landing page'))
  }

  async function deletePage() {
    if (!selectedPage) return
    await withLoading(
      setLoading,
      async () => {
        await deleteMyLandingPage(selectedPage.id)
        const nextPages = pages.filter(page => page.id !== selectedPage.id)
        setPages(nextPages)
        setActivePage(null)
        if (nextPages[0]) await loadPage(nextPages[0].id)
        toast.success('Landing page deleted')
      },
      'Failed to delete landing page',
    )
  }

  async function setDefaultPage() {
    if (!selectedPage) return
    await withLoading(
      setLoading,
      async () => {
        const { landing_page } = await setDefaultMyLandingPage(selectedPage.id)
        setPages(prev =>
          prev
            .map(page => ({ ...page, is_default: page.id === selectedPage.id }))
            .toSorted((a, b) => Number(b.is_default) - Number(a.is_default)),
        )
        setSelectedPage(prev => (prev ? { ...prev, is_default: landing_page.is_default } : prev))
        toast.success('Default landing page updated')
      },
      'Failed to set default landing page',
    )
  }

  return { createPage, deletePage, saveDetails, selectPage, setDefaultPage }
}
