import { write } from '@data-stores/psql'

// Removes a role from a user, to simulate an administrator demoted after a token was issued. Raw
// primitive like addTestUserRole: it omits the JWT-staleness side effect of the real service.
export async function removeTestUserRole(userId: string, roleSlug: string): Promise<void> {
  await write(
    `/* removeTestUserRole */ DELETE FROM user_roles
     WHERE user_id = $1
       AND role_type_id = (SELECT id FROM user_role_types WHERE slug = $2)`,
    [userId, roleSlug],
  )
}
