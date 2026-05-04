export const CONSENT_KEY = 'pg-consent-v1';
export const CONSENT_VERSION = 1;

export interface ConsentState {
  version: number;
  timestamp: number;
  analytics: boolean;
}
