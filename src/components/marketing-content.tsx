'use client';

import { ArrowUpRight, CheckCircle2, Shield, Users, Zap } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function MarketingContent() {
  const { t } = useTranslation();

  return (
    <>
      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">{t('marketing.whyChooseUs')}</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">{t('marketing.whyChooseUsDesc')}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Zap className="w-6 h-6" />, title: t('marketing.lightning'), description: t('marketing.lightningDesc') },
              { icon: <Shield className="w-6 h-6" />, title: t('marketing.security'), description: t('marketing.securityDesc') },
              { icon: <Users className="w-6 h-6" />, title: t('marketing.teamCollab'), description: t('marketing.teamCollabDesc') },
              { icon: <CheckCircle2 className="w-6 h-6" />, title: t('marketing.uptime'), description: t('marketing.uptimeDesc') }
            ].map((feature, index) => (
              <div key={index} className="p-6 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="text-blue-600 mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">$1M+</div>
              <div className="text-blue-100">{t('marketing.fundingRaised')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">500+</div>
              <div className="text-blue-100">{t('marketing.happyCustomers')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">99.9%</div>
              <div className="text-blue-100">{t('marketing.uptimeGuaranteed')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">{t('marketing.ctaTitle')}</h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">{t('marketing.ctaDesc')}</p>
          <a href="/dashboard" className="inline-flex items-center px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            {t('marketing.getStartedNow')}
            <ArrowUpRight className="ml-2 w-4 h-4" />
          </a>
        </div>
      </section>
    </>
  );
}
