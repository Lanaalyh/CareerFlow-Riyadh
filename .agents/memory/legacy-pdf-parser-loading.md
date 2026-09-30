---
name: Legacy CommonJS PDF parser loading
description: A package-loading quirk that can break CV extraction even though upload and storage succeed.
---

For older CommonJS parsers, check whether an ESM dynamic import triggers demo or test-file behavior rather than the library export. Use a native CommonJS load through a parent module where needed, and avoid bundling packages that depend on CommonJS module context.

**Why:** A PDF upload reached storage successfully but extraction failed because the parser tried to open a package test fixture during import. A manually constructed test PDF then produced unrelated syntax errors; a Chromium-generated PDF proved the actual parsing path.

**How to apply:** When changing CV parsing or the server bundle, test with a known-valid PDF produced by a PDF generator and verify upload, extraction, list, and deletion—not only TypeScript or an HTTP upload grant.