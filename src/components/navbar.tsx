import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '../../supabase/server'
import { NavbarLinks } from './navbar-links'
import { getSubscriptionStatus } from '@/lib/subscription'

export default async function Navbar() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let showBilling = false
  if (user) {
    const subscriptionStatus = await getSubscriptionStatus(user.id)
    showBilling =
      subscriptionStatus.access === 'active' ||
      subscriptionStatus.access === 'past_due'
  }

  return (
    <nav className="w-full border-b border-border bg-background py-2">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" prefetch className="flex items-center gap-2">
          <Image src="/plangarzi-logo.svg" alt="PlanGarzi" width={160} height={48} priority />
        </Link>
        <NavbarLinks
          isLoggedIn={!!user}
          email={user?.email ?? null}
          showBilling={showBilling}
        />
      </div>
    </nav>
  )
}
