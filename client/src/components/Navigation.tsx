import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSetting, useUploadFile, useUpdateSetting } from "@/hooks/use-tickets";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import {
  LogOut,
  LayoutDashboard,
  Ticket,
  Users,
  Shield,
  Settings,
  Upload,
  X,
  Loader2,
  FileText,
} from "lucide-react";
import { UserRole } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function Navigation() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: logoSetting } = useSetting("logo_url");
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { mutate: updateSetting } = useUpdateSetting();
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  if (!user) return null;

  const isTechnician = user.role === UserRole.TECHNICIAN;
  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN;

  const navItems = [
    { href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard, show: !isTechnician },
    { href: "/tickets", label: "Tickets", icon: Ticket, show: !isTechnician },
    { href: "/users", label: "Staff", icon: Users, show: isAdmin },
    { href: "/reports", label: "Reports", icon: FileText, show: isAdmin },
    { href: "/settings", label: "Settings", icon: Settings, show: isAdmin },
  ].filter(item => item.show);

  const logoUrl = logoSetting?.value;

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const result = await uploadFile(file);
      updateSetting({ key: "logo_url", value: result.url }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Logo updated" });
          setLogoDialogOpen(false);
        }
      });
    } catch {
      toast({ title: "Error", description: "Failed to upload logo", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemoveLogo() {
    updateSetting({ key: "logo_url", value: null }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Logo removed" });
        setLogoDialogOpen(false);
      }
    });
  }

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50" data-testid="navigation-header">
      <div className="container mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 max-w-[120px] object-contain" data-testid="img-custom-logo" />
            ) : (
              <>
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-lg hidden sm:block" data-testid="text-brand-name">
                  NetGuard
                </span>
              </>
            )}
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
          {isAdmin && (
            <Dialog open={logoDialogOpen} onOpenChange={setLogoDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-logo-settings">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Company Logo</DialogTitle>
                  <DialogDescription>
                    Upload a logo to replace the default brand icon. Recommended size: 200x50px.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {logoUrl && (
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md border">
                      <img src={logoUrl} alt="Current logo" className="h-10 max-w-[160px] object-contain" />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveLogo}
                        data-testid="button-remove-logo"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    data-testid="input-logo-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full gap-2"
                    data-testid="button-upload-logo"
                  >
                    {isUploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Upload New Logo</>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

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
