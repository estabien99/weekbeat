import type { Lang, NewProfile } from '../core/index.ts';

/** Starting values of the person form; the goal is the user's own choice and can be changed right away. */
export const emptyProfile = (lang: Lang): NewProfile => ({
  name: '',
  lang,
  level: 'beginner',
  goal: { kind: 'sessions', target: 3 },
});
