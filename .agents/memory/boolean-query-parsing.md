---
name: Boolean query parsing
description: Generated URL query schemas may not interpret false string values as expected.
---

Normalize boolean URL query values explicitly at the HTTP boundary before applying generated Zod coercion.

**Why:** The generated schema uses JavaScript boolean coercion, where the non-empty string "false" becomes true. A training-only filter could otherwise return the wrong results.

**How to apply:** For new boolean query parameters, accept only the literal strings "true" and "false" and map them to actual booleans before filtering or validating.