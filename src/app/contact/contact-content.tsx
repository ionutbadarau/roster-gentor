'use client';

import { useState, FormEvent } from 'react';
import { Phone, Mail, Send } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function ContactContent() {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setSuccess(false);
    setError(false);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message'),
      }),
    });

    setSending(false);

    if (res.ok) {
      setSuccess(true);
      form.reset();
    } else {
      setError(true);
    }
  }

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('marketing.contact.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          {t('marketing.contact.description')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('marketing.contact.nameLabel')}</Label>
            <Input id="name" name="name" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('marketing.contact.emailLabel')}</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{t('marketing.contact.subjectLabel')}</Label>
            <Input id="subject" name="subject" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{t('marketing.contact.messageLabel')}</Label>
            <Textarea id="message" name="message" rows={5} required />
          </div>

          <Button type="submit" disabled={sending} className="w-full">
            {sending ? (
              t('marketing.contact.sending')
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t('marketing.contact.submitButton')}
              </>
            )}
          </Button>

          {success && (
            <p className="text-sm text-green-600 dark:text-green-400">
              {t('marketing.contact.successMessage')}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {t('marketing.contact.errorMessage')}
            </p>
          )}
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('marketing.contact.alternativeEmail')}{' '}
            <a
              href="mailto:contact@plangarzi.ro"
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              contact@plangarzi.ro
            </a>
          </p>

          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-0.5">
                {t('marketing.contact.phone')}
              </p>
              <a
                href="tel:0749284221"
                className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                0749 284 221
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
