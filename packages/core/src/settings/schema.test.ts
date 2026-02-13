import { describe, it, expect } from 'vitest';
import { normalizeSettings, validateSettings } from './schema.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import type { ExtensionSettings } from '../types/index.js';

describe('normalizeSettings', () => {
  it('returns defaults for empty input', () => {
    const result = normalizeSettings({});
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('overrides top-level values', () => {
    const result = normalizeSettings({ mode: 'performance' });
    expect(result.mode).toBe('performance');
    expect(result.providerSource).toBe(DEFAULT_SETTINGS.providerSource);
  });

  it('merges nested modelTiers', () => {
    const result = normalizeSettings({ modelTiers: { high: 'opus' } } as Partial<ExtensionSettings>);
    expect(result.modelTiers.high).toBe('opus');
    expect(result.modelTiers.mid).toBe(DEFAULT_SETTINGS.modelTiers.mid);
    expect(result.modelTiers.low).toBe(DEFAULT_SETTINGS.modelTiers.low);
  });

  it('merges nested commitConstraints', () => {
    const result = normalizeSettings({
      commitConstraints: { minLength: 5 } as ExtensionSettings['commitConstraints'],
    });
    expect(result.commitConstraints.minLength).toBe(5);
    expect(result.commitConstraints.maxLength).toBe(DEFAULT_SETTINGS.commitConstraints.maxLength);
  });
});

describe('validateSettings', () => {
  it('returns no errors for valid settings', () => {
    const errors = validateSettings(DEFAULT_SETTINGS);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid mode', () => {
    const settings = { ...DEFAULT_SETTINGS, mode: 'turbo' as ExtensionSettings['mode'] };
    const errors = validateSettings(settings);
    expect(errors.some((e) => e.includes('mode'))).toBe(true);
  });

  it('rejects invalid provider source', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      providerSource: 'magic' as ExtensionSettings['providerSource'],
    };
    const errors = validateSettings(settings);
    expect(errors.some((e) => e.includes('providerSource'))).toBe(true);
  });

  it('requires directApi when source is direct', () => {
    const settings = { ...DEFAULT_SETTINGS, providerSource: 'direct' as const };
    const errors = validateSettings(settings);
    expect(errors.some((e) => e.includes('directApi'))).toBe(true);
  });

  it('accepts valid directApi config', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providerSource: 'direct',
      directApi: { provider: 'anthropic', apiKey: 'sk-test-key' },
    };
    const errors = validateSettings(settings);
    expect(errors).toHaveLength(0);
  });

  it('rejects negative minLength', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      commitConstraints: { ...DEFAULT_SETTINGS.commitConstraints, minLength: -1 },
    };
    const errors = validateSettings(settings);
    expect(errors.some((e) => e.includes('minLength'))).toBe(true);
  });

  it('rejects maxLength < minLength', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      commitConstraints: {
        ...DEFAULT_SETTINGS.commitConstraints,
        minLength: 50,
        maxLength: 10,
      },
    };
    const errors = validateSettings(settings);
    expect(errors.some((e) => e.includes('maxLength'))).toBe(true);
  });

  it('rejects unsupported language', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      enabledLanguages: ['typescript', 'rust' as ExtensionSettings['enabledLanguages'][number]],
    };
    const errors = validateSettings(settings);
    expect(errors.some((e) => e.includes('rust'))).toBe(true);
  });
});
