import type { TelemetryEvent } from './types.js';
import type { ITelemetry } from './types.js';

/**
 * A no-op telemetry implementation.
 * Safe to use everywhere — never throws, always succeeds.
 * This is the default when no telemetry instance is provided.
 */
export class NullTelemetry implements ITelemetry {
  /**
   * Silently ignore all events.
   */
  emit(_event: TelemetryEvent): void {
    // No-op
  }

  /**
   * No-op dispose.
   */
  dispose(): void {
    // No-op
  }
}
