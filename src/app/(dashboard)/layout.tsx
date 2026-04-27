import DashboardNavbar from "@/components/dashboard-navbar";
import DashboardTabs from "@/components/scheduling/dashboard-tabs";
import TrialBanner from "@/components/trial-banner";
import SubscriptionEndBanner from "@/components/subscription-end-banner";
import Footer from "@/components/footer";
import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export default async function DashboardLayout({
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

  const subscriptionStatus = await getSubscriptionStatus(user.id);

  if (
    subscriptionStatus.access === "expired" ||
    subscriptionStatus.access === "canceled"
  ) {
    return redirect("/subscribe");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardNavbar
        showBilling={
          subscriptionStatus.access === "active" ||
          subscriptionStatus.access === "past_due"
        }
      />
      {subscriptionStatus.access === "trial" && (
        <TrialBanner daysRemaining={subscriptionStatus.daysRemaining} />
      )}
      {subscriptionStatus.access === "past_due" && (
        <TrialBanner daysRemaining={0} isPastDue />
      )}
      {subscriptionStatus.access === "active" &&
        subscriptionStatus.cancelAtPeriodEnd && (
          <SubscriptionEndBanner
            endDate={subscriptionStatus.currentPeriodEnd}
          />
        )}
      <main className="flex-1 w-full bg-background">
        <div className="container mx-auto px-4 py-6 max-w-[100rem]">
          <DashboardTabs />
          {children}
        </div>
      </main>
      <Footer isLoggedIn />
    </div>
  );
}
