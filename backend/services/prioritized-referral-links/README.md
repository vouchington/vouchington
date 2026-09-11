# @services/prioritized-referral-links

Retrieves prioritized referral links for display, ordered across six priority groups with authorization checks.

## Key exports

- `getPrioritizedReferralLinks(currentUserId, options)` — returns the ordered list of referral links for a user or context, applying the six-group prioritization algorithm
- `currentUserCanViewPrioritizedReferralLinks(currentUser, context)` — authorization check

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- User referral program links: [../user-referral-program-links/README.md](../user-referral-program-links/README.md)
- Referral links requirements: [../../../docs/requirements/users/REFERRAL-LINKS.md](../../../docs/requirements/users/REFERRAL-LINKS.md)
