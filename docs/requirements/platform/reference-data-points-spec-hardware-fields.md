# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Hardware Fields

| Field              | Type               | Required | Description                                                                                                      |
| ------------------ | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Product            | Topic autocomplete | Yes      | Links to a hardware product topic.                                                                               |
| Ownership duration | Duration (months)  | Yes      | How long the user has owned/used the product.                                                                    |
| Failure            | Boolean + text     | No       | Whether the product failed, with optional description of the failure mode.                                       |
| Real-world metric  | Number + unit      | No       | Performance measurement (e.g., FPS in a specific game, battery life in hours, sustained transfer speed in MB/s). |
| Purchase price     | `Money`            | No       | What the user paid.                                                                                              |
| Retailer           | Text               | No       | Where the product was purchased.                                                                                 |
| Would recommend    | Boolean            | Yes      | Simple recommendation signal.                                                                                    |
