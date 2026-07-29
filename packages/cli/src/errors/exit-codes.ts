export const exitCodes = {
  success: 0,
  generalFailure: 1,
  usageError: 2,
  repositoryNotFound: 3,
  contractNotFound: 4,
  contractInvalid: 5,
  commandNotImplemented: 6,
  externalCommandFailed: 7,
  interrupted: 8,
  permissionOrAccess: 9,
  unexpectedInternalError: 10
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];
