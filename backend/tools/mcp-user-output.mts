import type { PublicUser } from '@services/users/types'
import {
  externalText,
  pageProperties,
  sanitizedTitle,
  type McpPage,
  type McpPageLimit,
} from './mcp-read-output.mts'
import { componentSchema } from './route-response-schema.mts'
import { closedObject } from './read-tool-output-schema.mts'

/** `search_users` pages like `GET /api/v1/users?q=`: 25 at most, 10 by default. */
export const USER_PAGE_LIMIT: McpPageLimit = { min: 1, max: 25, default: 10 }

export const USER_NOT_FOUND = { success: false, error: 'User not found' } as const

const USER_FIELDS = [
  'id',
  'username',
  'markdown',
  'verification_status',
  'verified_badge_visible',
  'verified_display_name',
  'is_official_account',
] as const

/**
 * One user's public profile as an MCP client receives it. The shape is the signed-out view:
 * `view_users_public` already hides the verification fields unless the user chose to show the
 * badge, and no contact detail, role, provider account or moderation field is ever selected here.
 */
export type McpUser = {
  id: string
  username: string | null
  markdown: string | null
  verification_status: NonNullable<PublicUser['verification_status']> | null
  verified_badge_visible: boolean | null
  verified_display_name: string | null
  is_official_account: boolean
}

export type McpUsersPage = McpPage<McpUser>

export async function toMcpUser(user: PublicUser): Promise<McpUser> {
  const [username, markdown, verifiedDisplayName] = await Promise.all([
    user.username ? sanitizedTitle(user.username) : null,
    externalText(user.markdown ?? null, 'user', 'user_bio'),
    user.verified_display_name ? sanitizedTitle(user.verified_display_name) : null,
  ])
  return {
    id: user.id,
    username,
    markdown,
    verification_status: user.verification_status ?? null,
    verified_badge_visible: user.verified_badge_visible ?? null,
    verified_display_name: verifiedDisplayName,
    is_official_account: user.is_official_account ?? false,
  }
}

/** The public user schema of the generated REST contract: `PublicUser` is a map value there. */
function publicUserProperties(): Record<string, Record<string, unknown>> {
  const entry = componentSchema('Record_string_PublicUser')['additionalProperties'] as {
    properties: Record<string, Record<string, unknown>>
  }
  return entry.properties
}

/** The schema of an `McpUser`, from the generated public user contract. */
export function mcpUserSchema() {
  const properties = publicUserProperties()
  const pick = (key: (typeof USER_FIELDS)[number]) => {
    const schema = properties[key]
    if (!schema) throw new Error(`The PublicUser contract has no "${key}" property.`)
    return schema
  }
  return closedObject(Object.fromEntries(USER_FIELDS.map(key => [key, pick(key)])))
}

export const usersPageProperties = () => pageProperties(mcpUserSchema())
