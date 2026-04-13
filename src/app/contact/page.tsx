import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { ContactContent } from './contact-content';

export const metadata = {
  title: 'Contact — PlanGarzi',
  description: 'Contactează echipa PlanGarzi.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <ContactContent />
      </main>
      <Footer />
    </div>
  );
}
