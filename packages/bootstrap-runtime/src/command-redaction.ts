export type RuntimeRedactionInput = {
  readonly text: string | undefined;
  readonly environmentValues?: Readonly<Record<string, string | undefined>>;
  readonly additionalValues?: readonly string[];
};

const redacted = "[redacted]";
const tokenLikePatterns = [
  /\b(?:sk|pk|ghp|github_pat|xox[baprs]|glpat)-[A-Za-z0-9_-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g
] as const;
const assignmentSecretPattern =
  /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*([^\s"'`]+)/g;
const urlCredentialPattern = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi;

export function redactRuntimeOutput(input: RuntimeRedactionInput): string | undefined {
  const normalized = input.text?.trim();

  if (normalized === undefined || normalized === "") {
    return undefined;
  }

  const explicitValues = [
    ...Object.values(input.environmentValues ?? {}),
    ...(input.additionalValues ?? [])
  ].filter((value): value is string => value !== undefined && value.length >= 4);

  const escapedValues = [...new Set(explicitValues)].sort(
    (left, right) => right.length - left.length
  );
  let output = escapedValues.reduce(
    (current, value) => current.split(value).join(redacted),
    normalized
  );

  output = output.replace(urlCredentialPattern, `$1${redacted}:${redacted}@`);
  output = output.replace(assignmentSecretPattern, `$1=${redacted}`);

  for (const pattern of tokenLikePatterns) {
    output = output.replace(pattern, redacted);
  }

  return output;
}

export function createBoundedRuntimeExcerpt(
  input: RuntimeRedactionInput & { readonly maxBytes: number }
): string | undefined {
  const output = redactRuntimeOutput(input);

  if (output === undefined) {
    return undefined;
  }

  return boundUtf8Tail(output, input.maxBytes);
}

export function boundUtf8Tail(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }

  let bounded = text;

  while (Buffer.byteLength(bounded, "utf8") > maxBytes && bounded.length > 0) {
    bounded = bounded.slice(1);
  }

  return bounded;
}
