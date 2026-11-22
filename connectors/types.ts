import type { Availability, LoggedActivity, Place, PlannedSession, Programme } from '../core/index.ts';

/**
 * The one interface every connector implements (concept doc → "Connectors").
 * Connectors are optional: everything they deliver can also be entered by hand.
 * They feed the core with data; they never decide (only the planner decides).
 */
export type ConnectorKind =
  'membership' | 'coach-plan' | 'activities' | 'calendar' | 'context' | 'smart-home' | 'household';

export type Capability =
  | 'read-activities'
  | 'read-busy-times'
  | 'write-planned-sessions'
  | 'read-places'
  | 'read-programme'
  | 'read-weather'
  | 'send-reminders';

export interface SettingField {
  key: string;
  label: { de: string; en: string };
  type: 'text' | 'url' | 'secret' | 'number' | 'boolean';
  /** Secrets stay on the device; they are never exported in plain text or logged. */
  required?: boolean;
}

export interface Permission {
  /** What leaves the device, to which host, and why — shown before the user enables the connector. */
  host: string;
  sends: { de: string; en: string };
  healthData: boolean;
}

export interface SyncResult {
  activities?: LoggedActivity[];
  availability?: Availability[];
  places?: Place[];
  programmes?: Programme[];
  weather?: { date: string; summary: string; precipitationMm?: number; tempMaxC?: number }[];
  warnings?: string[];
}

export interface SyncContext {
  settings: Record<string, string | number | boolean>;
  from: string;
  to: string;
  signal?: AbortSignal;
}

export interface Connector {
  id: string;
  name: string;
  kind: ConnectorKind;
  /** Roadmap version that introduces it, e.g. "0.2". */
  since: string;
  capabilities: Capability[];
  settings: SettingField[];
  permissions: Permission[];
  sync(ctx: SyncContext): Promise<SyncResult>;
  /** Only for connectors with 'write-planned-sessions'. */
  push?(ctx: SyncContext, sessions: PlannedSession[]): Promise<void>;
}
