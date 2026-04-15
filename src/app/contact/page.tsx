import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { ContactContent } from './contact-content';
import { createClient } from '../../../supabase/server';

export const metadata = {
  title: 'Contact — PlanGarzi',
  description: 'Contactează echipa PlanGarzi.',
};

export default async function ContactPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <ContactContent />
      </main>
      <Footer isLoggedIn={!!user} />
    </div>
  );
}
