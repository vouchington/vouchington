import {
  createIndividualCard,
  deleteIndividualCardById,
  getIndividualCards,
  updateIndividualCardById,
} from '@services/individuals-households'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { moneySchema } from '@ts-shared/data-points/json-schemas'
import type { Money } from '@ts-shared/money'

export default createManageEntityTool({
  toolName: 'manage_my_cards',
  description:
    "Manage the current user's wallet cards. Use this to add, update, remove, or list cards.",
  addProperties: {
    card_id: {
      type: 'string',
      description: 'The topic UUID of the card to add (required for action=add)',
    },
  },
  listProperties: {
    after: {
      type: 'string',
      description: 'Opaque cursor from the previous list page',
    },
    limit: {
      type: 'number',
      description: 'Number of cards to return, from 1 to 100',
    },
  },
  updateProperties: {
    opened_on: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Date the card was opened in YYYY-MM-DD format',
    },
    closed_on: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Date the card was closed in YYYY-MM-DD format',
    },
    credit_limit: {
      anyOf: [moneySchema, { type: 'null' }],
      description: 'Credit limit in integer minor units paired with its currency',
    },
    note: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'A note about the card',
    },
    is_authorized_user: {
      type: 'boolean',
      description: 'Whether the user is an authorized user on this card',
    },
    authorized_user_of_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Wallet-card UUID of the primary account, or null to clear the relationship',
    },
    received_sign_up_bonus_on: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Date the sign-up bonus was received in YYYY-MM-DD format',
    },
  },
  listFn: (user, args: { action: 'list'; after?: string; limit?: number }) =>
    getIndividualCards(user, user, { after: args.after, limit: args.limit }),
  addFn: (user, args) => createIndividualCard(user, user, args.card_id as string),
  updateFn: (user, args) =>
    updateIndividualCardById(user, user, args.id, {
      opened_on: args.opened_on as string | null | undefined,
      closed_on: args.closed_on as string | null | undefined,
      credit_limit: args.credit_limit as Money | null | undefined,
      note: args.note as string | null | undefined,
      is_authorized_user: args.is_authorized_user as boolean | undefined,
      authorized_user_of_id: args.authorized_user_of_id as string | null | undefined,
      received_sign_up_bonus_on: args.received_sign_up_bonus_on as string | null | undefined,
    }),
  removeFn: (user, id) => deleteIndividualCardById(user, user, id),
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    annotations: { destructiveHint: true },
    api: [
      { method: 'GET', path: '/api/v1/my/cards' },
      { method: 'POST', path: '/api/v1/my/cards' },
      { method: 'PATCH', path: '/api/v1/my/cards/:id' },
      { method: 'DELETE', path: '/api/v1/my/cards/:id' },
    ],
  },
})
