# POST /api/v1/communities/:slug/agent-prompts/:promptId/test

[Back to Community Moderation reference](reference-community-moderation-api-routes.md)

Request body:

```json
{ "text": "Sample post content to evaluate.", "save_for_training": true, "expected_flagged": false }
```

`text` is required. `save_for_training` and `expected_flagged` are optional booleans; saving a run for
training requires `expected_flagged`. The body is a closed object, so any other field returns 422.

Response:

```json
{ "flagged": false }
```

Testing is a no-persist dry run: one single-question classifier call with the classifier's thresholds applied. It does not save any results, write a classifier receipt or attempt, or consume a slot. The daily AI spend cap is checked first, and a breach returns 429. The response carries no `reason`, because the classifier returns a probability, not an explanation.
