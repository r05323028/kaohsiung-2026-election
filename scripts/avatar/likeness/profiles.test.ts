import { describe, expect, it } from 'vitest';
import {
  HEAD_SCRIPTS,
  parseLikenessProfiles,
  profileFor,
  scriptFor,
} from './profiles';

const profiles = parseLikenessProfiles({
  schemaVersion: 1,
  profiles: { 'mayor-lai-rui-long-2026': 'sculpted' },
});

describe('likeness head profiles', () => {
  it('defaults to the shared deform kit', () => {
    expect(profileFor(profiles, 'someone-else')).toBe('deform');
    expect(profileFor(null, 'mayor-lai-rui-long-2026')).toBe('deform');
  });

  it('maps an opted-in appearance to the sculpted generator', () => {
    expect(profileFor(profiles, 'mayor-lai-rui-long-2026')).toBe('sculpted');
    expect(scriptFor(profiles, 'mayor-lai-rui-long-2026')).toBe(
      HEAD_SCRIPTS.sculpted,
    );
    expect(scriptFor(profiles, 'someone-else')).toBe(HEAD_SCRIPTS.deform);
  });

  it('rejects unknown profiles and versions', () => {
    expect(() =>
      parseLikenessProfiles({ schemaVersion: 1, profiles: { a: 'photoreal' } }),
    ).toThrow();
    expect(() =>
      parseLikenessProfiles({ schemaVersion: 2, profiles: {} }),
    ).toThrow();
  });
});
