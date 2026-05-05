'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '../../supabase/client'
import { Button } from './ui/button'
import { useTranslation } from '@/lib/i18n'
import { ThemeSwitcher } from './theme-switcher'
import UserProfile from './user-profile'

export default function DashboardNavbar({
  showBilling = false,
}: {
  showBilling?: boolean
}) {
  const supabase = createClient()
  const { language, setLanguage } = useTranslation()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  return (
    <nav className="w-full border-b border-border bg-background py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" prefetch>
            <Image src="/plangarzi-logo.svg" alt="PlanGarzi" width={160} height={48} priority />
          </Link>
        </div>
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
          <UserProfile email={userEmail} showBilling={showBilling} />
        </div>
      </div>
    </nav>
  )
}
