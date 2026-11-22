import type { KnowledgeRule } from '../core/model/types.ts';
import rules from './rules.json' with { type: 'json' };

export const knowledgeRules = rules as KnowledgeRule[];
