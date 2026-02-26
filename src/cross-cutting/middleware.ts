/**
 * Cross-cutting middleware for logging, error handling, and authentication.
 * Declaratively applied to all commands.
 */

import { Middleware, MiddlewareContext, Logger, AppError } from "../types";

/**
 * Logging middleware — tracks command execution time and outcomes.
 */
export function createLoggingMiddleware(logger: Logger): Middleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    logger.debug(
      `[${ctx.commandName}] Starting execution`,
      "LoggingMiddleware",
      { commandName: ctx.commandName }
    );

    const start = Date.now();
    try {
      await next();
      const duration = Date.now() - start;
      logger.info(
        `[${ctx.commandName}] Completed in ${duration}ms`,
        "LoggingMiddleware",
        { commandName: ctx.commandName, duration }
      );
    } catch (err) {
      const duration = Date.now() - start;
      logger.error(
        `[${ctx.commandName}] Failed after ${duration}ms`,
        "LoggingMiddleware",
        {
          code: "MIDDLEWARE_ERROR",
          message: `Command execution failed`,
          details: err,
          context: ctx.commandName,
        } as AppError
      );
      throw err;
    }
  };
}

/**
 * Permission middleware — checks command-level access control.
 */
export function createPermissionMiddleware(
  logger: Logger,
  permissionChecker: (commandName: string) => boolean
): Middleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    const allowed = permissionChecker(ctx.commandName);

    if (!allowed) {
      const err: AppError = {
        code: "PERMISSION_DENIED",
        message: `User lacks permission to execute '${ctx.commandName}'`,
        context: ctx.commandName,
      };
      logger.warn(
        `Permission denied: ${ctx.commandName}`,
        "PermissionMiddleware",
        err
      );
      throw err;
    }

    logger.debug(
      `[${ctx.commandName}] Permission granted`,
      "PermissionMiddleware"
    );
    await next();
  };
}

/**
 * Rate-limiting middleware — prevents command spam.
 */
export function createRateLimitMiddleware(
  logger: Logger,
  maxPerSecond: number = 10
): Middleware {
  const callTimes: Map<string, number[]> = new Map();

  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    const now = Date.now();
    const key = ctx.commandName;
    const times = callTimes.get(key) || [];

    // Remove calls older than 1 second
    const recentCalls = times.filter((t) => now - t < 1000);

    if (recentCalls.length >= maxPerSecond) {
      const err: AppError = {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded for '${ctx.commandName}'`,
        context: ctx.commandName,
      };
      logger.warn(
        `Rate limit: ${ctx.commandName}`,
        "RateLimitMiddleware",
        err
      );
      throw err;
    }

    recentCalls.push(now);
    callTimes.set(key, recentCalls);
    await next();
  };
}

/**
 * Audit middleware — logs significant state changes for compliance.
 */
export function createAuditMiddleware(logger: Logger): Middleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    // Commands that should be audited (git mutations, cleanup, etc.)
    const auditCommands = [
      "git.commit",
      "git.pull",
      "hygiene.cleanup",
      "chat.delegate",
    ];

    if (auditCommands.includes(ctx.commandName)) {
      logger.info(
        `[AUDIT] Command invoked: ${ctx.commandName}`,
        "AuditMiddleware",
        { commandName: ctx.commandName, timestamp: new Date().toISOString() }
      );
    }

    await next();
  };
}
