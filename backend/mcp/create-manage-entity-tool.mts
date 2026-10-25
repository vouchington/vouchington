import type { BasicUser, PrivateUser } from '@services/users/types'
import type {
  Tool,
  ToolInvocationContext,
  ToolMeta,
  ToolOutputSchema,
} from '@services/openai-agents/tool-types'
import {
  createManageEntityTool as createPackageManageEntityTool,
  type ManageEntityArgs,
  type ManageEntityResult,
} from '@vouchington/mcp-server/tools'
import { requireActiveToolUser } from './private-user.mts'
import { componentSchema } from './route-response-schema.mts'

type AddArgs<TAdd extends Record<string, unknown>> = Extract<
  ManageEntityArgs<TAdd, Record<string, unknown>>,
  { action: 'add' }
>
type UpdateArgs<TUpdate extends Record<string, unknown>> = Extract<
  ManageEntityArgs<Record<string, unknown>, TUpdate>,
  { action: 'update' }
>

type ManageEntityToolConfig<
  TAdd extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>,
> = {
  toolName: string
  description: string
  addProperties: Record<string, unknown>
  updateProperties: Record<string, unknown>
  addFn: (user: PrivateUser, args: AddArgs<TAdd>) => Promise<unknown>
  updateFn: (user: PrivateUser, args: UpdateArgs<TUpdate>) => Promise<unknown>
  removeFn: (user: PrivateUser, id: string) => Promise<unknown>
  // The generated contract component that `addFn` and `updateFn` return, which the output schema is
  // derived from. Required with `meta`.
  entity?: string
  meta?: Omit<ToolMeta, 'outputSchema'>
}

// Binds the active-user check and the generated contract component to the package tool.
export function createManageEntityTool<
  TAdd extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>,
>({
  entity,
  ...config
}: ManageEntityToolConfig<TAdd, TUpdate>): Tool<
  ManageEntityArgs<TAdd, TUpdate>,
  ManageEntityResult
> {
  return createPackageManageEntityTool<
    TAdd,
    TUpdate,
    BasicUser,
    PrivateUser,
    ToolInvocationContext,
    ToolMeta
  >({
    ...config,
    requireUser: requireActiveToolUser,
    ...(entity ? { entitySchema: componentSchema(entity) as ToolOutputSchema } : {}),
  })
}
