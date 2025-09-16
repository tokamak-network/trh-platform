import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Define protected routes that require authentication
const protectedRoutes = [
  "/dashboard",
  "/admin",
  "/settings",
  "/rollup",
  "/explore",
  "/analytics",
  "/users",
  "/configuration",
  "/notification",
  "/support",
];

// Define public routes that don't require authentication
const publicRoutes = ["/auth", "/design-system"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Check if the current path is a public route (like auth)
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Check if the path is for static assets or API routes
  const isStaticOrApiRoute =
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes("favicon.ico");

  // Get the token from cookies
  const token = request.cookies.get("auth-token")?.value;

  // Skip middleware for static assets and API routes
  if (isStaticOrApiRoute) {
    return NextResponse.next();
  }

  // If accessing a protected route without a token, redirect to auth
  if (isProtectedRoute && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // If accessing auth page with a token, redirect to dashboard
  if (isPublicRoute && token && pathname === "/auth") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // If accessing root page with a token, redirect to dashboard
  if (pathname === "/" && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // For any other route that's not explicitly public and has no token, redirect to auth
  if (!isPublicRoute && !token && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
