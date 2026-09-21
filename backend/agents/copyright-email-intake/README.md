# Copyright Email Intake Agent

`@agents/copyright-email-intake` turns a privately preserved, designated-inbox email into an
encrypted structured extraction and advisory recommendation. It receives only the decrypted source
text and attachment metadata through `@services/copyright-notices`; it never reads object storage,
sends mail, creates a case, or restricts media.

Every external field is passed through `sanitizePromptInjection()` and `wrapExternalContent()`.
The JSON schema requires one of `invalid_or_spam`, `requires_information`, or `potentially_valid`,
but all three are staff-gated. The immutable output is keyed by intake input digest and prompt
version, so SQS/GlideMQ replays cannot replace the provenance a moderator reviewed.
