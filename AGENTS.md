<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Where things are, and how we write them

- `README.md`: setup, commands, settings, project structure, conventions, testing and releasing.
- `docs/ARCHITECTURE.md`: how the layers fit, the API (server actions and route handlers), permissions, data, errors, printing.
- Each main folder has a README: `src/app`, `src/lib`, `src/components`.
- Keep to the conventions there:
  - business logic goes in `src/lib/<area>`, never importing `src/app`;
  - server actions end in `Action`;
  - settings are read only via `src/config/env.ts`;
  - screens call the server through `safeCall()`;
  - database changes go in a migration plus `src/db/ensure.ts`;
  - no unused code (`npx tsc --noEmit`, `npx knip`).
