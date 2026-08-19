import { describe, expect, it } from "vitest";

import { artifactPathsByAction, buildInitArtifactProposals } from "../src/index.js";

describe("init artifact proposals", () => {
  it("proposes creating the initial contract and defers later artifacts", () => {
    const artifacts = buildInitArtifactProposals({
      proposalId: "proposal-local-test",
      contractContent: "version: 1\n"
    });

    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "create",
          content: "version: 1\n",
          approvalRequired: true,
          proposedBy: "contract-agent"
        }),
        expect.objectContaining({
          path: "AGENTS.md",
          action: "deferred"
        })
      ])
    );
    expect(artifactPathsByAction(artifacts, "create")).toEqual([
      ".board",
      ".board/repository.yaml"
    ]);
  });

  it("proposes updates when existing content differs", () => {
    const artifacts = buildInitArtifactProposals({
      proposalId: "proposal-local-test",
      contractContent: "version: 1\nrepository:\n  name: new\n",
      existingContractContent: "version: 1\nrepository:\n  name: old\n"
    });

    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "update"
        })
      ])
    );
  });

  it("marks unchanged contracts without proposing content", () => {
    const artifacts = buildInitArtifactProposals({
      proposalId: "proposal-local-test",
      contractContent: "version: 1\n",
      existingContractContent: "version: 1\n"
    });

    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "unchanged",
          content: undefined,
          approvalRequired: false
        })
      ])
    );
  });

  it("skips unsafe overwrite proposals when the existing contract is invalid", () => {
    const artifacts = buildInitArtifactProposals({
      proposalId: "proposal-local-test",
      contractContent: "version: 1\n",
      existingContractContent: "broken: true\n",
      existingContractInvalid: true
    });

    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".board/repository.yaml",
          action: "skip",
          content: undefined,
          warnings: expect.arrayContaining([
            "Existing contract is invalid; generated contract is proposed separately for review."
          ])
        }),
        expect.objectContaining({
          path: ".board/repository.generated.yaml",
          action: "create",
          content: "version: 1\n",
          approvalRequired: true
        })
      ])
    );
  });
});
