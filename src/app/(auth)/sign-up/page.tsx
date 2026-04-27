import { Message } from "@/components/form-message";
import Navbar from "@/components/navbar";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { SignUpsClosed } from "@/components/auth/sign-ups-closed";
import { redirect } from "next/navigation";
import { createClient } from "../../../../supabase/server";

export default async function Signup(props: {
  searchParams: Promise<Message>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return redirect("/grid");
  }

  const searchParams = await props.searchParams;
  const signUpsEnabled = process.env.NEXT_PUBLIC_SIGNUPS_ENABLED === 'true';

  return (
    <>
      <Navbar />
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          {signUpsEnabled ? (
            <SignUpForm message={searchParams} />
          ) : (
            <SignUpsClosed />
          )}
        </div>
      </div>
    </>
  );
}
