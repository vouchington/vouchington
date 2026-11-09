import { write } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'

// Bearer admission needs current identity, suspension, plan, and rate-limit trust signals.
// Tool execution separately hydrates the full actor from primary at its own authorization point.
export type McpAdmissionUser = Pick<
  PrivateUser,
  | 'id'
  | 'username'
  | 'account_type'
  | 'profile_image_id'
  | 'roles'
  | 'membership_plan'
  | 'verification_status'
  | 'bad_faith_reporter_at'
> & {
  is_suspended: boolean
} & Record<
    | 'facebook_account'
    | 'apple_account'
    | 'google_account'
    | 'x_account'
    | 'linkedin_account'
    | 'microsoft_account'
    | 'github_account',
    boolean
  >

export async function getMcpAdmissionUser(userId: string): Promise<McpAdmissionUser | null> {
  const { rows } = await write<McpAdmissionUser>(
    `/* getMcpAdmissionUser */
    SELECT u.id, u.username, embedded.account_type, u.profile_image_id,
      (SELECT COALESCE(ARRAY_AGG(role_type.slug), ARRAY[]::text[])
       FROM user_roles role
       JOIN user_role_types role_type ON role_type.id = role.role_type_id
       WHERE role.user_id = u.id) AS roles,
      (SELECT paid.plan
       FROM memberships current_membership
       JOIN view_current_paid_memberships paid
         ON paid.membership_id = current_membership.id
       WHERE current_membership.user_id = u.id
         AND current_membership.projection_ended_at IS NULL
       LIMIT 1) AS membership_plan,
      COALESCE((SELECT TRUE FROM user_suspensions
                WHERE user_id = u.id AND lifted_at IS NULL
                ORDER BY reason LIMIT 1), FALSE) AS is_suspended,
      u.verification_status, u.bad_faith_reporter_at,
      EXISTS (SELECT 1 FROM facebook_accounts WHERE user_id = u.id) AS facebook_account,
      EXISTS (SELECT 1 FROM apple_accounts WHERE user_id = u.id) AS apple_account,
      EXISTS (SELECT 1 FROM google_accounts WHERE user_id = u.id) AS google_account,
      EXISTS (SELECT 1 FROM x_accounts WHERE user_id = u.id) AS x_account,
      EXISTS (SELECT 1 FROM linkedin_accounts WHERE user_id = u.id) AS linkedin_account,
      EXISTS (SELECT 1 FROM microsoft_accounts WHERE user_id = u.id) AS microsoft_account,
      EXISTS (SELECT 1 FROM github_accounts WHERE user_id = u.id) AS github_account
    FROM users u
    JOIN view_embedded_users embedded ON embedded.id = u.id
    WHERE u.id = $1::uuid AND u.deleted_at IS NULL
    LIMIT 1
  `,
    [userId],
  )
  return rows[0] ?? null
}
