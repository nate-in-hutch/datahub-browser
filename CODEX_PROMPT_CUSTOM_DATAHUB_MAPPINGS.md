# Codex Prompt: Add Custom DataHub Entity Path Mappings

Use this prompt on your work laptop:

```text
You are in the datahub-browser repo. Update link routing to support custom entity types from our internal DataHub fork.

Goal:
Add missing URN type -> DataHub UI path mappings so "Open in DataHub" links work for custom entities.

Instructions:
1. Inspect our local DataHub frontend source (not open-source assumptions only) and derive path mappings from the entity registry pattern used by DataHub:
   - getEntityUrl(type, urn) => /{getPathName(type)}/{urlEncodeUrn(urn)}
2. Find all registered entities and their path names in our fork, especially custom ones.
3. Update this project’s mapping in:
   - src/lib/urls.ts
   - DATAHUB_ENTITY_PATH_BY_URN_TYPE
4. Preserve fallback behavior:
   - unknown types must route to /search?query=<urn>
5. Preserve DataHub-style URN encoding behavior in path segments.
6. Add/extend tests in:
   - src/lib/urls.test.ts
   Include at least:
   - one custom type mapping from our fork
   - unknown type fallback
   - encoding behavior regression checks
7. Run validation:
   - npm run lint
   - npm run typecheck
   - npm run test
8. Commit with message:
   - Add internal DataHub custom entity path mappings

Output format:
- First: short summary of mappings added
- Then: exact files changed
- Then: test command results
- Then: any unresolved types that still need manual mapping
```

