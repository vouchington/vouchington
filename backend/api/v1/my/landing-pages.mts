import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  createMyLandingPage,
  deleteMyLandingPage,
  getMyLandingPage,
  getMyLandingPageCandidates,
  listLandingPagesForUser,
  replaceMyLandingPageItems,
  setMyLandingPageDefault,
  updateMyLandingPage,
  type LandingPageItemInput,
} from '@services/my'

function parseOptionalSubtitle(
  ctx: Context,
  body: Record<string, unknown>,
): string | null | undefined {
  if (!('subtitle' in body)) return undefined
  ctx.assert(
    typeof body.subtitle === 'string' || body.subtitle === null,
    400,
    'subtitle must be a string or null',
  )
  return body.subtitle as string | null
}

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

  const body = (await ctx.request.json('100kb')) as Record<string, unknown>
  const landingPage = await createMyLandingPage(currentUser.id, {
    title: String(body.title ?? ''),
    subtitle: parseOptionalSubtitle(ctx, body),
    slug: String(body.slug ?? ''),
  })

  ctx.setStatus(201)
  ctx.json({ landing_page: landingPage })
}

async function handleReplaceMyLandingPageItems(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/my/landing-pages/:pageId/items')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  ctx.assert(Array.isArray(body.items), 400, 'items must be an array')

  const landingPage = await replaceMyLandingPageItems(
    currentUser.id,
    ctx.params.pageId!,
    body.items as LandingPageItemInput[],
  )

  ctx.json({ landing_page: landingPage })
}

async function handleGetMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/landing-pages/:pageId')

  const landingPage = await getMyLandingPage(currentUser.id, ctx.params.pageId!)
  ctx.json({ landing_page: landingPage })
}

async function handleUpdateMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/landing-pages/:pageId')

  const body = (await ctx.request.json('100kb')) as Record<string, unknown>

  if ('is_default' in body) {
    ctx.assert(body.is_default === true, 422, 'When provided, is_default must be true')
    const extraKeys = Object.keys(body).filter(key => key !== 'is_default')
    ctx.assert(
      extraKeys.length === 0,
      422,
      'Cannot combine is_default with other fields in the same request',
    )
    const landingPage = await setMyLandingPageDefault(currentUser.id, ctx.params.pageId!)
    ctx.json({ landing_page: landingPage })
    return
  }

  const landingPage = await updateMyLandingPage(currentUser.id, ctx.params.pageId!, {
    title: 'title' in body ? String(body.title ?? '') : undefined,
    subtitle: parseOptionalSubtitle(ctx, body),
    slug: 'slug' in body ? String(body.slug ?? '') : undefined,
  })

  ctx.json({ landing_page: landingPage })
}

async function handleDeleteMyLandingPage(ctx: Context) {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/landing-pages/:pageId')

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
