import type {
  CommitConstraints,
  ConstraintValidation,
  ConstraintViolation,
} from '../types/index.js';

/**
 * Validate a commit message against the configured constraints.
 *
 * Checks the first line of the message for:
 * - Minimum length
 * - Maximum length
 * - Required prefix
 * - Required suffix
 *
 * @returns Validation result with any violations.
 */
export function validateCommitMessage(
  message: string,
  constraints: CommitConstraints,
): ConstraintValidation {
  const violations: ConstraintViolation[] = [];
  const firstLine = message.split('\n')[0] ?? '';

  // Length checks
  if (firstLine.length < constraints.minLength) {
    violations.push({
      constraint: 'minLength',
      message: `Message too short: ${String(firstLine.length)} characters (minimum: ${String(constraints.minLength)}).`,
      actual: firstLine.length,
      expected: constraints.minLength,
    });
  }

  if (firstLine.length > constraints.maxLength) {
    violations.push({
      constraint: 'maxLength',
      message: `First line too long: ${String(firstLine.length)} characters (maximum: ${String(constraints.maxLength)}).`,
      actual: firstLine.length,
      expected: constraints.maxLength,
    });
  }

  // Prefix check
  if (constraints.prefix && !firstLine.startsWith(constraints.prefix)) {
    violations.push({
      constraint: 'prefix',
      message: `Missing required prefix: "${constraints.prefix}".`,
      actual: firstLine.slice(0, constraints.prefix.length) || '(empty)',
      expected: constraints.prefix,
    });
  }

  // Suffix check
  if (constraints.suffix && !firstLine.endsWith(constraints.suffix)) {
    violations.push({
      constraint: 'suffix',
      message: `Missing required suffix: "${constraints.suffix}".`,
      actual: firstLine.slice(-constraints.suffix.length) || '(empty)',
      expected: constraints.suffix,
    });
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
