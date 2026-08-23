import type { VerificationRun } from "./types.js";

export type VerificationJsonOutput = {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly repository_root: string;
  readonly contract_path?: string;
  readonly contract_version?: string;
  readonly status: VerificationRun["status"];
  readonly change_set: VerificationRun["changeSet"];
  readonly plan: VerificationRun["plan"];
  readonly results: VerificationRun["results"];
  readonly summary: VerificationRun["summary"];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export function serializeVerificationRunToJson(run: VerificationRun): VerificationJsonOutput {
  return {
    schema_version: 1,
    run_id: run.runId,
    repository_root: run.repositoryRoot,
    contract_path: run.contractPath,
    contract_version: run.contractVersion,
    status: run.status,
    change_set: run.changeSet,
    plan: run.plan,
    results: run.results,
    summary: run.summary,
    warnings: run.warnings,
    errors: run.errors
  };
}
