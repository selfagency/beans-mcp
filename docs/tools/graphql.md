# GraphQL Passthrough

`beans_query` supports `operation: "graphql"` for direct query/mutation passthrough.

## Request shape

- `operation: "graphql"`
- `graphql: string` (required)
- `variables?: Record<string, unknown>`

## Example

```json
{
  "operation": "graphql",
  "graphql": "query($q: String!) { beans(filter: { search: $q }) { id title status } }",
  "variables": { "q": "authentication" }
}
```

## Response shape

- `data`: JSON payload returned by Beans GraphQL command
- `errors`: GraphQL errors if present

## Notes

- Use this when typed higher-level query operations are insufficient
- Prefer `refresh/filter/search/sort/ready` for common reads
