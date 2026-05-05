'use client'
import { UserCircle, CreditCard, User, LogOut } from 'lucide-react'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { createClient } from '../../supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

export default function UserProfile({
    email,
    showBilling = false,
}: {
    email?: string | null
    showBilling?: boolean
}) {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const router = useRouter()
    const { t } = useTranslation()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                    <UserCircle className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {email && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                        {email}
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
                    queryClient.clear()
                    await supabase.auth.signOut()
                    window.location.href = '/sign-in'
                }}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('nav.signOut')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

    )
}
