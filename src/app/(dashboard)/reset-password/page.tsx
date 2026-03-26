import { Message } from "@/components/form-message";
import Navbar from "@/components/navbar";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPassword(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;

  return (
    <>
      <Navbar />
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <ResetPasswordForm message={searchParams} />
        </div>
      </div>
    </>
  );
}
