// twilio. phase 4 fills in real sending + the inbound webhook.
import type { AppEnv } from "./env";

export function smsConfigured(env: AppEnv): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
}

/** phone for a kid: PHONE_<NAME> secret wins, then the kids table. */
export function kidPhone(env: AppEnv, kid: { name: string; phone: string | null }): string | null {
  const secret = env[`PHONE_${kid.name.toUpperCase()}`];
  return (typeof secret === "string" && secret) || kid.phone || null;
}

export async function sendSms(_env: AppEnv, _to: string, _body: string): Promise<boolean> {
  return false; // simulated until phase 4
}
