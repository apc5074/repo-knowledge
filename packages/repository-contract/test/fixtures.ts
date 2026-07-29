import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
export const validFixtureDirectory = join(fixtureDirectory, "valid");
export const invalidFixtureDirectory = join(fixtureDirectory, "invalid");

export async function listFixtureFiles(kind: "valid" | "invalid"): Promise<string[]> {
  const directory = kind === "valid" ? validFixtureDirectory : invalidFixtureDirectory;
  const fileNames = await readdir(directory);

  return fileNames.filter((fileName) => fileName.endsWith(".yaml")).sort();
}

export function fixturePath(kind: "valid" | "invalid", fileName: string): string {
  return join(kind === "valid" ? validFixtureDirectory : invalidFixtureDirectory, fileName);
}

export async function readFixture(kind: "valid" | "invalid", fileName: string): Promise<string> {
  return readFile(fixturePath(kind, fileName), "utf8");
}
