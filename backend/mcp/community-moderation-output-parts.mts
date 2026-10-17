import { componentSchema } from './route-response-schema.mts'
import type { ToolOutputSchema } from '@services/openai-agents/tool-types'

export type Schema = Record<string, unknown>
export const text: Schema = { type: 'string' }
export const number: Schema = { type: 'number' }
export const boolean: Schema = { type: 'boolean' }
export const nullOr = (value: Schema): Schema => ({ anyOf: [value, { type: 'null' }] })
export const array = (items: Schema): Schema => ({ type: 'array', items })
export const map = (value: Schema): Schema => ({ type: 'object', additionalProperties: value })
export const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): ToolOutputSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})
export const component = (name: string): ToolOutputSchema =>
  componentSchema(name) as ToolOutputSchema
export const reference = (kind: string): Schema =>
  object({ __entity_type: { const: kind }, id: text })
export const pageInfo = () => component('PageInfo')

/** A component-backed entity with only explicitly listed REST-added/omitted fields. */
export function changeComponent(
  name: string,
  add: Record<string, Schema> = {},
  omit: readonly string[] = [],
): ToolOutputSchema {
  const schema = component(name)
  const properties = Object.fromEntries(
    Object.entries(schema['properties'] as Record<string, Schema>).filter(
      ([key]) => !omit.includes(key),
    ),
  )
  return {
    ...schema,
    properties: { ...properties, ...add },
    required: [
      ...((schema['required'] as string[] | undefined) ?? []).filter(key => !omit.includes(key)),
      ...Object.keys(add),
    ],
  }
}

export const ban = (): Schema =>
  object({
    id: text,
    community_id: text,
    user_id: text,
    banned_by_id: nullOr(text),
    reason: nullOr(text),
    expires_at: nullOr(text),
    created_at: text,
    updated_at: text,
    lifted_at: nullOr(text),
    lifted_by_id: nullOr(text),
  })
export const restriction = (): Schema =>
  object({
    id: text,
    community_id: text,
    restriction_type: {
      enum: ['require_post_approval', 'no_new_member_posts', 'no_links', 'approved_members_only'],
    },
    activated_by_id: nullOr(text),
    activated_at: text,
    expires_at: nullOr(text),
    created_at: text,
    updated_at: text,
    lifted_at: nullOr(text),
    lifted_by_id: nullOr(text),
    reason: nullOr(text),
  })
