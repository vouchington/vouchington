# Moderation Training Feedback

Source entrypoint: [backend/services/moderation-training/README.md](../../../../../backend/services/moderation-training/README.md)

This package records decisions corroborated by staff or users as normalized feedback rows for future agent evaluation and fine-tuning datasets. Every producer supplies explicit `trainingEvidence`: `staff_or_user` records feedback, while `agent` skips insertion. MCP moderation actions and automated agent callbacks retain their domain decisions and audit history without entering the training set. A later independent staff or user action creates feedback through its existing workflow; no pending training row or separate corroboration screen is created.

Topic recommendations, aliases, hostnames, and retailers should use this same training infrastructure when implemented. Their additional admin tools and training integration remain deferred under #612 (D10).

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
