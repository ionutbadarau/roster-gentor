import { Message } from "@/components/form-message";
import Navbar from "@/components/navbar";
import { SignInForm } from "@/components/auth/sign-in-form";
import { redirect } from "next/navigation";
import { createClient } from "../../../../supabase/server";

interface LoginProps {
  searchParams: Promise<Message>;
}

export default async function SignInPage({ searchParams }: LoginProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return redirect("/grid");
  }

  const message = await searchParams;

  return (
    <>
      <Navbar />
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <SignInForm message={message} />
        </div>
      </div>
    </>
  );
}
