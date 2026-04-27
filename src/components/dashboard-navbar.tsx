'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '../../supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Button } from './ui/button'
import { UserCircle, CreditCard, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { ThemeSwitcher } from './theme-switcher'

export default function DashboardNavbar({
  showBilling = false,
}: {
  showBilling?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const { t, language, setLanguage } = useTranslation()
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <UserCircle className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {userEmail && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {userEmail}
                </DropdownMenuItem>
              )}
              {showBilling && (
                <DropdownMenuItem onClick={() => router.push('/billing')}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {t('billing.billingMenuLabel')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push('/account')}>
                <User className="h-4 w-4 mr-2" />
                {t('nav.account')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                await supabase.auth.signOut()
                router.refresh()
              }}>
                {t('nav.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
