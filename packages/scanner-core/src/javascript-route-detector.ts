import type { RepositoryDetector } from "./detector.js";
import { createScannerFact, type ScannerFact } from "./facts.js";
import { createEvidenceFromLocation } from "./source-location.js";

const detectorName = "javascript-route-file";

export function createJavaScriptRouteDetector(): RepositoryDetector {
  return {
    name: detectorName,
    version: "0.0.0",
    emittedFactKinds: ["api.route_file_detected"],
    filePatterns: [
      "pages/api/**",
      "app/**/route.*",
      "src/routes/**",
      "routes/**",
      "**/*.controller.*"
    ],
    run: (context) => {
      const facts = context.inventory.files.filter(isRouteFile).sort().map(routeFileFact);

      return {
        facts,
        stats: {
          files_considered: context.inventory.files.length,
          facts_emitted: facts.length
        }
      };
    }
  };
}

function routeFileFact(path: string): ScannerFact {
  return createScannerFact({
    kind: "api.route_file_detected",
    value: {
      path,
      framework: routeFramework(path),
      route: routeLabel(path)
    },
    confidence: "high",
    detector: detectorName,
    evidence: [
      createEvidenceFromLocation({
        kind: "source",
        sourcePath: path,
        detector: detectorName,
        location: {
          line_start: 1,
          line_end: 1
        }
      })
    ]
  });
}

function isRouteFile(path: string): boolean {
  return (
    isSourceFile(path) &&
    (path.includes("/pages/api/") ||
      path.startsWith("pages/api/") ||
      /(^|\/)app\/.+\/route\.[cm]?[jt]sx?$/.test(path) ||
      /(^|\/)(src\/)?routes?\//.test(path) ||
      /(^|\/).+\.controller\.[cm]?[jt]sx?$/.test(path) ||
      /(^|\/)(router|routes)\.[cm]?[jt]sx?$/.test(path))
  );
}

function isSourceFile(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}

function routeFramework(path: string): string | undefined {
  if (
    path.includes("/pages/api/") ||
    path.startsWith("pages/api/") ||
    /(^|\/)app\/.+\/route\./.test(path)
  ) {
    return "next.js";
  }

  if (/\.controller\./.test(path)) {
    return "nestjs";
  }

  if (/(^|\/)(src\/)?routes?\//.test(path) || /(^|\/)(router|routes)\./.test(path)) {
    return "express-or-fastify";
  }

  return undefined;
}

function routeLabel(path: string): string | undefined {
  if (path.includes("/pages/api/") || path.startsWith("pages/api/")) {
    return `/${path.split(/pages\/api\//)[1]?.replace(/\.[^.]+$/, "") ?? ""}`;
  }

  const appRouteMatch = path.match(/(?:^|\/)app\/(.+)\/route\.[cm]?[jt]sx?$/);

  if (appRouteMatch?.[1]) {
    return `/${appRouteMatch[1].replace(/\(.+?\)\//g, "")}`;
  }

  return undefined;
}
