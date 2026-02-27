"use strict";
/**
 * Chat/Copilot Domain Service — local context gathering and task delegation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatDomainService = exports.CHAT_COMMANDS = void 0;
exports.createChatDomain = createChatDomain;
const types_1 = require("../../types");
const handlers_1 = require("./handlers");
/**
 * Chat domain commands.
 */
exports.CHAT_COMMANDS = [
    "chat.context",
    "chat.delegate",
];
class ChatDomainService {
    constructor(gitProvider, logger, dispatcher) {
        this.name = "chat";
        this.handlers = {};
        this.logger = logger;
        this.handlers = {
            "chat.context": (0, handlers_1.createContextHandler)(gitProvider, logger),
            "chat.delegate": (0, handlers_1.createDelegateHandler)(dispatcher, logger),
        };
    }
    async initialize() {
        try {
            this.logger.info("Initializing chat domain", "ChatDomainService.initialize");
            return (0, types_1.success)(void 0);
        }
        catch (err) {
            return (0, types_1.failure)({
                code: "CHAT_INIT_ERROR",
                message: "Failed to initialize chat domain",
                details: err,
                context: "ChatDomainService.initialize",
            });
        }
    }
    async teardown() {
        this.logger.debug("Tearing down chat domain", "ChatDomainService.teardown");
    }
}
exports.ChatDomainService = ChatDomainService;
/**
 * Factory function — creates and returns chat domain service.
 */
function createChatDomain(gitProvider, logger, dispatcher) {
    return new ChatDomainService(gitProvider, logger, dispatcher);
}
//# sourceMappingURL=service.js.map