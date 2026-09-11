# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Credit Card Fields

Fields marked **[profile]** are sourced from the user's financial profile and shown in the "Your Profile" section of the form. Fields marked **[app]** are per-application and shown in the "This Application" section.

| Field                          | Section   | Type                                                                                                      | Required | Description                                                                                       |
| ------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Card name (`topic_id`)         | [app]     | UUID (topic autocomplete)                                                                                 | Yes      | Links to a credit card topic. Autocomplete ensures consistent naming.                             |
| Result                         | [app]     | Enum: `approved` / `denied` / `pending` / `counter_offer` / `retention_offer` / `sign_up_bonus` / `offer` | Yes      | Application outcome.                                                                              |
| Credit score range             | [profile] | Range bucket (e.g., `670-739`)                                                                            | Yes      | Self-reported credit score bracket at time of application.                                        |
| Stated income range            | [profile] | `MoneyRange`                                                                                              | No       | Inclusive minimum and optional exclusive maximum for annual income.                               |
| Existing relationship          | [app]     | Boolean                                                                                                   | No       | Whether the applicant had an existing account with the issuer.                                    |
| Hard inquiries 12m             | [profile] | Non-negative integer                                                                                      | No       | Number of hard pulls in the last 12 months.                                                       |
| Cards opened 24m               | [profile] | Non-negative integer                                                                                      | No       | Number of new cards opened in the prior 24 months (relevant for 5/24 rules).                      |
| Credit limit                   | [app]     | `Money`                                                                                                   | No       | Approved credit limit (if approved).                                                              |
| Total credit limit (all cards) | [profile] | `Money`                                                                                                   | No       | Total credit across all cards at time of application.                                             |
| Years of credit history        | [profile] | Integer (0-100)                                                                                           | No       | Length of credit history in whole years. Fractional values are rejected.                          |
| Business application           | [app]     | Boolean                                                                                                   | No       | Whether this was a business card application.                                                     |
| Application method             | [app]     | Enum: `online` / `in_branch` / `phone` / `pre_approved`                                                   | No       | How the application was submitted.                                                                |
| Application date               | [app]     | Valid calendar date (YYYY-MM-DD)                                                                          | No       | When the application was submitted. Must be a real calendar date (e.g. `2026-02-30` is rejected). |

### Credit Score Range Values

`300-579`, `580-669`, `670-739`, `740-799`, `800-850`
