"use strict";
/**
 * Workflow Domain — Index
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunWorkflowHandler = exports.createListWorkflowsHandler = exports.createWorkflowDomain = exports.WorkflowDomainService = void 0;
var service_1 = require("./service");
Object.defineProperty(exports, "WorkflowDomainService", { enumerable: true, get: function () { return service_1.WorkflowDomainService; } });
Object.defineProperty(exports, "createWorkflowDomain", { enumerable: true, get: function () { return service_1.createWorkflowDomain; } });
var handlers_1 = require("./handlers");
Object.defineProperty(exports, "createListWorkflowsHandler", { enumerable: true, get: function () { return handlers_1.createListWorkflowsHandler; } });
Object.defineProperty(exports, "createRunWorkflowHandler", { enumerable: true, get: function () { return handlers_1.createRunWorkflowHandler; } });
//# sourceMappingURL=index.js.map