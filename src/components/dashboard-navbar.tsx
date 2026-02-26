'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Button } from './ui/button'
import { UserCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

export default function DashboardNavbar() {
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
    <nav className="w-full border-b border-gray-200 bg-white py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" prefetch className="text-xl font-bold">
            Logo
          </Link>
        </div>
        <div className="flex gap-4 items-center">
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
