# Product-Safety / Recall Handling Runbook

> **Status: forward-looking draft.**
> No marketplace or physical-product entity exists in the platform today. This runbook applies as
> product-safety surfaces ship. Until then, product-safety and recall reports arrive via the
> `illegal_content` or `other` report reasons under the existing moderation flow.

See also:
[Moderation Policy Matrix](../requirements/moderation/MODERATION-POLICY-MATRIX.md) •
[Moderation Flows](../requirements/moderation/MODERATION-FLOWS.md)

---

## Purpose and Scope

This runbook covers **product-safety incidents and manufacturer/regulatory recalls** — situations
where content on the platform promotes, sells, or links to a product that has been recalled or poses
a verified safety risk.

Scope:

- Official recalls announced by CPSC, FDA, NHTSA, USDA, or equivalent.
- Third-party safety alerts from manufacturers or consumer-safety organizations.
- User reports of serious injury or illness linked to a product featured on the platform.

This runbook does **not** cover general misinformation about product quality. See
[Moderation Flows](../requirements/moderation/MODERATION-FLOWS.md) for the standard moderation pipeline.

---

## Current State (Pre-Marketplace)

The platform has **no product or marketplace entity type** today. Until one ships:

- Recall-related content surfaces as posts or links in the existing feed.
- Reports are filed under `illegal_content` (if the product is unlawfully sold post-recall) or
  `other`.
- There is **no dedicated `product_safety` or `recall` policy entry** in the Moderation Policy
  Matrix.

When a marketplace surface ships, a `product_safety` entry should be added to
`ts-shared/utils/moderation-policy.mts` (the single source of truth) and this runbook updated to
cross-link that row.

---

## Intake

Product-safety incidents may arrive via:

| Channel                                   | Action                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| User report (`illegal_content` / `other`) | Standard moderation queue; triage against recall sources                               |
| Direct report to trust & safety team      | Log in internal incident tracker _(placeholder)_                                       |
| Regulatory notification (CPSC/FDA alert)  | Safety lead monitors official recall feeds _(placeholder: link to monitoring process)_ |
| Media / press inquiry                     | Route to comms lead immediately                                                        |

---

## Triage

1. **Verify the recall.** Cross-reference official sources before acting:
   - US Consumer Product Safety Commission — https://www.cpsc.gov/Recalls
   - US FDA recalls — https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts
   - NHTSA vehicle recalls — https://www.nhtsa.gov/recalls
   - USDA FSIS food recalls — https://www.fsis.usda.gov/recalls
   - Manufacturer announcements _(confirm with legal counsel for non-US recalls)_
2. **Assess severity.** Is there a verified safety risk or injury? Is the product actively promoted
   or sold via the platform?
3. **Assign incident lead.** _(placeholder: role)_ is the default incident lead for product-safety
   incidents.

---

## Cross-Functional Contacts

| Role                | Contact         | When to Engage                                               |
| ------------------- | --------------- | ------------------------------------------------------------ |
| Safety lead         | _(placeholder)_ | Immediately on any confirmed recall                          |
| Legal counsel       | _(placeholder)_ | Before taking enforcement action or communicating externally |
| Communications lead | _(placeholder)_ | If incident is or may become public-facing                   |
| Engineering oncall  | _(placeholder)_ | If bulk content removal or data export is needed             |
| Product manager     | _(placeholder)_ | If marketplace features need to be gated or paused           |

---

## Containment and Enforcement

Use existing moderation enforcement actions:

1. **Remove or hide** specific posts/links promoting the recalled product. Use the community
   moderation queue (`backend/services/communities/publications/moderation-queue.mts`) for
   community-level posts; platform staff enforcement for cross-platform.
2. **Block the product URL/hostname** if a seller domain is identified — use the hostname blocking
   flow (`PATCH /api/v1/hostnames/:id` or the `/domain/<hostname>` Moderation tab), which marks the
   domain and subdomains as blocked and soft-deletes URL relations. Note: `url_hostname` is the
   moderation-report entity type for reporting against a hostname; it does not itself block the
   domain.
3. **Suspend the seller account** if the account is primarily engaged in selling the recalled
   product.
4. Document all enforcement actions in the modlog.

---

## Communications

| Audience             | Template                               | Owner               |
| -------------------- | -------------------------------------- | ------------------- |
| Affected users       | _(placeholder: notification template)_ | Communications lead |
| Platform-wide notice | _(placeholder: banner/announcement)_   | Product + Comms     |
| Regulator / press    | _(placeholder: statement template)_    | Legal + Comms       |

Do not communicate externally before legal counsel has reviewed the message.

---

## After-Action and Audit

1. Modlog entries for all enforcement actions.
2. Incident summary document: timeline, affected content volume, enforcement steps, external
   notifications sent.
3. Post-incident review within 14 days.
4. If the recall reveals a systemic platform gap (e.g., a product category that needs proactive
   monitoring), file a follow-up issue.

---

## Known Gaps

- **No product/marketplace entity type.** Recall enforcement today is ad-hoc; no dedicated
  `product_safety` policy row exists.
- **No recall-feed integration.** CPSC/FDA/NHTSA monitoring is manual.
- **No automated affected-user query.** Identifying users who interacted with recalled-product
  content requires a custom data query.

These gaps should be addressed as marketplace surfaces are designed and shipped.
