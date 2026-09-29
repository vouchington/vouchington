# Embeddings And External Metadata

[Back to PostgreSQL Data Store](README.md#embeddings-and-external-metadata)

Embedding and moderation metadata should live on the owning entity row using a consistent prefix:

| Column                   | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `<model>_content_sha256` | Hash of the current source content             |
| `<model>_input_sha256`   | Hash of the content used for the stored result |
| `<model>`                | Vector or structured result payload            |
| `<model>_tokens`         | Input token count                              |
| `<model>_created_at`     | Timestamp for the stored result                |

This same pattern applies to vector embeddings and structured external metadata such as moderation.
