import type { Tool } from '@voucha/tools/types'

type UserForRoleCheck = {
  id: string
  roles: readonly string[]
}

export function isToolAllowedForUser(tool: Tool, user: UserForRoleCheck): boolean {
  if (!tool.roles) return true
  for (const role of user.roles) {
    if (tool.roles[role] === true) return true
  }
  return tool.roles.user === true
}
