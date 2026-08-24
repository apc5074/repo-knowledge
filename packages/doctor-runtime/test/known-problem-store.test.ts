import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  createDiagnosticFinding,
  createJsonDoctorStateStore,
  createKnownProblemStore,
  resolveDoctorStateStorePaths
} from "../src/index.js";

describe("known problem store", () => {
  it("creates and reads known problems from findings", async () => {
    const store = await knownProblemStore();
    const record = await store.upsertFinding(finding("finding-1"), {
      observedAt: "2026-01-01T00:00:00.000Z",
      notes: ["first seen locally"]
    });

    expect(record).toMatchObject({
      title: "Node missing",
      category: "environment",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      occurrenceCount: 1,
      findingIds: ["finding-1"],
      targetIds: ["node --version"],
      notes: ["first seen locally"]
    });
    await expect(store.readAll()).resolves.toMatchObject({
      value: {
        schemaVersion: 1,
        problems: [record]
      },
      warnings: []
    });
  });

  it("updates occurrence metadata for repeated findings", async () => {
    const store = await knownProblemStore();
    const first = await store.upsertFinding(finding("finding-1"), {
      observedAt: "2026-01-01T00:00:00.000Z"
    });
    const second = await store.upsertFinding(finding("finding-2"), {
      observedAt: "2026-01-02T00:00:00.000Z",
      notes: ["still happening"]
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-02T00:00:00.000Z",
      occurrenceCount: 2,
      findingIds: ["finding-2", "finding-1"],
      notes: ["still happening"]
    });
  });

  it("persists status changes", async () => {
    const store = await knownProblemStore();
    const record = await store.upsertFinding(finding("finding-1"));

    await expect(
      store.updateStatus(record.id, "acknowledged", { notes: ["known local setup"] })
    ).resolves.toMatchObject({
      id: record.id,
      status: "acknowledged",
      notes: ["known local setup"]
    });
  });

  it("surfaces corruption warnings from the backing state store", async () => {
    const repositoryStateRoot = await mkdtemp(join(tmpdir(), "known-problem-corrupt-"));
    const stateStore = createJsonDoctorStateStore(
      resolveDoctorStateStorePaths({ repositoryStateRoot })
    );
    const store = createKnownProblemStore({ stateStore });

    await stateStore.ensure();
    await writeFile(stateStore.paths.knownProblemsPath, "{", "utf8");

    await expect(store.readAll()).resolves.toMatchObject({
      value: {
        schemaVersion: 1,
        problems: []
      },
      warnings: [expect.objectContaining({ code: "state-corrupt" })]
    });
  });
});

async function knownProblemStore() {
  const repositoryStateRoot = await mkdtemp(join(tmpdir(), "known-problem-"));
  const stateStore = createJsonDoctorStateStore(
    resolveDoctorStateStorePaths({ repositoryStateRoot })
  );
  await stateStore.ensure();
  return createKnownProblemStore({ stateStore });
}

function finding(id: string) {
  return createDiagnosticFinding({
    id,
    ruleId: "environment.tools",
    category: "environment",
    severity: "blocking",
    confidence: "confirmed",
    title: "Node missing",
    summary: "Node is missing.",
    evidence: [
      {
        kind: "command",
        summary: "node failed",
        command: "node --version"
      }
    ],
    suggestedNextSteps: ["Install Node."]
  });
}
