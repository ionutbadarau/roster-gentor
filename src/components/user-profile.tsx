'use client'
import { UserCircle } from 'lucide-react'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { createClient } from '../../supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/lib/i18n'

export default function UserProfile() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                    <UserCircle className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={async () => {
                    queryClient.clear()
                    await supabase.auth.signOut()
                    window.location.href = '/sign-in'
                }}>
                    {t('nav.signOut')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

    )
}
