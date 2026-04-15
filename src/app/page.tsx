import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import MarketingV1 from '@/components/marketing-v1';
import { redirect } from 'next/navigation';
import { createClient } from '../../supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return redirect('/grid');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Navbar />
      <MarketingV1 />
      <Footer />
    </div>
  );
}
