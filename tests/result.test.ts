/**
 * Result Monad Tests (3 tests)
 * Testing Result<T> Either-like behavior: success, failure, mapping, chaining
 */

import { describe, it, expect } from 'vitest';
import {
  Result,
  success,
  failure,
  AppError,
} from '../src/types';

describe('Result Monad', () => {
  // Test 1: success() creates ok result
  it('should create ok result with success()', () => {
    const result: Result<string> = success('test value');

    expect(result.kind).toBe('ok');
    expect(result.kind === 'ok' && result.value).toBe('test value');
  });

  // Test 2: failure() creates err result
  it('should create err result with failure()', () => {
    const error: AppError = {
      code: 'TEST_ERROR',
      message: 'Test error message',
      context: 'test-context',
    };

    const result: Result<string> = failure(error);

    expect(result.kind).toBe('err');
    expect(result.kind === 'err' && result.error).toBe(error);
    expect(result.kind === 'err' && result.error.code).toBe('TEST_ERROR');
  });

  // Test 3: Mapping and chaining works (isOk, isErr helpers)
  it('should support pattern matching and transformation', () => {
    const successResult: Result<number> = success(42);
    const failureResult: Result<number> = failure({
      code: 'ERR',
      message: 'Failed',
    });

    // Test success case
    let okValue = '';
    if (successResult.kind === 'ok') {
      okValue = `got: ${successResult.value}`;
    }
    expect(okValue).toBe('got: 42');

    // Test failure case
    let errCode = '';
    if (failureResult.kind === 'err') {
      errCode = failureResult.error.code;
    }
    expect(errCode).toBe('ERR');

    // Test chaining with map pattern
    const chain = (r: Result<number>): Result<string> => {
      if (r.kind === 'ok') {
        return success(`value: ${r.value * 2}`);
      } else {
        return failure({
          code: 'CHAIN_ERROR',
          message: r.error.message,
        });
      }
    };

    const chained = chain(successResult);
    expect(chained.kind).toBe('ok');
    expect(chained.kind === 'ok' && chained.value).toBe('value: 84');

    const chainedErr = chain(failureResult);
    expect(chainedErr.kind).toBe('err');
  });
});
