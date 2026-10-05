import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  getLandingPageRowForUser,
  createMyLandingPage,
  deleteMyLandingPage,
  getMyLandingPage,
  getMyLandingPageCandidates,
  listLandingPagesForUser,
  replaceMyLandingPageItems,
  setMyLandingPageDefault,
  updateMyLandingPage,
} from '@services/my'

type CreateLandingPageRequest = {
  title: string
  subtitle?: string | null
  slug: string
}

type UpdateLandingPageRequest =
  | { is_default: true }
  | { title?: string; subtitle?: string | null; slug?: string }

type LandingPageTopicEntryRequest =
  | { type: 'review'; review_post_id: ApiUuidContract }
  | { type: 'referral_link'; referral_link_id: ApiUuidContract }

type LandingPageItemRequest =
  | { type: 'profile_link'; profile_link_id: ApiUuidContract }
  | { type: 'review'; review_post_id: ApiUuidContract }
  | { type: 'referral_link'; referral_link_id: ApiUuidContract }
  | { type: 'topic_group'; topic_id: ApiUuidContract; entries: LandingPageTopicEntryRequest[] }
  | { type: 'link'; label: string; url: string }

type ReplaceLandingPageItemsRequest = { items: LandingPageItemRequest[] }

async function handleGetLandingPageCandidates(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/landing-pages/candidates')

  const candidates = await getMyLandingPageCandidates(currentUser.id)
  ctx.json({ candidates })
}

async function handleListMyLandingPages(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/landing-pages')

  const pages = await listLandingPagesForUser(currentUser.id)
  ctx.json({ results: pages })
}

async function handleCreateMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/landing-pages')

  const body = (await ctx.request.json('100kb')) as CreateLandingPageRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/landing-pages', { body })
  const landingPage = await createMyLandingPage(currentUser.id, body)

  ctx.setStatus(201)
  ctx.json({ landing_page: landingPage })
}

async function handleReplaceMyLandingPageItems(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/my/landing-pages/:pageId/items')
  // The service repeats this lookup; running it first keeps the schema diagnostic behind ownership.
  await getLandingPageRowForUser(currentUser.id, ctx.params.pageId!)

  const body = (await ctx.request.json('1mb')) as ReplaceLandingPageItemsRequest
  validateRequestContract(ctx, 'PUT:/api/v1/my/landing-pages/:pageId/items', {
    path: ctx.params,
    body,
  })

  const landingPage = await replaceMyLandingPageItems(
    currentUser.id,
    ctx.params.pageId!,
    body.items,
  )

  ctx.json({ landing_page: landingPage })
}

async function handleGetMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/landing-pages/:pageId')
  validateRequestContract(ctx, 'GET:/api/v1/my/landing-pages/:pageId', { path: ctx.params })

  const landingPage = await getMyLandingPage(currentUser.id, ctx.params.pageId!)
  ctx.json({ landing_page: landingPage })
}

async function handleUpdateMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/landing-pages/:pageId')
  // The service repeats this lookup; running it first keeps the schema diagnostic behind ownership.
  await getLandingPageRowForUser(currentUser.id, ctx.params.pageId!)

  const body = (await ctx.request.json('100kb')) as UpdateLandingPageRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/landing-pages/:pageId', {
    path: ctx.params,
    body,
  })

  const landingPage =
    'is_default' in body
      ? await setMyLandingPageDefault(currentUser.id, ctx.params.pageId!)
      : await updateMyLandingPage(currentUser.id, ctx.params.pageId!, body)

  ctx.json({ landing_page: landingPage })
}

async function handleDeleteMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/landing-pages/:pageId')
  validateRequestContract(ctx, 'DELETE:/api/v1/my/landing-pages/:pageId', { path: ctx.params })

  await deleteMyLandingPage(currentUser.id, ctx.params.pageId!)
  ctx.setStatus(204)
}

app.route('/api/v1/my/landing-pages/candidates').get(handleGetLandingPageCandidates)

app.route('/api/v1/my/landing-pages').get(handleListMyLandingPages).post(handleCreateMyLandingPage)

app.route('/api/v1/my/landing-pages/:pageId/items').put(handleReplaceMyLandingPageItems)

app
  .route('/api/v1/my/landing-pages/:pageId')
  .get(handleGetMyLandingPage)
  .patch(handleUpdateMyLandingPage)
  .delete(handleDeleteMyLandingPage)
