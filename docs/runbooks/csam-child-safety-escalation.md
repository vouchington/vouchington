# CSAM / Child-Safety Escalation Runbook

> **Status: draft — pending legal sign-off.**
> US-law specifics are provided as a working template. Every item marked
> _(confirm with legal counsel)_ must be validated against the org's actual legal entity,
> jurisdiction, and registered accounts before this runbook is used in production.

See also:
[Moderation Policy Matrix](../requirements/moderation/MODERATION-POLICY-MATRIX.md) •
[Moderation Flows](../requirements/moderation/MODERATION-FLOWS.md) •
[Report Judgements](../requirements/moderation/REPORT-JUDGEMENTS.md)

---

## Purpose and Scope

This runbook covers **child sexual abuse material (CSAM) and child-safety incidents** — the
highest-severity category on the platform. These map to the `illegal_content` policy entry
(severity `critical`, advisory action `escalate`) and the `sexual_content` entry when content
involves a minor (severity `high`, advisory action `remove`; treat as `critical` when a minor is
confirmed or reasonably suspected).

Scope:

- Any CSAM discovered on platform (posts, comments, user-uploaded media, profile images).
- Any `sexual_content` AI flag where a minor is involved or suspected.
- Any moderator escalation citing child-safety concerns.

---

## Detection and Triggers

The platform surfaces child-safety incidents through several overlapping signals:

| Signal                          | Source                                                                                                       | Notes                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `illegal_content` report reason | User report → `moderation_report_reason` enum                                                                | CSAM described in label: "including CSAM, fraud, incitement" |
| AI judgement `escalate`         | `backend/agents/report-judgement/model.mts:49` — `"escalate": ... (e.g. legal risk, CSAM, credible threats)` | Advisory only; raises severity sort rank                     |
| OpenAI `sexual/minors` flag     | `backend/services/openai-moderation/`                                                                        | Closest automated child-safety signal available today        |
| Manual moderator escalation     | `backend/services/moderation-threads/escalate.mts`                                                           | Sets `escalated_at`; opens internal senior-mod thread        |

**Important caveat — OpenAI image auto-removal:** `backend/services/openai-moderation/images.mts`
**automatically deletes** images flagged by OpenAI (including `sexual/minors`). If a CSAM report
surfaces via that signal, the original image may already be gone before staff reviews it. This
creates an evidence-retention gap: the original content needed for NCMEC reporting may not be
recoverable from the platform. When the detection signal is an OpenAI image flag, check the media
storage layer immediately — the deletion may have already occurred.

**No other signal triggers automatic containment or external reporting.** For non-image content
(posts, comments, user profiles, links), all containment is manual, out-of-band, and must follow
this runbook.

---

## Immediate Containment and Evidence Preservation

Act within minutes of detection.

1. **Restrict access.** Use existing moderation enforcement (remove post / hide content) to prevent
   further public access. Do not wait for supervisor approval before restricting.
2. **Do not redistribute.** _(confirm with legal counsel)_ Do not download, copy, forward, or share
   the content beyond the minimum necessary to identify it for reporting. 18 U.S.C. §2258A prohibits
   providers from further distributing apparent CSAM.
3. **Preserve content and metadata.** _(confirm with legal counsel)_ Do NOT delete the content
   before reporting. Preserve:
   - The original content (URL, storage key, checksum).
   - Associated metadata: uploader account, upload timestamp, IP addresses, session data.
   - Any user reports filed against the content.
   - Audit log entries (modlog).
4. **Do not contact the subject account.** Do not warn, notify, or communicate with the account
   holder before law-enforcement authorities are notified.
5. **Record the incident.** Create a modlog entry. Note the detection signal, containment time, and
   which staff member took action.

---

## Reporting Obligations (US Law Template)

> _(confirm with legal counsel)_ The following reflects US federal law as of 2024. Confirm your org's
> reporting account, designated reporter, and any additional state obligations before acting.

**Mandatory reporting obligation — 18 U.S.C. §2258A**

