import type { Setup } from "@repo-knowledge/repository-contract";
import type { ScannerFact } from "@repo-knowledge/scanner-core";

import { commandFacts, commandStep, selectBestCommand } from "./commands.js";
import type { InitReviewItem } from "./result.js";

export type SetupMappingResult = {
  readonly setup: Setup;
  readonly reviewItems: readonly InitReviewItem[];
  readonly inferredFields: readonly string[];
};

export function mapScannerFactsToSetup(facts: readonly ScannerFact[]): SetupMappingResult {
  const records = commandFacts(facts);
  const reviewItems: InitReviewItem[] = [];
  const setup: Setup = {};
  const install = selectBestCommand(
    records,
    ["install", "bootstrap", "setup"],
    reviewItems,
    "setup-install"
  );
  const migrate = selectBestCommand(records, ["migration"], reviewItems, "setup-migrate");
  const seed = selectBestCommand(records, ["seed"], reviewItems, "setup-seed");
  const generate = selectBestCommand(records, ["generate"], reviewItems, "setup-generate");
  const healthCheck = selectBestCommand(
    records,
    ["healthcheck"],
    reviewItems,
    "setup-health-check"
  );
  const smokeCheck = selectBestCommand(records, ["smoke"], reviewItems, "setup-smoke-check");
  const startServices = composeRuntimeCommand(facts);

  if (install) {
    setup.install = commandStep(install, "install");
  }

  if (startServices) {
    setup.start_services = commandStep(startServices, "start-services");
  }

  if (migrate) {
    setup.migrate = commandStep(migrate, "migrate");
  }

  if (seed) {
    setup.seed = commandStep(seed, "seed");
  }

  if (generate) {
    setup.generate = commandStep(generate, "generate");
  }

  if (healthCheck) {
    setup.health_check = commandStep(healthCheck, "health-check");
  }

  if (smokeCheck) {
    setup.smoke_check = commandStep(smokeCheck, "smoke-check");
  }

  return {
    setup,
    reviewItems,
    inferredFields: Object.keys(setup).length > 0 ? ["setup"] : []
  };
}

function composeRuntimeCommand(facts: readonly ScannerFact[]) {
  return commandFacts(facts).find((record) => {
    return record.fact.detector === "compose" && record.category === "runtime";
  });
}
