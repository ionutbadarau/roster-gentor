import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '../../supabase/server'
import { NavbarLinks } from './navbar-links'

export default async function Navbar() {
  const supabase = createClient()

  const { data: { user } } = await (await supabase).auth.getUser()

  return (
    <nav className="w-full border-b border-border bg-background py-2">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" prefetch className="flex items-center gap-2">
          <Image src="/plangarzi-logo.svg" alt="PlanGarzi" width={160} height={48} priority />
        </Link>
        <NavbarLinks isLoggedIn={!!user} />
      </div>
    </nav>
  )
}
