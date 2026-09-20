# Copyright Form Screening Agent

`@agents/copyright-form-screening` classifies an already structured copyright form only for obvious
spam or invalidity. Its bounded output is `clear`, `invalid_or_spam`, or `uncertain`; it does not
parse statutory declarations and cannot directly mutate a case or delivery state.

The copyright workflow may provisionally restrict a signed-in submission only after rereading the
durable `clear` result and the durable signed-in intake. Guest submissions and every non-clear result
remain moderator-gated.
