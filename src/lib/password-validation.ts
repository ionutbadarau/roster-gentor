export const PASSWORD_MIN_LENGTH = 10;

export type PasswordIssue =
  | "tooShort"
  | "missingUppercase"
  | "missingLowercase"
  | "missingDigit"
  | "missingSymbol"
  | "tooCommon";

const COMMON_PASSWORDS = new Set<string>([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "password",
  "password1",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "letmein",
  "iloveyou",
  "admin",
  "welcome",
  "monkey",
  "abc123",
  "dragon",
]);

export function validatePassword(pw: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH) issues.push("tooShort");
  if (!/[A-Z]/.test(pw)) issues.push("missingUppercase");
  if (!/[a-z]/.test(pw)) issues.push("missingLowercase");
  if (!/[0-9]/.test(pw)) issues.push("missingDigit");
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push("missingSymbol");
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) issues.push("tooCommon");
  return issues;
}

export function isPasswordStrong(pw: string): boolean {
  return validatePassword(pw).length === 0;
}
