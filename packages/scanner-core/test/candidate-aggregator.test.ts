import { describe, expect, it } from "vitest";

import {
  aggregateCandidates,
  createCandidateAggregatorDetector,
  createScannerEvidence,
  createScannerFact,
  scanRepository,
  type RepositoryDetector
} from "../src/index.js";

describe("Candidate aggregator", () => {
  it("aggregates multi-signal frontend application candidates with fact provenance", () => {
    const framework = fact("framework.detected", {
      name: "Next.js",
      language: "typescript",
      path: "apps/web"
    });
    const command = fact("command.detected", {
      name: "dev",
      command: "next dev",
      category: "development",
      cwd: "apps/web"
    });
    const candidates = aggregateCandidates([framework, command]);

    expect(candidates).toEqual([
      expect.objectContaining({
        kind: "application.detected",
        confidence: "high",
        value: expect.objectContaining({
          name: "web",
          path: "apps/web",
          kind: "frontend-candidate",
          candidate: true,
          signals: ["command.detected", "framework.detected"],
          contributingFactIds: [command.id, framework.id].sort()
        }),
        evidence: [...framework.evidence, ...command.evidence]
      })
    ]);
  });

  it("keeps single-signal ambiguous application candidates at medium confidence", () => {
    const command = fact("command.detected", {
      name: "start",
      command: "node index.js",
      cwd: "."
    });
    const candidates = aggregateCandidates([command]);

    expect(candidates).toEqual([
      expect.objectContaining({
        kind: "application.detected",
        confidence: "medium",
        value: expect.objectContaining({
          kind: "application-candidate",
          signals: ["command.detected"]
        })
      })
    ]);
  });

  it("aggregates service candidates from dependency and Compose facts", () => {
    const postgres = fact("database.dependency_detected", {
      name: "postgresql",
      kind: "database",
      service: "db",
      port: 5432
    });
    const redis = fact("cache.dependency_detected", {
      name: "redis",
      kind: "cache",
      service: "redis"
    });
    const candidates = aggregateCandidates([postgres, redis]);

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "service.detected",
          value: expect.objectContaining({
            name: "db",
            kind: "database",
            candidate: true,
            contributingFactIds: [postgres.id]
          })
        }),
        expect.objectContaining({
          kind: "service.detected",
          value: expect.objectContaining({
            name: "redis",
            kind: "cache",
            candidate: true,
            contributingFactIds: [redis.id]
          })
        })
      ])
    );
  });

  it("can consume facts emitted earlier in the same scan", async () => {
    const seedFact = fact("worker.detected", {
      path: "apps/worker",
      command: "pnpm worker"
    });
    const seedDetector: RepositoryDetector = {
      name: "seed",
      version: "0.0.0",
      emittedFactKinds: ["worker.detected"],
      run: () => ({
        facts: [seedFact]
      })
    };
    const result = await scanRepository({
      root: "/tmp/example",
      inventory: {
        files: []
      },
      detectors: [seedDetector, createCandidateAggregatorDetector()]
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        seedFact,
        expect.objectContaining({
          kind: "application.detected",
          detector: "candidate-aggregator",
          value: expect.objectContaining({
            path: "apps/worker",
            kind: "worker-candidate",
            contributingFactIds: [seedFact.id]
          })
        })
      ])
    );
  });
});

function fact(kind: Parameters<typeof createScannerFact>[0]["kind"], value: unknown) {
  return createScannerFact({
    kind,
    value,
    confidence: "high",
    detector: "fixture",
    evidence: [
      createScannerEvidence({
        kind: "config",
        sourcePath: "package.json",
        detector: "fixture"
      })
    ]
  });
}
