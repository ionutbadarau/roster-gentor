import { Message } from "@/components/form-message";
import Navbar from "@/components/navbar";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { SignUpsClosed } from "@/components/auth/sign-ups-closed";

export default async function Signup(props: {
  searchParams: Promise<Message>;
}) {
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
