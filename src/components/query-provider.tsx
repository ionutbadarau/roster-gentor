'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '../../supabase/client';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id ?? null;

      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        lastUserIdRef.current = null;
        return;
      }

      if (lastUserIdRef.current === undefined) {
        lastUserIdRef.current = currentUserId;
        return;
      }

      if (currentUserId !== lastUserIdRef.current) {
        queryClient.clear();
        lastUserIdRef.current = currentUserId;
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
