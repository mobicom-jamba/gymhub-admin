import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PATHS = ["/", "/gyms", "/users", "/bookings", "/schedules", "/calendar", "/profile", "/visits", "/organizations"];
const HIDDEN_TEMPLATE_PATHS = ["/form-elements", "/basic-tables", "/blank", "/error-404", "/line-chart", "/bar-chart", "/alerts", "/avatars", "/badge", "/buttons", "/images", "/videos", "/modals"];
const AUTH_PATHS = ["/signin", "/signup", "/auth"];

function isAdminPath(pathname: string) {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => pathname.startsWith(p));
}

function isHiddenTemplatePath(pathname: string) {
  return HIDDEN_TEMPLATE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
};

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Handle CORS for API routes
  if (pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
      });
    }
    const response = NextResponse.next({ request: { headers: request.headers } });
    Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAuthPath(pathname)) {
    if (user && !pathname.startsWith("/auth")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (isHiddenTemplatePath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isAdminPath(pathname) && !user) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

