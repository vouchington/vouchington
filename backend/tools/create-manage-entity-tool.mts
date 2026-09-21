import type { BasicUser, PrivateUser } from '@services/users/types'
import type { Tool, ToolMeta } from './types.mts'
import { requirePrivateToolUser } from './private-user.mts'
import createHttpError from 'http-errors'

type AddArgs<TAdd extends Record<string, unknown>> = { action: 'add' } & TAdd
type UpdateArgs<TUpdate extends Record<string, unknown>> = {
  action: 'update'
  id: string
} & Partial<TUpdate>
type RemoveArgs = { action: 'remove'; id: string }
type ManageEntityArgs<
  TAdd extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>,
> = AddArgs<TAdd> | UpdateArgs<TUpdate> | RemoveArgs

type ManageEntityResult = { success: true; result: unknown }

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
  meta?: ToolMeta
}

// NOTE: Tools created via this factory are not inspected by the tool-conventions
// current-user policy (which only analyzes ObjectLiteralExpression initializers).
// Convention: the `function` property MUST keep `currentUser: BasicUser` as its first
// parameter and this file is the sole source of truth for that contract.
export function createManageEntityTool<
  TAdd extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>,
>(
  config: ManageEntityToolConfig<TAdd, TUpdate>,
): Tool<ManageEntityArgs<TAdd, TUpdate>, ManageEntityResult> {
  return {
    schema: {
      name: config.toolName,
      type: 'function',
      description: config.description,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'update', 'remove'],
            description: 'The operation to perform.',
          },
          id: {
            type: 'string',
            description: 'Required for update and remove actions.',
          },
          ...config.addProperties,
          ...config.updateProperties,
        },
        required: ['action'],
      },
      strict: null,
    },
    ...(config.meta ? { meta: config.meta } : {}),
    function:
      (currentUser: BasicUser) =>
      async (args: ManageEntityArgs<TAdd, TUpdate>): Promise<ManageEntityResult> => {
        const user = await requirePrivateToolUser(currentUser)

        switch (args.action) {
          case 'add': {
            const result = await config.addFn(user, args)
            return { success: true, result }
          }
          case 'update': {
            if (!args.id) throw createHttpError(422, 'id is required for update')
            const result = await config.updateFn(user, args)
            return { success: true, result }
          }
          case 'remove': {
            if (!args.id) throw createHttpError(422, 'id is required for remove')
            const result = await config.removeFn(user, args.id)
            return { success: true, result }
          }
          default:
            throw unsupportedAction(args)
        }
      },
  }
}

function unsupportedAction(args: never): Error {
  const action = (args as { action?: unknown }).action
  return createHttpError(422, `Unsupported action: ${String(action)}`)
}
