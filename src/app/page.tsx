import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import MarketingV1 from '@/components/marketing-v1';
import AccountDeletedToast from '@/components/account-deleted-toast';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '../../supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return redirect('/grid');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Suspense fallback={null}>
        <AccountDeletedToast />
      </Suspense>
      <Navbar />
      <MarketingV1 />
      <Footer />
    </div>
  );
}
