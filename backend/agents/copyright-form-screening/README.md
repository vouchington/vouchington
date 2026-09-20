# Copyright Form Screening Agent

`@agents/copyright-form-screening` classifies an already structured copyright form only for obvious
spam or invalidity. Its bounded output is `not_obviously_invalid` or `invalid_or_spam`; uncertainty
about legal merits is not invalidity. The agent does not
parse statutory declarations and cannot directly mutate a case or delivery state.

The copyright workflow may provisionally restrict a signed-in submission only after rereading the
durable `not_obviously_invalid` result and the durable signed-in intake. Guest submissions and an
`invalid_or_spam` result
remain moderator-gated.
