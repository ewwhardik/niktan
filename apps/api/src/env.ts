export interface Env {
  DB: D1Database;
  AI?: Ai;
  ALLOWED_ORIGINS: string;
  DEMO_MODE: string;
  STAFF_SECRET?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export type AppEnv = { Bindings: Env; Variables: { staff?: StaffClaims } };

export interface StaffClaims {
  sid: string;
  hid: string;
  role: 'nurse' | 'doctor' | 'admin';
  exp: number;
}
