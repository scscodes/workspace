/**
 * CommandRouter Tests (4 tests)
 * Testing handler registration, dispatch, and middleware execution
 */

import { describe, it, expect } from 'vitest';
import { CommandRouter } from '../src/router';
import {
  MockLogger,
  createMockContext,
  assertSuccess,
  assertFailure,
  createMockMiddleware,
} from './fixtures';
import { DomainService, Handler } from '../src/types';

describe('CommandRouter', () => {
  // Test 1: registerDomain() adds handlers
  it('should register domain handlers', () => {
    const logger = new MockLogger();
    const router = new CommandRouter(logger);

    const domain: DomainService = {
      name: 'test-domain',
      handlers: {
        'git.status': async (ctx, params) => {
          return { kind: 'ok' as const, value: { branch: 'main' } };
        },
        'git.pull': async (ctx, params) => {
          return { kind: 'ok' as const, value: { success: true } };
        },
      },
    };

    router.registerDomain(domain);
    const commands = router.listCommands();

    expect(commands).toContain('git.status');
    expect(commands).toContain('git.pull');
    expect(router.listDomains()).toContain('test-domain');
  });

  // Test 2: dispatch() calls correct handler
  it('should dispatch to correct handler', async () => {
    const logger = new MockLogger();
    const router = new CommandRouter(logger);

    let handlerCalled = false;
    const domain: DomainService = {
      name: 'dispatch-test',
      handlers: {
        'git.status': async (ctx, params) => {
          handlerCalled = true;
          return {
            kind: 'ok' as const,
            value: { branch: params.branch || 'main' },
          };
        },
      },
    };

    router.registerDomain(domain);

    const result = await router.dispatch(
      { name: 'git.status', params: { branch: 'develop' } },
      createMockContext()
    );

    const value = assertSuccess(result);
    expect(handlerCalled).toBe(true);
    expect(value.branch).toBe('develop');
  });

  // Test 3: middleware execution order correct
  it('should execute middlewares in order', async () => {
    const logger = new MockLogger();
    const router = new CommandRouter(logger);
    const executionOrder: string[] = [];

    const mw1 = createMockMiddleware((name) => executionOrder.push('mw1'));
    const mw2 = createMockMiddleware((name) => executionOrder.push('mw2'));

    router.use(mw1);
    router.use(mw2);

    const domain: DomainService = {
      name: 'mw-test',
      handlers: {
        'git.status': async (ctx, params) => {
          executionOrder.push('handler');
          return { kind: 'ok' as const, value: {} };
        },
      },
    };

    router.registerDomain(domain);

    const result = await router.dispatch(
      { name: 'git.status', params: {} },
      createMockContext()
    );

    assertSuccess(result);

    // Middlewares should execute in order before handler
    expect(executionOrder).toEqual(['mw1', 'mw2', 'handler']);
  });

  // Test 4: handler error caught and returned as Result
  it('should catch handler errors and return as Result', async () => {
    const logger = new MockLogger();
    const router = new CommandRouter(logger);

    const domain: DomainService = {
      name: 'error-test',
      handlers: {
        'git.status': async (ctx, params) => {
          throw new Error('Handler exception');
        },
      },
    };

    router.registerDomain(domain);

    const result = await router.dispatch(
      { name: 'git.status', params: {} },
      createMockContext()
    );

    const error = assertFailure(result);
    expect(error.code).toBe('HANDLER_ERROR');
    expect(error.message).toContain('Handler');
  });

  // Bonus: test handler not found
  it('should return error for unregistered handler', async () => {
    const logger = new MockLogger();
    const router = new CommandRouter(logger);

    const result = await router.dispatch(
      { name: 'git.nonexistent', params: {} },
      createMockContext()
    );

    const error = assertFailure(result);
    expect(error.code).toBe('HANDLER_NOT_FOUND');
  });

  // Bonus: test middleware error handling
  it('should handle middleware errors gracefully', async () => {
    const logger = new MockLogger();
    const router = new CommandRouter(logger);

    const badMiddleware = async (ctx: any, next: () => Promise<void>) => {
      throw new Error('Middleware error');
    };

    router.use(badMiddleware);

    const domain: DomainService = {
      name: 'mw-error-test',
      handlers: {
        'git.status': async (ctx, params) => {
          return { kind: 'ok' as const, value: {} };
        },
      },
    };

    router.registerDomain(domain);

    const result = await router.dispatch(
      { name: 'git.status', params: {} },
      createMockContext()
    );

    const error = assertFailure(result);
    expect(error.code).toBe('MIDDLEWARE_ERROR');
  });
});
