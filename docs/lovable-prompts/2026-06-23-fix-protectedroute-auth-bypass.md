# Fix: ProtectedRoute bypasses login in production

## Problem
On the deployed site, opening any page (e.g. `/dashboard`) renders the app **without
requiring login**. API calls then fail with "Missing or invalid authorization header"
because there is no Supabase session, so no `Authorization: Bearer` token is sent.

## Root cause
`src/components/molecules/ProtectedRoute.tsx` gates auth on the raw env var:

```js
const hasSupabaseKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
if (!hasSupabaseKey) return <>{children}</>;   // <-- bypasses login when env var is absent
```

`src/lib/supabase.ts` already has a hardcoded production anon-key fallback and exports
`hasSupabaseConfig` (always `true`). So the Supabase client works, but `ProtectedRoute`
wrongly enters "demo mode" whenever the build env var is missing — letting unauthenticated
users through.

## Change
In `src/components/molecules/ProtectedRoute.tsx`:
- Import `hasSupabaseConfig` from `@/lib/supabase`.
- Replace the `import.meta.env.VITE_SUPABASE_ANON_KEY` check with `hasSupabaseConfig`.

Result:
```js
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { hasSupabaseConfig } from '@/lib/supabase';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!hasSupabaseConfig) return <>{children}</>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

## Acceptance
- Visiting `/dashboard` while logged out redirects to `/login`.
- After logging in (`superadmin@saanvi.us`), the dashboard and all pages load with data.
- No "Missing or invalid authorization header" errors.
