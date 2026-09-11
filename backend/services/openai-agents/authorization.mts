type ToolRolesConstraint = {
  schema: { name: string }
  roles?: Partial<Record<string, boolean>>
}

type UserWithRoles = {
  id: string
  roles: readonly string[]
}

export function assertToolAllowedForUser(tool: ToolRolesConstraint, user: UserWithRoles): void {
  if (!tool.roles) return
  for (const role of user.roles) {
    if (tool.roles[role] === true) return
  }
  if (tool.roles.user === true) return
  const role = user.roles.length > 0 ? user.roles.join(',') : 'user'
  throw new Error(
    `Tool ${tool.schema.name} is not allowed for role ${role} (currentUser ${user.id})`,
  )
}
