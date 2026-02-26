"use strict";
/**
 * Command Router — Aiogram-style registry pattern
 * Routes commands to handlers with middleware support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRouter = void 0;
const types_1 = require("./types");
class CommandRouter {
    constructor(logger) {
        this.handlers = {};
        this.middlewares = [];
        this.domains = new Map();
        this.logger = logger;
    }
    /**
     * Register handlers from a domain service.
     * Validates command names upfront, no late binding.
     */
    registerDomain(domain) {
        if (this.domains.has(domain.name)) {
            this.logger.warn(`Domain '${domain.name}' already registered, skipping`, "CommandRouter.registerDomain");
            return;
        }
        const domain_handlers = Object.entries(domain.handlers);
        for (const [name, handler] of domain_handlers) {
            if (this.handlers[name]) {
                const err = {
                    code: "HANDLER_CONFLICT",
                    message: `Handler '${name}' already registered`,
                    context: "CommandRouter.registerDomain",
                };
                this.logger.error(`Cannot register '${name}': handler conflict`, "CommandRouter.registerDomain", err);
                throw err;
            }
            this.handlers[name] = handler;
        }
        this.domains.set(domain.name, domain);
        this.logger.info(`Registered ${domain_handlers.length} handlers from domain '${domain.name}'`, "CommandRouter.registerDomain");
    }
    /**
     * Register a middleware for cross-cutting concerns.
     * Executed in order before handler dispatch.
     */
    use(middleware) {
        this.middlewares.push(middleware);
    }
    /**
     * Dispatch a command through the middleware chain to its handler.
     * Returns Result monad — no exceptions thrown.
     */
    async dispatch(command, context) {
        const handler = this.handlers[command.name];
        if (!handler) {
            const err = {
                code: "HANDLER_NOT_FOUND",
                message: `No handler registered for command '${command.name}'`,
                context: command.name,
            };
            this.logger.warn(`Command not found: ${command.name}`, "CommandRouter.dispatch", err);
            return (0, types_1.failure)(err);
        }
        const mwCtx = {
            commandName: command.name,
            startTime: Date.now(),
            permissions: [],
        };
        try {
            // Execute middleware chain
            await this.executeMiddlewares(mwCtx, 0);
        }
        catch (mwErr) {
            const err = {
                code: "MIDDLEWARE_ERROR",
                message: `Middleware execution failed for '${command.name}'`,
                details: mwErr,
                context: "CommandRouter.dispatch",
            };
            this.logger.error(`Middleware failed: ${command.name}`, "CommandRouter.dispatch", err);
            return (0, types_1.failure)(err);
        }
        try {
            const result = await handler(context, command.params);
            const duration = Date.now() - mwCtx.startTime;
            this.logger.info(`Command '${command.name}' executed in ${duration}ms`, "CommandRouter.dispatch");
            return result;
        }
        catch (handlerErr) {
            const err = {
                code: "HANDLER_ERROR",
                message: `Handler for '${command.name}' threw an exception`,
                details: handlerErr,
                context: command.name,
            };
            this.logger.error(`Handler error: ${command.name}`, "CommandRouter.dispatch", err);
            return (0, types_1.failure)(err);
        }
    }
    /**
     * Execute middleware chain recursively.
     */
    async executeMiddlewares(ctx, index) {
        if (index >= this.middlewares.length) {
            return;
        }
        const middleware = this.middlewares[index];
        await middleware(ctx, () => this.executeMiddlewares(ctx, index + 1));
    }
    /**
     * List registered command names.
     */
    listCommands() {
        return Object.keys(this.handlers);
    }
    /**
     * List registered domains.
     */
    listDomains() {
        return Array.from(this.domains.keys());
    }
    /**
     * Validate that all required commands for a domain are registered.
     */
    async validateDomains() {
        const errors = [];
        for (const [domainName, domain] of this.domains) {
            const domainHandlers = Object.keys(domain.handlers);
            for (const handlerName of domainHandlers) {
                if (!this.handlers[handlerName]) {
                    errors.push(`Domain '${domainName}' handler '${handlerName}' not in registry`);
                }
            }
            // Call domain initialization if defined
            if (domain.initialize) {
                const initResult = await domain.initialize();
                if (initResult.kind === "err") {
                    errors.push(`Domain '${domainName}' initialization failed: ${initResult.error.message}`);
                }
            }
        }
        if (errors.length > 0) {
            const err = {
                code: "VALIDATION_ERROR",
                message: `Domain validation failed`,
                details: errors,
                context: "CommandRouter.validateDomains",
            };
            this.logger.error(`Domain validation failed: ${errors.length} errors`, "CommandRouter.validateDomains", err);
            return (0, types_1.failure)(err);
        }
        this.logger.info(`All ${this.domains.size} domains validated successfully`, "CommandRouter.validateDomains");
        return (0, types_1.success)(void 0);
    }
    /**
     * Cleanup: call teardown on all domains in reverse order.
     */
    async teardown() {
        const domains = Array.from(this.domains.values()).reverse();
        for (const domain of domains) {
            if (domain.teardown) {
                try {
                    await domain.teardown();
                }
                catch (err) {
                    this.logger.warn(`Domain '${domain.name}' teardown threw: ${err}`, "CommandRouter.teardown");
                }
            }
        }
        this.logger.info("Router teardown complete", "CommandRouter.teardown");
    }
}
exports.CommandRouter = CommandRouter;
//# sourceMappingURL=router.js.map