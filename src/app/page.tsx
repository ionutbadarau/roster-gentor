import Footer from '@/components/footer';
import Navbar from '@/components/navbar';
import MarketingV1 from '@/components/marketing-v1';

export default async function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Navbar />
      <MarketingV1 />
      <Footer />
    </div>
  );
}
