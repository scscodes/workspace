/**
 * Command Router — Aiogram-style registry pattern
 * Routes commands to handlers with middleware support.
 */
import { Command, CommandContext, CommandName, Middleware, Result, DomainService } from "./types";
import { Logger } from "./types";
export declare class CommandRouter {
    private handlers;
    private middlewares;
    private logger;
    private domains;
    constructor(logger: Logger);
    /**
     * Register handlers from a domain service.
     * Validates command names upfront, no late binding.
     */
    registerDomain(domain: DomainService): void;
    /**
     * Register a middleware for cross-cutting concerns.
     * Executed in order before handler dispatch.
     */
    use(middleware: Middleware): void;
    /**
     * Dispatch a command through the middleware chain to its handler.
     * Returns Result monad — no exceptions thrown.
     */
    dispatch(command: Command, context: CommandContext): Promise<Result<unknown>>;
    /**
     * Execute middleware chain recursively.
     */
    private executeMiddlewares;
    /**
     * List registered command names.
     */
    listCommands(): CommandName[];
    /**
     * List registered domains.
     */
    listDomains(): string[];
    /**
     * Validate that all required commands for a domain are registered.
     */
    validateDomains(): Promise<Result<void>>;
    /**
     * Cleanup: call teardown on all domains in reverse order.
     */
    teardown(): Promise<void>;
}
//# sourceMappingURL=router.d.ts.map