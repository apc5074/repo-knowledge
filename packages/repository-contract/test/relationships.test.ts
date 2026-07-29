import { describe, expect, it } from "vitest";

import {
  externalSystemsSchema,
  relatedRepositorySchema,
  validateRepositoryContract
} from "../src/index.js";

describe("related repository and external system schemas", () => {
  it("declares another repository that consumes this repository's API", () => {
    expect(
      relatedRepositorySchema.parse({
        name: "billing-web",
        provider: "github",
        repository_slug: "acme/billing-web",
        relationship: "consumes_api",
        direction: "inbound",
        notes: "The web app calls this service for invoice state.",
        evidence: [
          {
            kind: "documentation",
            source_path: "docs/integrations.md",
            verification_status: "human_confirmed"
          }
        ]
      })
    ).toEqual({
      name: "billing-web",
      provider: "github",
      repository_slug: "acme/billing-web",
      relationship: "consumes_api",
      direction: "inbound",
      notes: "The web app calls this service for invoice state.",
      evidence: [
        {
          kind: "documentation",
          source_path: "docs/integrations.md",
          verification_status: "human_confirmed"
        }
      ]
    });
  });

  it("requires a related repository URL or slug", () => {
    const result = relatedRepositorySchema.safeParse({
      name: "billing-web",
      provider: "github",
      relationship: "consumes_api",
      direction: "inbound"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["repository_slug"],
        message: "related repository requires repository_url or repository_slug"
      }
    ]);
  });

  it("declares an external dependency without knowing its repository", () => {
    expect(
      externalSystemsSchema.parse([
        {
          id: "stripe",
          name: "Stripe",
          type: "payment_provider",
          relationship: "consumes_api",
          direction: "outbound",
          endpoint: "https://api.stripe.com",
          description: "Payment processing API used by checkout."
        }
      ])
    ).toEqual([
      {
        id: "stripe",
        name: "Stripe",
        type: "payment_provider",
        relationship: "consumes_api",
        direction: "outbound",
        endpoint: "https://api.stripe.com",
        description: "Payment processing API used by checkout.",
        evidence: []
      }
    ]);
  });

  it("rejects duplicate external system IDs", () => {
    const result = externalSystemsSchema.safeParse([
      {
        id: "stripe",
        name: "Stripe",
        type: "payment_provider"
      },
      {
        id: "stripe",
        name: "Stripe Sandbox",
        type: "payment_provider"
      }
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: [1, "id"],
        message: "Duplicate external system id: stripe"
      }
    ]);
  });

  it("validates related repositories and external systems inside the contract object", () => {
    const result = validateRepositoryContract({
      version: 1,
      repository: {
        name: "orders-service",
        type: "service",
        primary_language: "typescript"
      },
      related_repositories: [
        {
          name: "checkout-api",
          provider: "github",
          repository_url: "https://github.com/acme/checkout-api",
          relationship: "publishes_event",
          direction: "outbound"
        }
      ],
      external_systems: [
        {
          id: "segment",
          name: "Segment",
          type: "analytics",
          relationship: "consumes_event",
          direction: "outbound"
        }
      ]
    });

    expect(result.ok).toBe(true);
  });
});
