# POST /api/v1/my/rewards-program-point-valuations

[Back to My API](README.md#post-apiv1myrewards-program-point-valuations)

**Request:**

```json
{
  "rewards_program_id": "<uuid>",
  "value_per_point": { "amount": 35000, "currency": "usd", "scale": 6 },
  "note": "optional"
}
```

`value_per_point` is non-negative scale-six money. The example represents USD 0.035 per point. The
optional `note` accepts a string or `null` and is stored as `null` when omitted.
