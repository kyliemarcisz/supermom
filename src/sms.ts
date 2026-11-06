// twilio over plain fetch: send texts, read the inbound webhook, answer with TwiML.
import type { AppEnv } from "./env";

export function smsConfigured(env: AppEnv): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
}

/** phone for a kid: PHONE_<NAME> secret wins, then the kids table. */
export function kidPhone(env: AppEnv, kid: { name: string; phone: string | null }): string | null {
  const secret = env[`PHONE_${kid.name.toUpperCase()}`];
  return (typeof secret === "string" && secret) || kid.phone || null;
}

/** compare phones by their last 10 digits so "+1 (555) 010-0001" matches "+15550100001". */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const d = (s: string) => s.replace(/\D/g, "").slice(-10);
  return !!a && !!b && d(a).length >= 7 && d(a) === d(b);
}

export async function sendSms(env: AppEnv, to: string, body: string): Promise<boolean> {
  if (!smsConfigured(env)) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM!, Body: body }),
    });
    if (!res.ok) console.error("twilio send failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("twilio send error", e);
    return false;
  }
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export function twiml(reply: string | null): Response {
  const body = reply ? `<Response><Message>${xml(reply)}</Message></Response>` : "<Response></Response>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { "content-type": "text/xml" } });
}

/** X-Twilio-Signature check: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). */
export async function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  const expected = btoa(String.fromCharCode(...mac));
  return expected.length === signature.length && expected === signature;
}
