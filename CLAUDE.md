# Project rules

## General
- Read existing code before changing anything.
- Do not modify unrelated files.
- Reuse existing patterns and utilities.
- Do not introduce breaking API changes unless explicitly required.
- Do not weaken tests just to make them pass.

## Workflow for large tasks
For substantial changes:

1. Investigate the existing implementation.
2. Split the problem into independent workstreams.
3. Use subagents for independent investigation or implementation.
4. Avoid multiple agents editing the same files.
5. Integrate changes centrally.
6. Run tests, typecheck, lint and build.
7. Use an independent reviewer before completion.

## Completion criteria
A task is complete only when:
- implementation is finished
- relevant tests pass
- typecheck passes
- build passes
- reviewer found no unresolved critical/major issues
