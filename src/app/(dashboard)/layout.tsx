import DashboardNavbar from "@/components/dashboard-navbar";
import DashboardTabs from "@/components/scheduling/dashboard-tabs";
import Footer from "@/components/footer";
import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";

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

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardNavbar />
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
