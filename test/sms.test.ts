import { describe, it, expect } from "vitest";
import { samePhone, twiml, validTwilioSignature, kidPhone } from "../src/sms";

describe("sms helpers", () => {
  it("matches phones across formats", () => {
    expect(samePhone("+1 (555) 010-0001", "+15550100001")).toBe(true);
    expect(samePhone("+15550100001", "+15550100002")).toBe(false);
    expect(samePhone(null, "+15550100001")).toBe(false);
  });

  it("prefers the PHONE_<NAME> secret over the database", () => {
    const env = { PHONE_MAYA: "+15550100001" } as never;
    expect(kidPhone(env, { name: "Maya", phone: "+19999999999" })).toBe("+15550100001");
    expect(kidPhone({} as never, { name: "Jake", phone: "+15550100002" })).toBe("+15550100002");
  });

  it("escapes replies in twiml", async () => {
    const body = await twiml("fair & square <3").text();
    expect(body).toContain("<Message>fair &amp; square &lt;3</Message>");
    expect(await twiml(null).text()).toContain("<Response></Response>");
  });

  it("validates twilio's documented example signature", async () => {
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    expect(await validTwilioSignature("12345", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
    expect(await validTwilioSignature("12345", url, params, "nope")).toBe(false);
    expect(await validTwilioSignature("12345", url, params, null)).toBe(false);
  });
});
