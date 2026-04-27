import { createClient } from "../../../../supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirect_to = requestUrl.searchParams.get("redirect_to");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL("/sign-in?error=auth_callback_failed", requestUrl.origin),
      );
    }
  }

  const redirectTo = redirect_to || "/grid";
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
