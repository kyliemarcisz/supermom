// Env from wrangler types, plus secrets set with `wrangler secret put` (all optional: demo mode without them).
export type AppEnv = Env & {
  ANTHROPIC_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  [key: string]: unknown;
};
