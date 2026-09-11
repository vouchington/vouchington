# PATCH /api/v1/my/cards/:id

[Back to My API](README.md#patch-apiv1mycardsid)

Updatable fields: `credit_limit`, `is_authorized_user`, `authorized_user_of_id`, `note`,
`opened_on`, `closed_on`, `received_sign_up_bonus_on`. Omitted fields are unchanged; `null` clears
nullable fields. Credit limits use `{ amount, currency }`, where `amount` is an integer in the
currency's minor unit.
