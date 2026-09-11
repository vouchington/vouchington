# CRM Tables

[Back to PostgreSQL Data Store](README.md#crm-tables)

Migration: `0096-00-00-crm-contacts.sql` for CRM identity/profile records; conversation timeline data uses `0100-00-00-conversations.sql`.

| Table                           | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `crm_contacts`                  | Core contact record with current lifecycle timestamp snapshots |
| `crm_contact_lifecycle_changes` | Append-only CRM contact lifecycle transition history           |
| `crm_contact_social_accounts`   | Per-platform social handles (IG, TikTok, etc.)                 |
| `conversations`                 | CRM outreach timelines (`channel_type = crm`)                  |
| `conversation_participants`     | CRM contact and admin participants                             |
| `conversation_messages`         | CRM emails and internal notes                                  |

Enum types: `crm_contact_types`, `crm_contact_sources`, `crm_contact_verticals`, `crm_social_platforms`, `crm_email_providers`, plus shared conversation message enums in `0100-00-00-conversations.sql`.
