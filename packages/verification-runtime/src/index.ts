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
export * from "./contract-loader.js";
export * from "./git.js";
export * from "./path-patterns.js";
export * from "./component-impact.js";
export * from "./check-normalizer.js";
export * from "./selector.js";
export * from "./deduplication.js";
export * from "./dependency-order.js";
export * from "./environment.js";
export * from "./command-runner.js";
export * from "./dry-run.js";
export * from "./agent-tool.js";
export * from "./orchestrator.js";
export * from "./status.js";
export * from "./reports.js";
export * from "./json-output.js";
