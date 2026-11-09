export function internalError(scope: string, error: unknown) {
  console.error(scope, error);
  return "Internal error";
}
