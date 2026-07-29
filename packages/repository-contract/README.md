# @repo-knowledge/repository-contract

Runtime schema, inferred TypeScript types, and validation helpers for `.board/repository.yaml`.

Phase 1 includes the versioned schema, evidence model, applications, services, setup, verification, environment, examples, YAML parsing, serialization, migrations, validation errors, and CLI validation support.

This package is independent from the CLI, scanner, MCP server, hosted API, bootstrap runtime, and worker packages.

## Supported Imports

Future phases should import from the package root:

```ts
import {
  parseRepositoryContract,
  parseRepositoryContractFile,
  serializeRepositoryContract,
  validateRepositoryContract,
  validateRepositoryContractDetailed
} from "@repo-knowledge/repository-contract";

import type {
  RepositoryContract,
  Application,
  Service,
  Environment,
  ValidationIssue
} from "@repo-knowledge/repository-contract";
```

Supported public areas:

- Zod schemas and enum value arrays for contract sections.
- TypeScript types inferred from the schemas.
- Parser APIs for YAML strings, files, and object input.
- Serializer APIs for stable YAML output.
- Validation APIs for compact and detailed errors.
- Version and migration helpers.
- Command normalization helper.

Internal files can change; callers should not import from `src/*` directly outside this package.
