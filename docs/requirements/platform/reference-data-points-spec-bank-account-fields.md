# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Bank Account Fields

| Field                       | Type                                                    | Required | Description                                                        |
| --------------------------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| Bank account (`topic_id`)   | UUID (topic autocomplete)                               | Yes      | Links to a bank account topic (topic_type = `bank_account`).       |
| Result                      | Enum: `approved` / `denied` / `sign_up_bonus` / `offer` | Yes      | Application outcome.                                               |
| Account type                | Enum: `checking` / `savings` / `cd` / `money_market`    | No       | Type of bank account.                                              |
| Credit score range          | Range bucket (same as credit card)                      | No       | Credit score used for account opening (e.g. ChexSystems check).    |
| Stated income range         | `MoneyRange`                                            | No       | Annual income reported on application.                             |
| Existing relationship       | Boolean                                                 | No       | Whether the applicant had an existing account at this bank.        |
| Bonus amount                | `Money`                                                 | No       | Sign-up bonus amount received.                                     |
| Bonus requirements          | String (≤500 chars)                                     | No       | Description of requirements to earn the sign-up bonus.             |
| Minimum balance requirement | `Money`                                                 | No       | Minimum balance required to avoid fees.                            |
| Direct deposit setup        | Boolean                                                 | No       | Whether direct deposit was set up to qualify for bonus/fee waiver. |
| Application date            | Valid calendar date (YYYY-MM-DD)                        | No       | When the application was submitted. Must be a real calendar date.  |
