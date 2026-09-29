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
