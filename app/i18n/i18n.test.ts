import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

function keys(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('German and English have the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });
});
