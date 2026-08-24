import {
  createBoundedRuntimeExcerpt,
  redactRuntimeOutput
} from "@repo-knowledge/bootstrap-runtime";

import type { RedactedLogExcerpt } from "./types.js";

export type RedactDoctorLogInput = {
  readonly text: string | undefined;
  readonly maxCharacters?: number;
  readonly environmentValues?: Readonly<Record<string, string | undefined>>;
  readonly additionalValues?: readonly string[];
};

export type RedactedDiagnosticLog = RedactedLogExcerpt & {
  readonly originalCharacters: number;
};

const defaultMaxCharacters = 4_000;

export function redactDoctorLog(input: RedactDoctorLogInput): RedactedDiagnosticLog | undefined {
  const maxCharacters = input.maxCharacters ?? defaultMaxCharacters;
  const redacted = redactRuntimeOutput({
    text: input.text,
    environmentValues: input.environmentValues,
    additionalValues: input.additionalValues
  });

  if (redacted === undefined) {
    return undefined;
  }

  const bounded = redacted.length > maxCharacters ? redacted.slice(-maxCharacters) : redacted;

  return {
    text: bounded,
    redacted: true,
    truncated: redacted.length > maxCharacters,
    maxCharacters,
    originalCharacters: input.text?.length ?? 0
  };
}

export function createRedactedLogEvidence(
  input: RedactDoctorLogInput & {
    readonly summary: string;
    readonly source?: string;
  }
) {
  const excerpt = redactDoctorLog(input);

  if (excerpt === undefined) {
    return undefined;
  }

  return {
    kind: "log_excerpt" as const,
    summary: input.summary,
    source: input.source,
    excerpt
  };
}

export function createBoundedDoctorLogText(input: RedactDoctorLogInput): string | undefined {
  return createBoundedRuntimeExcerpt({
    text: input.text,
    environmentValues: input.environmentValues,
    additionalValues: input.additionalValues,
    maxBytes: input.maxCharacters ?? defaultMaxCharacters
  });
}
