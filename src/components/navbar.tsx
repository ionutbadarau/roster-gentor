import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { createClient } from '../../supabase/server'
import { NavbarLinks } from './navbar-links'

export default async function Navbar() {
  const supabase = createClient()

  const { data: { user } } = await (await supabase).auth.getUser()

  return (
    <nav className="w-full border-b border-border bg-background py-2">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" prefetch className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays className="w-6 h-6 text-blue-600" />
          PlanGarzi
        </Link>
        <NavbarLinks isLoggedIn={!!user} />
      </div>
    </nav>
  )
}
