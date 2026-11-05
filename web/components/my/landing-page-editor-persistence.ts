import type { Dispatch, SetStateAction } from 'react'
import {
  deleteMyLandingPage,
  replaceMyLandingPageItems,
  setDefaultMyLandingPage,
  updateMyLandingPage,
} from '@/lib/api/client'
import { myLandingPageHref } from '@/lib/links/entity-href'
import onError, { onSuccess } from '@/lib/on-error'
import { toLandingPageItemInput } from '@/components/my/landing-pages-manager/options'
import type { LandingPageItem, LandingPageWithItems } from '@/types/landing-pages'

export async function persistLandingPageDetails({
  page,
  title,
  subtitle,
  slug,
  setPage,
  router,
}: {
  page: LandingPageWithItems
  title: string
  subtitle: string
  slug: string
  setPage: Dispatch<SetStateAction<LandingPageWithItems>>
  router: { replace: (href: string) => void }
}) {
  try {
    const { landing_page } = await updateMyLandingPage(page.id, {
      title,
      subtitle: subtitle || null,
      slug,
    })
    const previousSlug = page.slug
    setPage(prev => ({ ...prev, ...landing_page }))
    onSuccess('Page details saved')
    if (landing_page.slug !== previousSlug) {
      router.replace(myLandingPageHref(landing_page))
    }
  } catch (err) {
    /* c8 ignore next -- error path requires injecting a save page details failure */
    onError(err, { fallback: 'Failed to save page details' })
  }
}

export async function persistLandingPageItems({
  pageId,
  draftItems,
  setPage,
  setDraftItems,
  setItemLimit,
}: {
  pageId: string
  draftItems: LandingPageItem[]
  setPage: (page: LandingPageWithItems) => void
  setDraftItems: (items: LandingPageItem[]) => void
  setItemLimit: (itemLimit: number) => void
}) {
  try {
    const { landing_page, item_limit } = await replaceMyLandingPageItems(pageId, {
      items: draftItems.map(toLandingPageItemInput),
    })
    setItemLimit(item_limit)
    setPage(landing_page)
    setDraftItems(landing_page.items)
    onSuccess('Landing page content saved')
  } catch (err) {
    /* c8 ignore next -- error path requires injecting a save landing page content failure */
    onError(err, { fallback: 'Failed to save landing page content' })
  }
}

export async function persistDefaultLandingPage({
  pageId,
  setPage,
}: {
  pageId: string
  setPage: Dispatch<SetStateAction<LandingPageWithItems>>
}) {
  try {
    const { landing_page } = await setDefaultMyLandingPage(pageId)
    setPage(prev => ({ ...prev, is_default: landing_page.is_default }))
    onSuccess('Default landing page updated')
  } catch (err) {
    /* c8 ignore next -- error path requires injecting a set default landing page failure */
    onError(err, { fallback: 'Failed to set default landing page' })
  }
}

export async function deleteLandingPageEditorPage({
  pageId,
  router,
  setLoading,
}: {
  pageId: string
  router: { push: (href: string) => void }
  setLoading: (loading: boolean) => void
}) {
  try {
    await deleteMyLandingPage(pageId)
    onSuccess('Landing page deleted')
    router.push('/my/landing-pages')
  } catch (err) {
    /* c8 ignore next 2 -- error path requires injecting a delete landing page failure */
    onError(err, { fallback: 'Failed to delete landing page' })
    setLoading(false)
  }
}
