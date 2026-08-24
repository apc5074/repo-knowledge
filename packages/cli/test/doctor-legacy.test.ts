import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runBoardCli } from "../src/index.js";
import {
  createRepositoryFixture,
  createTempDirectory,
  parseJsonResult,
  runCli,
  validRepositoryContractYaml,
  writeRepositoryContract
} from "./harness.js";

describe("doctor and legacy CLI commands", () => {
  it("shows board doctor flags in command help", () => {
    const result = runCliSync(["doctor", "--help"]);

    expect(result.exitCode).toBe(0);
    for (const flag of [
      "--category",
      "--include-logs",
      "--no-runtime",
      "--no-docker",
      "--no-history",
      "--dry-run",
      "--json"
    ]) {
      expect(result.stdout).toContain(flag);
    }
  });

  it("runs board doctor with JSON output and category filtering", async () => {
    const fixture = await createDoctorFixture("doctor-category");
    const env = await localStateEnv("doctor-category");
    const result = await runCli(
      ["doctor", "--json", "--category", "contract", "--no-runtime", "--no-docker", "--no-history"],
      {
        cwd: fixture.root,
        env
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const parsed = parseJsonResult<{
      readonly doctor: {
        readonly categories: readonly string[];
        readonly state_paths: {
          readonly run?: string;
        };
      };
    }>(result);

    expect(parsed.command).toBe("doctor");
    expect(parsed.data?.doctor.categories).toEqual(["contract"]);
    expect(parsed.data?.doctor.state_paths.run).toEqual(expect.any(String));
  });

  it("runs board doctor with human output for local warnings", async () => {
    const fixture = await createDoctorFixture("doctor-human-warning");
    const env = await localStateEnv("doctor-human-warning");
    const result = await runCli(["doctor", "--no-runtime", "--no-docker", "--no-history"], {
      cwd: fixture.root,
      env
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Doctor found");
    expect(result.stdout).toContain("Run record:");
  });

  it("runs board doctor dry-run as a diagnostic source preview", async () => {
    const fixture = await createDoctorFixture("doctor-dry-run");
    const env = await localStateEnv("doctor-dry-run");
    const result = await runCli(["doctor", "--json", "--dry-run"], {
      cwd: fixture.root,
      env
    });
    const parsed = parseJsonResult<{
      readonly doctor: {
        readonly findings: readonly unknown[];
        readonly skipped_inspectors: readonly { readonly reason: string }[];
      };
      readonly skipped_inspectors: readonly { readonly reason: string }[];
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toMatch(/success|warning/);
    expect(parsed.data?.skipped_inspectors).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "dry-run" })])
    );
    expect(parsed.data?.doctor.skipped_inspectors).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "dry-run" })])
    );
  });

  it("reports blocking doctor diagnostics without failing the command", async () => {
    const fixture = await createRepositoryFixture({
      name: "doctor-blocking-missing-contract",
      contract: "missing"
    });
    const env = await localStateEnv("doctor-blocking-missing-contract");
    const result = await runCli(
      ["doctor", "--json", "--no-runtime", "--no-docker", "--no-history"],
      {
        cwd: fixture.root,
        env
      }
    );
    const parsed = parseJsonResult<{
      readonly doctor: {
        readonly findings: readonly {
          readonly category: string;
          readonly severity: string;
          readonly ruleId: string;
        }[];
      };
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(parsed.status).toBe("warning");
    expect(parsed.data?.doctor.findings).toContainEqual(
      expect.objectContaining({
        category: "contract",
        severity: "blocking",
        ruleId: "contract.missing"
      })
    );
  });

  it("lists, explains, and reviews legacy candidates from local state", async () => {
    const fixture = await createDoctorFixture("legacy-review");
    const env = await localStateEnv("legacy-review");
    const doctor = await runCli(
      ["doctor", "--json", "--no-runtime", "--no-docker", "--no-history"],
      {
        cwd: fixture.root,
        env
      }
    );

    expect(doctor.exitCode).toBe(0);

    const listed = await runCli(["legacy", "list", "--json"], {
      cwd: fixture.root,
      env
    });
    const list = parseJsonResult<{
      readonly legacy: {
        readonly candidates: readonly { readonly id: string; readonly status: string }[];
      };
    }>(listed);
    const candidateId = list.data?.legacy.candidates[0]?.id;

    expect(candidateId).toEqual(expect.stringMatching(/^legacy-/));

    const explained = await runCli(["legacy", "explain", candidateId ?? "", "--json"], {
      cwd: fixture.root,
      env
    });
    const explanation = parseJsonResult<{
      readonly legacy: {
        readonly candidate: {
          readonly id: string;
          readonly evidence: readonly { readonly summary: string }[];
        };
      };
    }>(explained);

    expect(explanation.data?.legacy.candidate.id).toBe(candidateId);
    expect(explanation.data?.legacy.candidate.evidence.length).toBeGreaterThan(0);

    const reviewed = await runCli(
      ["legacy", "review", candidateId ?? "", "--status", "accepted", "--note", "covered"],
      {
        cwd: fixture.root,
        env,
        json: true
      }
    );
    const review = parseJsonResult<{
      readonly legacy: {
        readonly candidate: {
          readonly status: string;
          readonly reviewerNotes?: readonly string[];
        };
      };
    }>(reviewed);

    expect(review.data?.legacy.candidate.status).toBe("accepted");
    expect(review.data?.legacy.candidate.reviewerNotes).toContain("covered");
  });

  it("returns failures for missing legacy candidates and invalid review statuses", async () => {
    const fixture = await createDoctorFixture("legacy-errors");
    const env = await localStateEnv("legacy-errors");
    const missing = await runCli(["legacy", "explain", "legacy-missing", "--json"], {
      cwd: fixture.root,
      env
    });

    expect(missing.exitCode).toBe(1);
    expect(parseJsonResult(missing).errors[0]?.code).toBe("legacy-candidate-not-found");

    const invalid = await runCli(
      ["legacy", "review", "legacy-missing", "--status", "unsupported"],
      {
        cwd: fixture.root,
        env,
        json: true
      }
    );

    expect(invalid.exitCode).toBe(2);
    expect(parseJsonResult(invalid).errors[0]?.message).toContain("Invalid legacy review status");
  });
});

async function createDoctorFixture(name: string) {
  const fixture = await createRepositoryFixture({
    name,
    contract: "valid"
  });

  await writeRepositoryContract(
    fixture.root,
    `${validRepositoryContractYaml(name)}
verification:
  default:
    - id: test
      kind: unit
      command:
        command: pnpm
        args:
          - test
`
  );
  await writeFile(
    join(fixture.root, "package.json"),
    JSON.stringify(
      {
        scripts: {
          "legacy:test": "node old-test.js",
          test: "node current-test.js"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(join(fixture.root, "src"), { recursive: true });
  await writeFile(join(fixture.root, "src/current.ts"), "export const current = true;\n", "utf8");
  await writeFile(join(fixture.root, "README.md"), "deprecated: package.json\n", "utf8");

  return fixture;
}

async function localStateEnv(name: string): Promise<NodeJS.ProcessEnv> {
  return {
    BOARD_DATA_HOME: await createTempDirectory(`${name}-data`),
    BOARD_CACHE_HOME: await createTempDirectory(`${name}-cache`)
  };
}

function runCliSync(args: readonly string[]) {
  return runBoardCli(args);
}
