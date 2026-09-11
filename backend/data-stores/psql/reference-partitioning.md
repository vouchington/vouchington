# Partitioning

[Back to PostgreSQL Data Store](README.md#partitioning)

- Name partitions with `__p_<partition>`.
- RANGE-partitioned UUIDv7 tables should include pruning-friendly `CHECK` constraints. See
  [../../../docs/overview/architecture/partition-pruning-hints.md](../../../docs/overview/architecture/partition-pruning-hints.md).
