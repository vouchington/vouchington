export { isOfficialAccount } from '@ts-shared/utils/official-account'

export function isAdmin(user: { roles?: readonly string[] } | null | undefined): boolean {
  return !!user?.roles?.includes('administrator')
}

export function isModerationStaff(user: { roles?: readonly string[] } | null | undefined): boolean {
  return !!user?.roles?.includes('administrator') || !!user?.roles?.includes('moderator')
}