Any electronic communication service provider or remote computing service provider that obtains
**actual knowledge** of apparent violations of the federal child pornography statutes
(18 U.S.C. §§2251, 2251A, 2252, 2252A, 2252B, 2260) or child sex trafficking involving a minor
(18 U.S.C. §1591) or online enticement (18 U.S.C. §2422(b)) **shall**, as soon as reasonably
possible, make a report to the **NCMEC CyberTipline**.

| Requirement             | Detail                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Report to**           | NCMEC CyberTipline — https://report.cybertip.org (for registered providers) or https://www.missingkids.org/gethelpnow/cybertipline _(confirm org has a registered provider account)_ |
| **When**                | "As soon as reasonably possible" after obtaining actual knowledge (§2258A(a)(1)(A)(i))                                                                                               |
| **Preservation period** | 1 year after CyberTipline submission (§2258A; amended 2024 — do not use the old 90-day figure)                                                                                       |
| **No redistribution**   | Provider must not further distribute the reported content except as permitted by law                                                                                                 |
| **Designated reporter** | _(placeholder: name/role of the person authorized to submit CyberTipline reports for this org)_                                                                                      |

**Who to contact at the org:** _(placeholder: on-call safety lead, legal counsel, CEO/VP contact info)_

---

## Notify and Escalate

Immediately after containment, notify in order:

1. **Safety lead** — _(placeholder: name, contact, on-call channel)_
2. **Legal counsel** — _(placeholder: name, contact)_ — Engage immediately; do NOT wait for
   legal sign-off before filing if counsel is unreachable. The mandatory report must be filed "as
   soon as reasonably possible" (§2258A). The designated reporter _(placeholder: name/role)_ may
   proceed without legal approval if counsel cannot be reached within 2 hours of discovery.
3. **Engineering (if data preservation needs technical work)** — _(placeholder: oncall channel)_
4. **Executive sponsor** — _(placeholder: name)_

Do not discuss the incident over unencrypted channels or in public-facing systems.

---

## Timeline and SLA

| Step                           | Target                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Content restricted / hidden    | Within 30 minutes of detection                                                                                         |
| Internal escalation notified   | Within 1 hour                                                                                                          |
| Legal counsel engaged          | Within 2 hours                                                                                                         |
| CyberTipline report filed      | As soon as reasonably possible (typically within 24 hours, including weekends/holidays) _(confirm with legal counsel)_ |
| Preservation window maintained | 1 year after CyberTipline submission                                                                                   |
| Post-incident review           | Within 7 days                                                                                                          |

---

## After-Action

1. **Modlog.** Ensure a complete modlog entry exists: detection signal, containment timestamp,
   escalation chain, CyberTipline report reference number.
2. **Internal mod thread — audit pointer only.** The manual escalation path
   (`backend/services/moderation-threads/escalate.mts`) opens a `mod_internal` conversation thread
   that adds **community owners and moderators**, not the safety/legal team. Do NOT use this thread
   for CSAM coordination — community moderators must not be exposed to incident details. Create a
   note in the thread that a safety incident is under review by staff, and keep all substantive
   coordination in the staff/legal channel (encrypted, staff-only).
3. **Do not close or delete the internal thread.** It serves as an audit pointer that the escalation
   occurred.
4. **Post-incident review.** Schedule within 7 days: what was detected, how, how long it was live,
   whether any gaps need closing.
5. **Update this runbook** if the incident reveals procedural gaps.

---

## Intentional Current Scope and Limitations

The following are intentional limitations of the current system pending legal, policy, and vendor
decisions. Do not assume these capabilities exist in production:

- **No automated NCMEC/CyberTipline integration.** All reporting is manual and out-of-band.
- **No paging or alerting on CSAM/child-safety escalation.** The `escalate` AI judgement raises the
  severity sort rank only; it does not notify anyone.
- **No dedicated `csam` or `child_safety` policy category.** CSAM is currently folded into
  `illegal_content` (all platforms and entity types).
- **No automated content hashing (PhotoDNA or equivalent).** CSAM is detected only via user reports,
  AI text moderation, and the OpenAI `sexual/minors` flag — not proactive hash-matching.

These limitations should become follow-up implementation work only after this runbook is validated
and the legal/policy owner chooses the reporting, paging, policy-taxonomy, and hash-matching
requirements.
