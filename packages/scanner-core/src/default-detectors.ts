import { createCandidateAggregatorDetector } from "./candidate-aggregator.js";
import { createComposeDetector } from "./compose-detector.js";
import { createDatabaseDependencyDetector } from "./database-dependency-detector.js";
import type { RepositoryDetector } from "./detector.js";
import { createDevContainerDetector } from "./devcontainer-detector.js";
import { createDockerfileDetector } from "./dockerfile-detector.js";
import { createDocumentationDetector } from "./documentation-detector.js";
import { createEnvFileDetector } from "./env-file-detector.js";
import { createGeneratedFileDetector } from "./generated-file-detector.js";
import { createGitHubActionsDetector } from "./github-actions-detector.js";
import { createJavaScriptCommandDetector } from "./javascript-command-detector.js";
import { createJavaScriptEntrypointDetector } from "./javascript-entrypoint-detector.js";
import { createJavaScriptEnvDetector } from "./javascript-env-detector.js";
import { createJavaScriptFrameworkDetector } from "./javascript-framework-detector.js";
import { createJavaScriptManifestDetector } from "./javascript-manifest.js";
import { createJavaScriptRouteDetector } from "./javascript-route-detector.js";
import { createLanguageDetector } from "./language-detector.js";
import { createLegacyDetector } from "./legacy-detector.js";
import { createMakefileDetector } from "./makefile-detector.js";
import { createMigrationSeedDetector } from "./migration-seed-detector.js";
import { createPackageManagerDetector } from "./package-manager-detector.js";
import { createPythonCommandDetector } from "./python-command-detector.js";
import { createPythonManifestDetector } from "./python-manifest.js";
import { createPythonRouteDetector } from "./python-route-detector.js";
import { createPythonFrameworkDetector, createPythonSourceDetector } from "./python-source.js";
import { createWorkerDetector } from "./worker-detector.js";

export function createDefaultRepositoryDetectors(): readonly RepositoryDetector[] {
  return [
    createPackageManagerDetector(),
    createLanguageDetector(),
    createJavaScriptManifestDetector(),
    createJavaScriptFrameworkDetector(),
    createJavaScriptCommandDetector(),
    createJavaScriptEntrypointDetector(),
    createJavaScriptRouteDetector(),
    createJavaScriptEnvDetector(),
    createPythonManifestDetector(),
    createPythonSourceDetector(),
    createPythonFrameworkDetector(),
    createPythonCommandDetector(),
    createPythonRouteDetector(),
    createDockerfileDetector(),
    createComposeDetector(),
    createDevContainerDetector(),
    createGitHubActionsDetector(),
    createMakefileDetector(),
    createEnvFileDetector(),
    createDatabaseDependencyDetector(),
    createMigrationSeedDetector(),
    createWorkerDetector(),
    createGeneratedFileDetector(),
    createDocumentationDetector(),
    createLegacyDetector(),
    createCandidateAggregatorDetector()
  ];
}
