Review privacy and data retention. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Privacy](../../../docs/requirements/users/PRIVACY.md) and [Account deletion & data request](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md) against account deletion, data export, consent, privacy settings, retention jobs, audit trails, and public/private data exposure.
- Keep behavior aligned with GDPR/CCPA-oriented requirements and user-facing privacy docs.
- Prefer fixes that make data lifecycle behavior clearer, safer, or better tested.
- Add or tighten tests for the selected privacy or retention behavior.
