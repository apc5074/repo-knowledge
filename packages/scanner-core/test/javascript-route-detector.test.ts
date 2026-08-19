import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFileInventory, createJavaScriptRouteDetector, scanRepository } from "../src/index.js";

describe("JavaScript route file detector", () => {
  it("detects route files for Next.js, NestJS, and Express or Fastify conventions", async () => {
    const root = await createFixture({
      "apps/web/app/api/users/route.ts": "export function GET() {}\n",
      "apps/web/pages/api/health.ts": "export default function handler() {}\n",
      "packages/api/src/routes/users.ts": "export const router = {}\n",
      "packages/api/src/user.controller.ts": "export class UserController {}\n",
      "packages/api/src/service.ts": "export {}\n"
    });
    const inventory = await buildFileInventory({
      root,
      trackedFiles: [
        "apps/web/app/api/users/route.ts",
        "apps/web/pages/api/health.ts",
        "packages/api/src/routes/users.ts",
        "packages/api/src/service.ts",
        "packages/api/src/user.controller.ts"
      ]
    });
    const result = await scanRepository({
      root,
      inventory,
      detectors: [createJavaScriptRouteDetector()]
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      {
        path: "apps/web/app/api/users/route.ts",
        framework: "next.js",
        route: "/api/users"
      },
      {
        path: "apps/web/pages/api/health.ts",
        framework: "next.js",
        route: "/health"
      },
      {
        path: "packages/api/src/routes/users.ts",
        framework: "express-or-fastify",
        route: undefined
      },
      {
        path: "packages/api/src/user.controller.ts",
        framework: "nestjs",
        route: undefined
      }
    ]);
    expect(result.facts.every((fact) => fact.kind === "api.route_file_detected")).toBe(true);
    expect(result.facts[0]?.evidence[0]).toMatchObject({
      source_path: "apps/web/app/api/users/route.ts",
      line_start: 1
    });
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-knowledge-js-route-"));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), {
      recursive: true
    });
    await writeFile(absolutePath, contents);
  }

  return root;
}
