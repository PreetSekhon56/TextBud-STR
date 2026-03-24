# Deferred Items - Phase 01

## Pre-existing Issues

1. **setup.ts missing module: setup-review.js** - `src/handlers/setup.ts` imports `./setup-review.js` which does not exist yet. This is from plan 02 (property setup wizard) and will be resolved when that plan is completed. Causes `tsc --noEmit` to fail with TS2307.
