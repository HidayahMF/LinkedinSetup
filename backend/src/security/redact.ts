/**
 * Server-side diagnostic redaction (flow.md §57/§62 — never log credentials).
 * Applied to every internal log line that interpolates raw error messages or
 * request data. Redacted output keeps debugging useful without exposing secrets.
 */
export function redactSecrets(input: string): string {
  return input
    // Authorization headers
    .replace(/(authorization"?\s*[:=]\s*)("?)[a-z]+\s+[A-Za-z0-9\-._~+/=]{8,}\2/gi, '$1[REDACTED]')
    // Bearer tokens anywhere in a line
    .replace(/bearer\s+[A-Za-z0-9\-._~+/=]{8,}/gi, 'bearer [REDACTED]')
    // key=value / "key":"value" style secrets
    .replace(
      /("?(?:password|passphrase|secret|api[-_]?key|session[-_]?token|access[-_]?token|refresh[-_]?token)"?\s*[:=]\s*)"?(?![\[])[^"\s,;&}]{4,}"?/gi,
      '$1"[REDACTED]"',
    )
    // MongoDB/SRV connection strings with embedded credentials
    .replace(/mongodb(\+srv)?:\/\/[^:\s/@]+:[^@\s/]+@/gi, 'mongodb$1://[REDACTED]@')
    // Set-Cookie headers / cookie pairs (LinkedIn session cookies included)
    .replace(/(set-cookie\s*[:=]\s*)[^\r\n;]+/gi, '$1[REDACTED]')
    .replace(/\b(li_at|jsessionid|bcookie|bscookie|lidc)=(?:"[^"]*"|'[^']*'|[^;\s"']+)/gi, '$1=[REDACTED]')
}
