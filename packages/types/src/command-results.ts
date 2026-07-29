export type CommandResultPlaceholder = {
  readonly kind: "command-result";
  readonly command: string;
  readonly status: "succeeded" | "failed" | "not-implemented";
};
