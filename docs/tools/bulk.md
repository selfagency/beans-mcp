# Bulk Operations

## `beans_bulk_create`

Creates multiple beans with optional default parent.

Input:

- `beans[]` create payloads
- `parent?` as default

Behavior:

- Per-item best effort
- Returns per-item success/error results

## `beans_bulk_update`

Updates multiple beans with optional default parent.

Input:

- `beans[]` update payloads
- `parent?` default parent assignment

Behavior:

- Per-item best effort
- Returns per-item success/error results

## Recommendations

- Use bulk tools for migration-like updates
- Expect partial success and inspect `results[]`
