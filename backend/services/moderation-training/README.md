# Moderation Training Feedback

This package records moderator decisions as normalized feedback rows for future agent evaluation and fine-tuning datasets.

## Signals

- Explicit automod review labels use `event_type = 'automod_reviewed'` and `label_confidence = 1`.
- Implicit workflow labels, such as queue approvals or report resolutions, use lower confidence because they are inferred from product behavior.
- Prompt test runs can be saved as synthetic examples with `source_type = 'prompt_test_run'`.

## Labels

- `true_positive`: moderation was correct and the content should stay removed or flagged.
- `false_positive`: moderation was too strict and the content should be restored.
- `true_negative`: content passed human review.
- `accepted`, `edited`, `rejected`: human judgment on reports, disputes, or drafts.
- `not_applicable`: useful audit event but not a training label.

Keep raw model output in `metadata` when possible, and prefer normalized `reason_code` values for moderator-selected chips.
