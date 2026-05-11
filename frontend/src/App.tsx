import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/molecules/ProtectedRoute";
import DashboardLayout from "@/components/templates/DashboardLayout";
import ErrorBoundary from "@/components/molecules/ErrorBoundary";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Candidates from "@/pages/Candidates";
import Jobs from "@/pages/Jobs";
import Applications from "@/pages/Applications";
import Agents from "@/pages/Agents";
import Calls from "@/pages/Calls";
import Companies from "@/pages/Companies";
import Emails from "@/pages/Emails";
import Reengagement from "@/pages/Reengagement";
import Analytics from "@/pages/Analytics";
import SettingsPage from "@/pages/Settings";
import ActivityLog from "@/pages/ActivityLog";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="/candidates" element={<ErrorBoundary><Candidates /></ErrorBoundary>} />
                <Route path="/jobs" element={<ErrorBoundary><Jobs /></ErrorBoundary>} />
                <Route path="/applications" element={<ErrorBoundary><Applications /></ErrorBoundary>} />
                <Route path="/agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
                <Route path="/calls" element={<ErrorBoundary><Calls /></ErrorBoundary>} />
                <Route path="/companies" element={<ErrorBoundary><Companies /></ErrorBoundary>} />
                <Route path="/emails" element={<ErrorBoundary><Emails /></ErrorBoundary>} />
                <Route path="/reengagement" element={<ErrorBoundary><Reengagement /></ErrorBoundary>} />
                <Route path="/analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
                <Route path="/activity" element={<ErrorBoundary><ActivityLog /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
