import {
  FileText,
  Globe,
  LayoutDashboard,
  Lock,
  Menu,
  Palette,
  Plug,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { StatusDot } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { useIntegrations, useLock, useSettings } from '@/features/api-hooks';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/markets', label: 'Markets', icon: Globe },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/templates', label: 'Templates', icon: Palette },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Wordmark() {
  const settings = useSettings();
  const logoUrl = settings.data?.globalLogoUrl;
  const name = settings.data?.companyName ?? 'Codario Labs';
  return (
    <div className="flex min-h-9 items-center gap-2.5 px-2">
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="h-7 max-w-[140px] object-contain" />
      ) : (
        <div className="grid leading-tight">
          <span className="text-sm font-semibold tracking-[-0.01em] text-ink">{name}</span>
          <span className="text-xs text-muted">SEO Reports</span>
        </div>
      )}
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex h-8 items-center gap-2.5 rounded-control px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
              isActive ? 'bg-ink/[0.06] text-ink' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn('size-4', isActive ? 'text-ink' : 'text-muted')} aria-hidden />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const integrations = useIntegrations();
  const lock = useLock();
  const google = integrations.data?.google;
  const tone = !google
    ? 'neutral'
    : google.connected && google.status === 'CONNECTED'
      ? 'success'
      : google.status === 'EXPIRED' || google.status === 'ERROR' || google.status === 'REVOKED'
        ? 'danger'
        : 'neutral';
  const label = !google
    ? 'Checking connection'
    : google.connected
      ? google.status === 'CONNECTED'
        ? 'Search Console connected'
        : 'Search Console needs attention'
      : 'Search Console not connected';

  return (
    <div className="grid gap-2 border-t border-line pt-3">
      <NavLink
        to="/integrations"
        className="grid gap-0.5 rounded-control px-2 py-1.5 hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
      >
        <span className="flex items-center gap-2 text-ui font-medium text-ink">
          <StatusDot tone={tone} />
          {label}
        </span>
        {google?.email ? <span className="truncate pl-4 text-xs text-muted">{google.email}</span> : null}
      </NavLink>
      <Button variant="ghost" size="sm" className="justify-start px-2" loading={lock.isPending} onClick={() => lock.mutate()}>
        <Lock />
        Lock workspace
      </Button>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <Wordmark />
      <div className="flex-1">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <SidebarFooter />
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current = NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <SidebarContent />
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
          <Menu />
        </Button>
        <span className="text-sm font-semibold">{current?.label ?? 'Codario Labs'}</span>
      </div>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Main navigation</DialogDescription>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
