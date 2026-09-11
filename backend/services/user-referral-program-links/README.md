# @services/user-referral-program-links

Full lifecycle management for user referral program links — create, read, update, activate, delete, with scoping and authorization.

## Key exports

- `createUserReferralProgramLink(currentUserId, input)` — creates a new referral link for the user
- `getUserReferralProgramLink(id)` — retrieves a referral link by ID
- `updateUserReferralProgramLink(currentUserId, id, input)` — updates link metadata
- `activateUserReferralProgramLink(currentUserId, id)` — marks a link as active
- `deleteUserReferralProgramLink(currentUserId, id)` — soft-deletes a link
- `getScopedReferralLinks(currentUserId, scope)` — retrieves links filtered by scope
- `currentUserCanUpdateReferralLink(currentUser, link)` — authorization check

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Prioritized referral links: [../prioritized-referral-links/README.md](../prioritized-referral-links/README.md)
- Referral links requirements: [../../../docs/requirements/users/REFERRAL-LINKS.md](../../../docs/requirements/users/REFERRAL-LINKS.md)
