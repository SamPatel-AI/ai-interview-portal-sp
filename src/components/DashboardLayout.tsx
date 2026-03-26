import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Bell, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/candidates': 'Candidates',
  '/jobs': 'Jobs',
  '/applications': 'Applications',
  '/agents': 'AI Agents',
  '/calls': 'Calls',
  '/companies': 'Companies',
  '/emails': 'Emails',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
};

export default function DashboardLayout() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Saanvi AI';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-4 border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <div className="flex-1" />
            <div className="relative hidden md:block w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-8 h-9" />
            </div>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>New Candidate</DropdownMenuItem>
                <DropdownMenuItem>New Job</DropdownMenuItem>
                <DropdownMenuItem>New Agent</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
