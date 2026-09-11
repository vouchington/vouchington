/**
 * Query-time membership filter for child referral links (decision #4's authoritative backstop
 * for downgrade/expiry removal -- see the plan's § Query-time membership filter). A child row
 * (`parent_link_id IS NOT NULL`) is visible only while its owner currently holds an active
 * Plus/Pro membership.
 *
 * `view_current_paid_memberships` owns the authoritative lifecycle and family-evidence checks;
 * this predicate only limits that eligibility to Plus/Pro. Eager membership-hook removal in
 * `@services/memberships` is cleanup, not the source of truth.
 *
 * Returns a raw SQL fragment (no bound parameters -- `now()` is a SQL builtin) meant to be
 * `.append()`-ed into a caller's own `sql` template alongside its own alias. Callers pass their
 * own column references (e.g. `al.parent_link_id` / `al.user_id`, or `urpl2.parent_link_id` /
 * `urpl2.user_id`) so the same predicate applies verbatim to every surface and every correlated
 * subquery that must not pick a hidden child as its representative row.
 */
export function childVisibilitySql(parentLinkIdColumn: string, ownerUserIdColumn: string): string {
  return `(
    ${parentLinkIdColumn} IS NULL OR EXISTS (
      SELECT 1 FROM view_current_paid_memberships membership
      WHERE membership.user_id = ${ownerUserIdColumn}
        AND membership.plan IN ('plus', 'pro')
    )
  )`
}
