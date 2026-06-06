export function classifyVariableToken(token: string, parameterNames: Set<string>): string {
  if (parameterNames.has(token)) {
    return "formula-parameter";
  }
  if (/^[A-Z]/.test(token)) {
    return "formula-uppercase";
  }
  if (/^[a-z]/.test(token)) {
    return "formula-lowercase";
  }
  return "formula-default";
}
