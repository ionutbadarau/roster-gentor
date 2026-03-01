import DashboardNavbar from "@/components/dashboard-navbar";
import DashboardTabs from "@/components/scheduling/dashboard-tabs";
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
    <>
      <DashboardNavbar />
      <main className="w-full min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 max-w-[100rem]">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Doctor Shift Scheduling</h1>
          </div>
          <DashboardTabs />
          {children}
        </div>
      </main>
    </>
  );
}
