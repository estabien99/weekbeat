import type { ActivityType, KnowledgeRule } from '../core/model/types.ts';
import activities from './activities.json' with { type: 'json' };
import rules from './rules.json' with { type: 'json' };

export const knowledgeRules = rules as KnowledgeRule[];
export const activityCatalogue = activities as ActivityType[];
