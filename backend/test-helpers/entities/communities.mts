import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createRandomString } from '../data.mts'
import type {
  Community,
  CommunityInvite,
  CommunityMemberRosterVisibility,
  CommunityVisibility,
  CommunityListType,
} from '@voucha/types/entities/community'
type InsertTestCommunityOptions = {
  name?: string
  slug?: string
  createdById: string
  visibility?: CommunityVisibility
  member_roster_visibility?: CommunityMemberRosterVisibility
  list_type?: CommunityListType | null
  post_approval_required_at?: Date | null
  allow_review_posts?: boolean
  allow_data_point_posts?: boolean
  member_invites_allowed_at?: Date | null
  trusted_at?: Date | null
  rules_markdown?: string | null
}
export async function insertTestCommunity(options: InsertTestCommunityOptions): Promise<Community> {
  const random = createRandomString(8)
  const name = options.name ?? `Test Community ${random}`
  const slug = options.slug ?? `test-community-${random}`
  const { rows } = await write(
    sql`/* insertTestCommunity */
    INSERT INTO communities (
      name, slug, visibility, member_roster_visibility, list_type,
      post_approval_required_at, allow_review_posts, allow_data_point_posts,
      member_invites_allowed_at, trusted_at, rules_markdown, created_by_id,
      created_via
    )
    VALUES (
      ${name}, ${slug}, ${options.visibility ?? 'public'},
      ${options.member_roster_visibility ?? 'public'}, ${options.list_type ?? null},
      ${options.post_approval_required_at ?? null}, ${options.allow_review_posts ?? false},
      ${options.allow_data_point_posts ?? false}, ${options.member_invites_allowed_at ?? null},
      ${options.trusted_at ?? null}, ${options.rules_markdown ?? null}, ${options.createdById},
      'system'
    )
    RETURNING *
    `,
  )
  const community = rows[0] as Community
  return community
}

export async function hardDeleteTestCommunity(communityId: string): Promise<void> {
  await write(sql`/* hardDeleteTestCommunity */
    DELETE FROM communities WHERE id = ${communityId}::uuid
  `)
}
export {
  insertTestCommunityMember,
  insertTestCommunityMembershipsForUser,
  analyzeCommunityMembershipsForTest,
  removeTestCommunityMember,
  setTestCommunityDigestVacationSuppression,
} from './community-members.mts'
type InsertTestCommunityAgentPromptOptions = {
  communityId: string
  createdById: string
  prompt?: string
  slotAllocated?: boolean
  onFlagAction?: 'none' | 'unpublish'
  deletedAt?: Date | null
  deletedPromptAt?: Date | null
  deletedAgentAt?: Date | null
}
export type TestCommunityAgentPrompt = {
  id: string
  community_id: string
  created_by_id: string
  agent_id: string
  slot_allocated: boolean
  activated_at: Date | null
  deactivated_at: Date | null
  deleted_at: Date | null
  deleted_by_id: string | null
  prompt: string
  model_name: string
  model_provider: string
  created_at: Date
  updated_at: Date
}
export async function insertTestCommunityAgentPrompt(
  options: InsertTestCommunityAgentPromptOptions,
): Promise<TestCommunityAgentPrompt> {
  const { rows } = await write(
    sql`/* insertTestCommunityAgentPrompt */
    WITH prompt_id AS (
      SELECT uuidv7() AS id
    ), new_system_user AS (
      INSERT INTO users (username)
      SELECT 'test-agent-' || RIGHT(REPLACE(p.id::text, '-', ''), 12)
      FROM prompt_id p
      RETURNING id
    ), new_agent AS (
      INSERT INTO agents (system_user_id, agent_type, created_by_id, deleted_at)
      SELECT new_system_user.id, 'moderator', ${options.createdById}, ${options.deletedAgentAt ?? null}
      FROM new_system_user
      RETURNING id
    ), new_prompt AS (
      INSERT INTO agent_prompts (id, agent_id, prompt, model_name, model_provider, created_by_id, deleted_at)
      SELECT p.id, a.id, ${options.prompt ?? 'Test moderation prompt'}, 'gpt-5.4-nano', 'openai', ${options.createdById}, ${options.deletedPromptAt ?? null}
      FROM prompt_id p, new_agent a
      RETURNING *
    ), new_community_prompt AS (
      INSERT INTO community_agent_prompts (id, community_id, created_by_id, slot_allocated, on_flag_action, activated_at, deleted_at)
      SELECT id, ${options.communityId}, ${options.createdById},
        ${options.slotAllocated ?? false},
        ${options.onFlagAction ?? 'none'},
        ${options.slotAllocated ? new Date() : null},
        ${options.deletedAt ?? null}
      FROM new_prompt
      RETURNING *
    )
    SELECT
      ncp.id,
      ncp.community_id,
      ncp.created_by_id,
      ncp.slot_allocated,
      ncp.activated_at,
      ncp.deactivated_at,
      ncp.deleted_at,
      ncp.deleted_by_id,
      np.agent_id,
      np.prompt,
      np.model_name,
      np.model_provider,
      np.created_at,
      np.updated_at
    FROM new_community_prompt ncp
    JOIN new_prompt np ON np.id = ncp.id
    `,
  )
  return rows[0] as TestCommunityAgentPrompt
}

export async function setTestCommunityAgentPromptDeletedAt(
  promptId: string,
  deletedAt: Date | null,
): Promise<void> {
  await write(sql`/* setTestCommunityAgentPromptDeletedAt */
    UPDATE community_agent_prompts
    SET deleted_at = ${deletedAt}
    WHERE id = ${promptId}::uuid
  `)
}

/** Reassigns a community prompt to exercise source-projection reclassification. */
export async function setTestCommunityAgentPromptCommunity(
  promptId: string,
  communityId: string,
): Promise<void> {
  await write(sql`/* setTestCommunityAgentPromptCommunity */
    UPDATE community_agent_prompts
    SET community_id = ${communityId}::uuid
    WHERE id = ${promptId}::uuid
  `)
}

/** Removes only the community extension; the underlying prompt remains active. */
export async function deleteTestCommunityAgentPrompt(promptId: string): Promise<void> {
  await write(sql`/* deleteTestCommunityAgentPrompt */
    DELETE FROM community_agent_prompts
    WHERE id = ${promptId}::uuid
  `)
}

type InsertTestCommunityInviteOptions = {
  communityId: string
  invitedById: string
  code?: string
  invitedUserId?: string
  invitedEmail?: string
  entities?: unknown[]
}

export async function insertTestCommunityInvite(
  options: InsertTestCommunityInviteOptions,
): Promise<CommunityInvite> {
  const code = options.code ?? createRandomString(8)
  const { rows } = await write(
    sql`/* insertTestCommunityInvite */
    INSERT INTO community_invites (community_id, code, invited_user_id, invited_email, invited_by_id)
    VALUES (
      ${options.communityId},
      ${code},
      ${options.invitedUserId ?? null},
      ${options.invitedEmail ?? null},
      ${options.invitedById}
    )
    RETURNING *
    `,
  )
  return rows[0] as CommunityInvite
}
