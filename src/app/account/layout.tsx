import DashboardNavbar from "@/components/dashboard-navbar";
import Footer from "@/components/footer";
import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  const status = await getSubscriptionStatus(user.id);

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardNavbar
        showBilling={
          status.access === "active" || status.access === "past_due"
        }
      />
      <main className="flex-1 w-full bg-background">
        <div className="container mx-auto px-4 py-6 max-w-[100rem]">
          {children}
        </div>
      </main>
      <Footer isLoggedIn />
    </div>
  );
}
