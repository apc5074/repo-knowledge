import { describe, expect, it } from "vitest";

import {
  knownLimitationSchema,
  knownLimitationsSchema,
  validateRepositoryContract
} from "../src/index.js";

describe("known limitation schema", () => {
  it("represents a stable local development limitation with a workaround", () => {
    expect(
      knownLimitationSchema.parse({
        id: "analytics-disabled-local",
        summary: "Analytics events are disabled in local development.",
        impact: "Product event flows can be exercised, but events are not sent to production.",
        applies_to: ["api", "worker"],
        workaround: "Use the event log in the API process when validating local analytics changes.",
        status: "active",
        last_verified: "2026-07-27",
        evidence: [
          {
            kind: "config",
            source_path: ".env.example",
            verification_status: "human_confirmed"
          }
        ]
      })
    ).toEqual({
      id: "analytics-disabled-local",
      summary: "Analytics events are disabled in local development.",
      impact: "Product event flows can be exercised, but events are not sent to production.",
      applies_to: ["api", "worker"],
      workaround: "Use the event log in the API process when validating local analytics changes.",
      status: "active",
      last_verified: "2026-07-27",
      evidence: [
        {
          kind: "config",
          source_path: ".env.example",
          verification_status: "human_confirmed"
        }
      ]
    });
  });

  it("represents accepted and unverified caveats concisely", () => {
    expect(
      knownLimitationsSchema.parse([
        {
          id: "external-api-mocked",
          summary: "The tax API is mocked locally.",
          impact: "Tax edge cases require integration testing before release.",
          status: "accepted"
        },
        {
          id: "windows-setup-unverified",
          summary: "Windows setup has not been verified.",
          impact: "Developers on Windows may need to adjust shell commands.",
          status: "unverified"
        }
      ])
    ).toEqual([
      {
        id: "external-api-mocked",
        summary: "The tax API is mocked locally.",
        impact: "Tax edge cases require integration testing before release.",
        applies_to: [],
        status: "accepted",
        evidence: []
      },
      {
        id: "windows-setup-unverified",
        summary: "Windows setup has not been verified.",
        impact: "Developers on Windows may need to adjust shell commands.",
        applies_to: [],
        status: "unverified",
        evidence: []
      }
    ]);
  });

  it("requires last_verified to use a plain date", () => {
    const result = knownLimitationSchema.safeParse({
      id: "analytics-disabled-local",
      summary: "Analytics events are disabled in local development.",
      impact: "Events are not sent to production.",
      status: "active",
      last_verified: "2026-07-27T12:00:00.000Z"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        origin: "string",
        code: "invalid_format",
        format: "regex",
        pattern: "/^\\d{4}-\\d{2}-\\d{2}$/",
        path: ["last_verified"],
        message: "last_verified must use YYYY-MM-DD format"
      }
    ]);
  });

  it("rejects duplicate known limitation IDs", () => {
    const result = knownLimitationsSchema.safeParse([
      {
        id: "external-api-mocked",
        summary: "The tax API is mocked locally.",
        impact: "Tax edge cases require integration testing before release.",
        status: "accepted"
      },
      {
        id: "external-api-mocked",
        summary: "The tax API is mocked locally.",
        impact: "Tax edge cases require integration testing before release.",
        status: "active"
      }
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: [1, "id"],
        message: "Duplicate known limitation id: external-api-mocked"
      }
    ]);
  });

  it("validates known limitations inside the contract object", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      known_limitations: [
        {
          id: "payments-mocked-local",
          summary: "Payment provider calls are mocked locally.",
          impact: "Real payment behavior must be checked in staging.",
          workaround: "Run integration tests against the staging sandbox.",
          status: "active",
          last_verified: "2026-07-27"
        }
      ]
    });

    expect(result.ok).toBe(true);
  });
});
