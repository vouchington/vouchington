# POST /api/v1/my/spending-categories

[Back to My API](README.md#post-apiv1myspending-categories)

**Request:**

```json
{
  "spending_category_id": "<uuid>",
  "amount": { "amount": 50000, "currency": "usd" },
  "spending_frequency": "monthly",
  "note": "optional"
}
```
