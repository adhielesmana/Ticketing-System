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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export function AppSidebar() {
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
  const isHelpdesk = user.role === UserRole.HELPDESK;

  const dashboardHref = isTechnician
    ? "/dashboard/technician"
    : isHelpdesk
      ? "/dashboard/helpdesk"
      : "/dashboard/admin";

  const navItems = [
    { href: dashboardHref, label: "Dashboard", icon: LayoutDashboard, show: true },
    { href: "/tickets", label: "Tickets", icon: Ticket, show: !isTechnician },
    { href: "/users", label: "Staff", icon: Users, show: isAdmin },
    { href: "/reports", label: "Reports", icon: FileText, show: isAdmin || isHelpdesk },
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
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-8 max-w-[120px] object-contain" data-testid="img-custom-logo" />
          ) : (
            <>
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg" data-testid="text-brand-name">
                NetGuard
              </span>
            </>
          )}
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-link-${item.label.toLowerCase()}`}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Dialog open={logoDialogOpen} onOpenChange={setLogoDialogOpen}>
                    <DialogTrigger asChild>
                      <SidebarMenuButton data-testid="button-logo-settings">
                        <Upload className="w-4 h-4" />
                        <span>Company Logo</span>
                      </SidebarMenuButton>
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
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-none truncate" data-testid="text-user-name">{user.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user.role.replace('_', ' ')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
