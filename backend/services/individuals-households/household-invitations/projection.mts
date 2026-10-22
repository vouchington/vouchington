import sql from 'sql-template-strings'

export const invitationColumns = sql`
  hi.id, hi.household_id, hi.invited_user_id, hi.invited_by_id, hi.relationship,
  hi.accepted_at, hi.declined_at, hi.revoked_at, hi.created_at, hi.updated_at,
  json_build_object('id', hi.invited_user_id, 'username', invited_user.username) AS invited_user,
  json_build_object('id', hi.invited_by_id, 'username', inviter.username) AS invited_by,
  json_build_object('id', household.owner_user_id, 'username', owner.username) AS household_owner`

export const invitationJoins = sql`
  JOIN households household ON household.id = hi.household_id
  LEFT JOIN users invited_user ON invited_user.id = hi.invited_user_id
  LEFT JOIN users inviter ON inviter.id = hi.invited_by_id
  LEFT JOIN users owner ON owner.id = household.owner_user_id`
