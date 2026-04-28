import { Message } from "@/components/form-message";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { encodedRedirect } from "@/utils/utils";
import { createClient } from "../../../supabase/server";

type SearchParams = Message & { code?: string };

export default async function ResetPassword(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const code = searchParams.code ?? "";

  if (!code) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return encodedRedirect(
        "error",
        "/sign-in",
        "Invalid or expired password reset link. Please request a new one.",
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <ResetPasswordForm message={searchParams} code="" mode="in-app" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <ResetPasswordForm message={searchParams} code={code} mode="recovery" />
      </div>
    </div>
  );
}
