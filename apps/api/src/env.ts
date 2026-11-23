export interface Env {
  DB: D1Database;
  AI?: Ai;
  ALLOWED_ORIGINS: string;
  DEMO_MODE: string;
  /** Days to keep real screenings; simulated visits always go after two days. */
  RETENTION_DAYS?: string;
  /** Commit or build label set at deploy time, reported by /api/health. */
  BUILD_ID?: string;
  STAFF_SECRET?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export type AppEnv = { Bindings: Env; Variables: { staff?: StaffClaims; requestId: string } };

export interface StaffClaims {
  sid: string;
  hid: string;
  role: 'nurse' | 'doctor' | 'admin';
  demoOnly: boolean;
  exp: number;
}
