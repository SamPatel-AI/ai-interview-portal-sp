import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Allow access in demo mode (no Supabase key configured)
  const hasSupabaseKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (!hasSupabaseKey) return <>{children}</>;

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
