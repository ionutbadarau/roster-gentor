import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";
import AccountClient from "./account-client";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  return <AccountClient userEmail={user.email ?? ""} />;
}
