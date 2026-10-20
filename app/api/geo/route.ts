import { NextResponse } from "next/server";
import { GEO_COOKIE, countryFromHeaders } from "@/lib/geo";

/**
 * Country hint for the "Looks like you're in…" banner. Reads Cloudflare's
 * cf-ipcountry (or Vercel's header, or Accept-Language). Never blocks; the
 * user can always override. The IP itself is not stored.
 */
export async function GET(req: Request) {
  const country = countryFromHeaders((n) => req.headers.get(n));
  const res = NextResponse.json({ country }, { headers: { "Cache-Control": "private, no-store" } });
  if (country) res.cookies.set(GEO_COOKIE, country, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  return res;
}
