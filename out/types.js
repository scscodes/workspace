"use strict";
/**
 * Core type definitions for the DDD-based command router.
 * No external dependencies; explicit types, no magic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = success;
exports.failure = failure;
function success(value) {
    return { kind: "ok", value };
}
function failure(error) {
    return { kind: "err", error };
}
//# sourceMappingURL=types.js.map