import { getManageableList, type ListItemType, type ListVisibility } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'
import { componentSchema } from './route-response-schema.mts'

export type ListToolFields = {
  name?: string
  description?: string | null
  visibility?: ListVisibility
}

export type ListItemToolArgs = {
  list_id: string
  item_type: ListItemType
  entity_id: string
}

/**
 * The caller of a list write tool and the list it targets. A suspended account is refused first and
 * a list the caller does not own second, so nothing is written for either, as on the REST routes.
 */
export async function getListWriteContext(currentUser: BasicUser, listId: string) {
  const user = await requireActiveToolUser(currentUser)
  return { user, list: await getManageableList(user.id, listId) }
}

export const LIST_ID_PARAMETER = {
  type: 'string',
  format: 'uuid',
  description: 'The ID of a list the current user owns.',
}

/** The fields a list's owner can set, shared by the create and update tools. */
export const LIST_FIELD_PARAMETERS = {
  name: { type: 'string', minLength: 1, maxLength: 255, description: 'The list name.' },
  description: {
    anyOf: [{ type: 'null' }, { type: 'string' }],
    description: 'A description of the list, or null for none.',
  },
  visibility: {
    type: 'string',
    enum: ['private', 'unlisted', 'public'],
    description: 'Who can see the list. Lists are private unless set otherwise.',
  },
}

/** The arguments both item tools take: which list, which kind of item, and its ID. */
export const LIST_ITEM_PARAMETERS = {
  type: 'object',
  properties: {
    list_id: LIST_ID_PARAMETER,
    item_type: {
      type: 'string',
      enum: ['post', 'rss_feed_item'],
      description: 'The kind of item: a post or an RSS feed item.',
    },
    entity_id: { type: 'string', format: 'uuid', description: 'The ID of the post or feed item.' },
  },
  required: ['list_id', 'item_type', 'entity_id'],
  additionalProperties: false,
}

// The REST twins document each body inline, so the tools take the documented entities from the
// generated components. A test pins them to those routes.
export const LIST_RESULT_SCHEMA = successSchema({ list: componentSchema('List') })
export const LIST_ITEM_RESULT_SCHEMA = successSchema({ list_item: componentSchema('ListItem') })
export const SUCCESS_RESULT_SCHEMA = successSchema({})
