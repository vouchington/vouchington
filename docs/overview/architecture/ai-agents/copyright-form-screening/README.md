# Copyright Form Screening Agent

Source entrypoint: [backend/agents/copyright-form-screening/README.md](../../../../../backend/agents/copyright-form-screening/README.md)

`@agents/copyright-form-screening` classifies an already structured copyright form only for obvious
spam or invalidity. Its bounded output is `not_obviously_invalid` or `invalid_or_spam`; uncertainty
about legal merits is not invalidity. The agent does not
parse statutory declarations and cannot directly mutate a case or delivery state.

The copyright workflow may provisionally restrict a signed-in submission only after rereading the
durable `not_obviously_invalid` result and the durable signed-in intake. Guest submissions and an
`invalid_or_spam` result
remain moderator-gated.

The queue is a wakeup for one durable current execution per intake. The intake transaction starts
unclaimed pending work. The agent claims it under the form-review fence before sanitization or
provider work; duplicates with a live claim and completed executions make no provider call.
Sanitization, provider, extraction, or validation failure marks only that attempt failed. A failed
or expired claim retry advances the token, so stale success and failure cannot replace current
authority. A completed result recovers its workflow effect without another model call.
While `COPYRIGHT_INTAKE_ENABLED` is off, the queue job returns before it claims anything, so no
model call starts and the form stays pending for the dispatch reconciler's first pass after the
switch is on.

## Moderator guidance

The same call returns advisory guidance for the moderator: a short `summary`, a checklist of the six
17 U.S.C. 512(c)(3)(A) elements (signature, identification of the work, identification of the
material, contact information, good-faith statement, and accuracy and authority statement), each
`present`, `missing`, or `unclear` with a gap note, bounded `risk_notes` (possible fair use, abuse
signals, mismatched claimant), and a non-binding `suggested_action`. The staff case shows it under
"AI guidance — not a decision", before and after a moderator records the intake review.

The model receives only structured, non-contact fields: source kind, jurisdiction, claimant display
name, work description, hosted-use URLs, and booleans for whether contact details, a claimant
email, a signature, and both sworn statements were given. Contact details, the claimant email, the
signature text, and any address never enter the prompt; the booleans are authoritative for those
elements. The serialized input keeps the prompt-injection sanitizer and external-content wrapper.

Output is capped before JSON parsing and validated strictly by the shared
[guidance parser](../../../../../backend/services/copyright-notices/form-screening-guidance.mts):
exact keys, closed vocabularies, each element exactly once, and bounded text. The guidance is
stored encrypted with the screening row, parsed again on the staff read, and never read by a
workflow predicate, so it cannot create an assessment or restriction.
