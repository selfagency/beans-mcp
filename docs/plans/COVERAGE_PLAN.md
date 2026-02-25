# Coverage Plan to Reach 85%

## Current Status

- Overall: 44.81% statements, 46.84% branches
- Need: 85% statements and branches
- Gap: ~40 percentage points

## File Coverage

| File              | Statements | Branches | Status         |
| ----------------- | ---------- | -------- | -------------- |
| types.ts          | 100%       | 100%     | ✅ Done        |
| utils.ts          | 100%       | 100%     | ✅ Done        |
| graphql.ts        | 100%       | 100%     | ✅ Done        |
| queryHelpers.ts   | 100%       | 79.51%   | ✅ Mostly done |
| BeansMcpServer.ts | 48.8%      | 53.84%   | ⚠️ CRITICAL    |
| backend.ts        | 0.93%      | 0%       | ⚠️ TOO COMPLEX |

## Strategy

### 1. Focus on BeansMcpServer.ts (48.8% → target 90%+)

This will provide the biggest gains without complex mocking.

**Uncovered lines in BeansMcpServer.ts:**

- 21-29: Likely imports/startup
- 49-50: Error helpers
- 67: registerTools call
- 90, 125, 194: Tool handler implementations
- 163-167: Error handling paths
- 234-238, 294-304, 337-349, 375-378: Tool implementations
- 450-463: Likely error paths at end of file

**What to test:**

1. Tool handler input validation (Zod schema errors)
2. Error paths when backend methods throw
3. All tool handlers with valid & invalid inputs
4. Helper functions like getBean, getStatus, etc.

### 2. Do NOT attempt backend.ts (0.93%)

- Requires mocking execFile + promisify
- Too complex to mock properly
- Focus on other areas instead

### 3. Queryhelpers.ts branch coverage (79.51% → 90%+)

Missing branch coverage on lines: 35, 39, 47, 52-54, 59, 84, 101, 133-135, 150

These are likely edge cases in sorting/filtering logic - add targeted tests.

## Test Files to Create/Update

### New: src/test/handlers.test.ts

Test actual MCP tool handlers by:

1. Creating server with mock backend
2. Calling handlers with test inputs
3. Verifying output and backend method calls
4. Testing error paths with mock errors

### Update: src/test/queryHelpers.test.ts

Add tests for missing branches:

- Different type orderings in sort
- Empty input handling
- Null value handling in filters

## Workflow Status

✅ .github/workflows/test.yml - FIXED

## Next Actions

1. Create handlers.test.ts with ~100 tests for tool implementations
2. Add 10-15 more tests to queryHelpers.test.ts for branch coverage
3. Run coverage check
4. If still <85%, add edge case tests for remaining BeansMcpServer.ts lines

## Test Count Today

- 96 tests passing (before tools.test.ts removal)
- All core tests working properly
- Ready to build handler test suite
