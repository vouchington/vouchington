let signedIn = true
let membershipPlan: 'plus' | 'pro' | null = 'pro'

export function setStorybookMembership(
  user: { membership_plan?: 'plus' | 'pro' | null } | null,
): void {
  signedIn = user != null
  membershipPlan = user?.membership_plan ?? null
}

export function storybookMembershipHidden(): boolean {
  return !signedIn || membershipPlan === 'plus' || membershipPlan === 'pro'
}
