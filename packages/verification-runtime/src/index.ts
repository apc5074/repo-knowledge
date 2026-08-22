export const verificationRuntimePackage = {
  name: "@repo-knowledge/verification-runtime",
  owns: "local-verification-runtime",
  phase: "phase-6-verification-runtime"
} as const;

export type VerificationRuntimePackage = typeof verificationRuntimePackage;

export const verificationRuntimeBehavior = {
  defaultRunsChangedChecks: true,
  supportsDryRun: true,
  supportsJsonOutput: true
} as const;

export * from "./types.js";
export * from "./history-store.js";
