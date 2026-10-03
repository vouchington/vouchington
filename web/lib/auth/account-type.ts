export { isPlatformAccount } from '@ts-shared/utils/account-type'

export function isAdmin(user: { roles?: readonly string[] } | null | undefined): boolean {
  return !!user?.roles?.includes('administrator')
}

export function isModerationStaff(user: { roles?: readonly string[] } | null | undefined): boolean {
  return !!user?.roles?.includes('administrator') || !!user?.roles?.includes('moderator')
}
