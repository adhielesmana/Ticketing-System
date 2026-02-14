import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  LayoutDashboard, 
  Ticket, 
  Users, 
  Shield 
} from "lucide-react";
import { UserRole } from "@shared/schema";

export function Navigation() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const isTechnician = user.role === UserRole.TECHNICIAN;

  return (
    <header className="bg-background border-b border-border sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl text-primary hidden md:block">
              NetGuard ISP
            </span>
          </Link>

          {!isTechnician && (
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/dashboard/admin">
                <Button 
                  variant={location.startsWith("/dashboard") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/tickets">
                <Button 
                  variant={location.startsWith("/tickets") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Ticket className="w-4 h-4" />
                  All Tickets
                </Button>
              </Link>
              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) && (
                <Link href="/users">
                  <Button 
                    variant={location.startsWith("/users") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Staff
                  </Button>
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => logout()}
            className="text-muted-foreground"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
