import type { Context } from '@jongleberry/api-server'
import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getSiteUrl } from '@modules/utils'
import {
  completeNativeBlueskyAccountLink,
  resolveNativeBlueskyCallbackFailure,
} from '@services/bluesky-accounts'
import { createNativeCompletionToken } from '@services/bluesky-accounts/native-completion-token'
import { getErrorResponseCode, getErrorStatus } from '../../error-response.mts'

const BLUESKY_LINK_UI_PATH = '/my/identity'

export function redirectToLinkUi(ctx: Context, query: Record<string, string>): void {
  const url = new URL(getSiteUrl(BLUESKY_LINK_UI_PATH))
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  redirect(ctx, url)
}

export async function completeNativeCallback(
  ctx: Context,
  params: URLSearchParams,
  flowId: string,
): Promise<void> {
  const { token, tokenHash } = createNativeCompletionToken(flowId)
  try {
    await completeNativeBlueskyAccountLink(params, flowId, tokenHash)
    redirectToNativeApp(ctx, { flow_id: flowId, completion_token: token })
  } catch (error) {
    const outcome = await resolveNativeBlueskyCallbackFailure(flowId, tokenHash)
    if (outcome === 'completed') {
      redirectToNativeApp(ctx, { flow_id: flowId, completion_token: token })
      return
    }
    reportBlueskyCallbackError(error, { mode: 'native', flowId })
    redirectToNativeApp(ctx, { flow_id: flowId, bluesky_error: getBlueskyCallbackErrorCode(error) })
  }
}

function redirectToNativeApp(ctx: Context, query: Record<string, string>): void {
  const url = new URL('voucha://auth/bluesky/callback')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  redirect(ctx, url)
}

function redirect(ctx: Context, url: URL): void {
  ctx.setStatus(302)
  ctx.set('Location', url.toString())
  ctx.response.empty()
}

export function getBlueskyCallbackErrorCode(error: unknown): string {
  const status = getErrorStatus(error)
  if (getErrorResponseCode(error, status) === ACCOUNT_SUSPENDED) return 'account_suspended'
  if (status === 400) return 'invalid_request'
  if (status === 401) return 'not_logged_in'
  if (status === 403) return 'session_mismatch'
  if (status === 404) return 'session_expired'
  if (status === 409) return 'already_linked'
  return 'unknown'
}

export function reportBlueskyCallbackError(
  error: unknown,
  context: { mode: 'web' | 'native'; flowId?: string; authenticatedUserId?: string | null },
): void {
  const reportableError: Error & {
    extra?: Record<string, unknown> | null
    status?: number
    tags?: Record<string, string | number | boolean> | null
  } = error instanceof Error ? error : createHttpError(getErrorStatus(error), String(error))
  Object.assign(reportableError, {
    tags: { ...(reportableError.tags ?? {}), route: 'auth-bluesky-callback', mode: context.mode },
    extra: {
      ...(reportableError.extra ?? {}),
      ...(context.flowId ? { flowId: context.flowId } : {}),
      ...(context.authenticatedUserId ? { authenticatedUserId: context.authenticatedUserId } : {}),
    },
  })
  onError(reportableError)
}
