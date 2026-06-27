import { NextRequest, NextResponse } from "next/server";

const CANONICAL_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_PUBLIC_URL ||
  "https://alfarooq-services.vercel.app";

export function middleware(request: NextRequest) {
  const canonical = new URL(CANONICAL_SITE_URL);
  const host = (request.headers.get("host") || request.nextUrl.host).split(":")[0];
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");

  if (
    acceptsHtml &&
    host.endsWith(".vercel.app") &&
    host !== canonical.hostname
  ) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
    return NextResponse.redirect(url, 308);
  }

  const response = NextResponse.next();

  // Data and admin surfaces must never be indexed or cached off-site, so the
  // course / Q&A payloads cannot be picked up by search or Meta crawlers.
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api") || path.startsWith("/admin")) {
    response.headers.set("X-Robots-Tag", "noindex, noarchive, nosnippet");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
