---
# beans-mcp-3zsf
title: Align llm_context with beans prime
status: completed
type: task
priority: normal
created_at: 2026-03-13T19:29:47Z
updated_at: 2026-03-13T19:36:05Z
---

## Todo
- [x] Return real beans prime text from llm_context
- [x] Add bodyMod replace/append support to beans_update
- [x] Update tests for llm_context and bodyMod
- [x] Update README docs for bodyMod fields
- [x] Run full validation

## Summary of Changes
- llm_context now uses live beans prime output and can write to .github/instructions/beans-prime.instructions.md.
- beans_update now supports atomic body modifications via bodyAppend and bodyReplace, in addition to full body updates and ifMatch.
- Added/updated tests across query helper, handler unit, and protocol e2e coverage.
- README and changelog updated to reflect new input contracts and output paths.
