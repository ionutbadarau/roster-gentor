'use client'

import Link from 'next/link'
import { Button } from './ui/button'
import { useTranslation } from '@/lib/i18n'
import UserProfile from './user-profile'
import { ThemeSwitcher } from './theme-switcher'

export function NavbarLinks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t, language, setLanguage } = useTranslation()

  return (
    <div className="flex gap-4 items-center">
      <ThemeSwitcher />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLanguage(language === 'ro' ? 'en' : 'ro')}
        className="text-xs font-semibold px-2"
      >
        {language === 'ro' ? 'EN' : 'RO'}
      </Button>
      {isLoggedIn ? (
        <>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <Button>
              {t('nav.dashboard')}
            </Button>
          </Link>
          <UserProfile />
        </>
      ) : (
        <>
          <Link
            href="/sign-in"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {t('nav.signIn')}
          </Link>
          <Link
            href="/sign-up"
            className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800"
          >
            {t('nav.signUp')}
          </Link>
        </>
      )}
    </div>
  )
}
