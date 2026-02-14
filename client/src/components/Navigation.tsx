import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut,
  LayoutDashboard,
  Ticket,
  Users,
  Shield,
  Menu,
} from "lucide-react";
import { UserRole } from "@shared/schema";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Navigation() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const isTechnician = user.role === UserRole.TECHNICIAN;

  const navItems = [
    { href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard, show: !isTechnician },
    { href: "/tickets", label: "Tickets", icon: Ticket, show: !isTechnician },
    { href: "/users", label: "Staff", icon: Users, show: user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN },
  ].filter(item => item.show);

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50" data-testid="navigation-header">
      <div className="container mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg hidden sm:block" data-testid="text-brand-name">
              NetGuard
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2 text-sm font-medium"
                    data-testid={`nav-link-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="text-right">
              <p className="text-sm font-medium leading-none" data-testid="text-user-name">{user.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user.role.replace('_', ' ')}</p>
            </div>
          </div>
          <div className="w-px h-6 bg-border hidden sm:block" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
