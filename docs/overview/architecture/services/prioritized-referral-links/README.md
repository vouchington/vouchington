# @services/prioritized-referral-links

Source entrypoint: [backend/services/prioritized-referral-links/README.md](../../../../../backend/services/prioritized-referral-links/README.md)

Retrieves prioritized referral links for display, ordered across six priority groups with authorization checks.

## Key exports

- `getPrioritizedReferralLinks(currentUserId, options)` — returns the ordered list of referral links for a user or context, applying the six-group prioritization algorithm
- `currentUserCanViewPrioritizedReferralLinks(currentUser, context)` — authorization check

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- User referral program links: [../user-referral-program-links/README.md](../user-referral-program-links/README.md)
- Referral links requirements: [../../../docs/requirements/users/REFERRAL-LINKS.md](../../../../requirements/users/REFERRAL-LINKS.md)
