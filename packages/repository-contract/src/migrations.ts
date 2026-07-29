export type ContractMigration = {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  readonly migrate: (input: unknown) => unknown;
};

export const CURRENT_CONTRACT_VERSION = 1;
export const SUPPORTED_CONTRACT_VERSIONS = [CURRENT_CONTRACT_VERSION] as const;

export class UnsupportedContractVersionError extends Error {
  readonly version: unknown;

  constructor(version: unknown) {
    super(`Unsupported repository contract version: ${String(version)}`);
    this.name = "UnsupportedContractVersionError";
    this.version = version;
  }
}

export class MissingContractVersionError extends Error {
  constructor() {
    super("Repository contract version is required");
    this.name = "MissingContractVersionError";
  }
}

export const contractMigrations: readonly ContractMigration[] = [
  {
    fromVersion: 1,
    toVersion: 1,
    description: "Version 1 is the initial repository contract schema.",
    migrate: (input: unknown): unknown => input
  }
];

export function getContractMigrations(): readonly ContractMigration[] {
  return contractMigrations;
}

export function getContractVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null || !("version" in input)) {
    throw new MissingContractVersionError();
  }

  return (input as { readonly version?: unknown }).version;
}

export function migrateRepositoryContractInput(input: unknown): unknown {
  const version = getContractVersion(input);

  if (version === CURRENT_CONTRACT_VERSION) {
    return input;
  }

  throw new UnsupportedContractVersionError(version);
}
