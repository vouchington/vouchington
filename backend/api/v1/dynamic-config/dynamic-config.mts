import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  DynamicConfigValidationError,
  currentUserCanAccessDynamicConfigNamespace,
  getDynamicConfigRegistryEntry,
  getDynamicConfigNamespace,
  listDynamicConfigNamespaceHistory,
  listDynamicConfigNamespaces,
  updateDynamicConfigNamespace,
} from '@services/dynamic-config-admin'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'

app.route('/api/v1/dynamic-config/namespaces').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/dynamic-config/namespaces')
  ctx.json({ namespaces: await listDynamicConfigNamespaces(currentUser) })
})

app.route('/api/v1/dynamic-config/namespaces/:namespace/history').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/dynamic-config/namespaces/:namespace/history',
  )
  const namespace = ctx.params.namespace!
  const entry = getDynamicConfigRegistryEntry(namespace)
  ctx.assert(entry, 404, 'Dynamic config namespace not found')
  ctx.assert(
    currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view'),
    403,
    'Forbidden',
  )

  const history = await listDynamicConfigNamespaceHistory(currentUser, namespace)
  ctx.json({ history })
})

app.route('/api/v1/dynamic-config/namespaces/:namespace').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/dynamic-config/namespaces/:namespace')
  const namespace = ctx.params.namespace!
  const entry = getDynamicConfigRegistryEntry(namespace)
  ctx.assert(entry, 404, 'Dynamic config namespace not found')
  ctx.assert(
    currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view'),
    403,
    'Forbidden',
  )

  const dynamicConfigNamespace = await getDynamicConfigNamespace(currentUser, namespace)
  ctx.json({ namespace: dynamicConfigNamespace })
})

app.route('/api/v1/dynamic-config/namespaces/:namespace').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/dynamic-config/namespaces/:namespace')
  const namespace = ctx.params.namespace!
  const entry = getDynamicConfigRegistryEntry(namespace)
  ctx.assert(entry, 404, 'Dynamic config namespace not found')
  ctx.assert(
    currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update'),
    403,
    'Forbidden',
  )

  const body = await parseJsonBody<{ config?: Record<string, unknown> }>(ctx)
  ctx.assert(
    body?.config && typeof body.config === 'object' && !Array.isArray(body.config),
    400,
    'Missing config object',
  )
  try {
    const result = await updateDynamicConfigNamespace(currentUser, namespace, body.config)
    ctx.json({ namespace: result!.namespace, changed: result!.changed })
  } catch (error) {
    if (error instanceof DynamicConfigValidationError) {
      ctx.throw(400, error.message)
    }
    throw error
  }
})
