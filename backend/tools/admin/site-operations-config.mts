import assert from 'http-assert'
import createHttpError from 'http-errors'
import {
  DynamicConfigValidationError,
  listDynamicConfigNamespaces,
  getDynamicConfigNamespace,
  listDynamicConfigNamespaceHistory,
  updateDynamicConfigNamespace,
} from '@services/dynamic-config-admin'
import { adminInput, createAdminTool, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const listApi = { method: 'GET', path: '/api/v1/dynamic-config/namespaces' } as const
const listConfig = createAdminTool<Record<string, never>>({
  name: 'list_dynamic_config_namespaces',
  description: 'List registered dynamic configuration namespaces.',
  scope: 'site-operations:read',
  api: listApi,
  parameters: adminInput({}),
  outputSchema: adminRouteOutputSchema(listApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async user => ({ namespaces: listDynamicConfigNamespaces(user) }),
})
const getApi = { method: 'GET', path: '/api/v1/dynamic-config/namespaces/:namespace' } as const
const getConfig = createAdminTool<{ namespace: string }>({
  name: 'get_dynamic_config_namespace',
  description: 'Read one registered dynamic configuration namespace.',
  scope: 'site-operations:read',
  api: getApi,
  parameters: adminInput({ namespace: TEXT_INPUT }, ['namespace']),
  outputSchema: adminRouteOutputSchema(getApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const namespace = await getDynamicConfigNamespace(user, args.namespace)
    assert(namespace, 404, 'Dynamic config namespace not found')
    return { namespace }
  },
})
const historyApi = {
  method: 'GET',
  path: '/api/v1/dynamic-config/namespaces/:namespace/history',
} as const
const history = createAdminTool<{ namespace: string }>({
  name: 'list_dynamic_config_history',
  description: 'Read the most recent 50 changes in one registered configuration namespace.',
  scope: 'site-operations:read',
  api: historyApi,
  parameters: adminInput({ namespace: TEXT_INPUT }, ['namespace']),
  outputSchema: adminRouteOutputSchema(historyApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const history = await listDynamicConfigNamespaceHistory(user, args.namespace)
    assert(history, 404, 'Dynamic config namespace not found')
    return { history }
  },
})
const updateApi = { method: 'PATCH', path: '/api/v1/dynamic-config/namespaces/:namespace' } as const
const update = createAdminTool<{ namespace: string; config: Record<string, unknown> }>({
  name: 'update_dynamic_config_namespace',
  description:
    'Update validated fields in a registered configuration namespace. Only changed values create history.',
  scope: 'site-operations:config',
  api: updateApi,
  parameters: adminInput(
    { namespace: TEXT_INPUT, config: { type: 'object', additionalProperties: true } },
    ['namespace', 'config'],
  ),
  outputSchema: adminRouteOutputSchema(updateApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async (user, args) => {
    try {
      const result = await updateDynamicConfigNamespace(user, args.namespace, args.config)
      assert(result, 404, 'Dynamic config namespace not found')
      return { namespace: result.namespace, changed: result.changed }
    } catch (err) {
      if (err instanceof DynamicConfigValidationError)
        throw createHttpError(400, err.message, { cause: err })
      throw err
    }
  },
})
export const adminConfigTools = [listConfig, getConfig, history, update]
