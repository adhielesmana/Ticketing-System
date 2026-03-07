import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Shield, Lock } from "lucide-react";
import { UserRole } from "@shared/schema";
import { useEffect } from "react";
import { useSetting } from "@/hooks/use-tickets";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { login, isLoggingIn, user } = useAuth();
  const [_, setLocation] = useLocation();
  const { data: logoSetting } = useSetting("logo_url");
  const logoUrl = logoSetting?.value;

  useEffect(() => {
    if (user) {
      if (user.role === UserRole.TECHNICIAN) {
        setLocation("/dashboard/technician");
      } else if (user.role === UserRole.HELPDESK) {
        setLocation("/dashboard/helpdesk");
      } else {
        setLocation("/dashboard/admin");
      }
    }
  }, [user, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    login(values);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, hsl(221 83% 53% / 0.05) 0%, hsl(199 89% 48% / 0.05) 100%)" }}>
      <div className="w-full max-w-sm">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center justify-center gap-4 pt-10 pb-6 px-6 bg-gradient-to-br from-slate-50 to-white">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company Logo"
                className="h-16 max-w-[220px] object-contain"
                data-testid="img-login-logo"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-border flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary" />
              </div>
            )}
          </div>
          <CardContent className="pt-6 space-y-4">
            <CardHeader className="pb-2 pt-0 text-left">
              <CardTitle className="text-lg font-semibold">Sign In</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Enter your credentials to access the system
              </CardDescription>
            </CardHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your username" {...field} data-testid="input-username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your password" {...field} data-testid="input-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoggingIn}
                  data-testid="button-login"
                >
                  {isLoggingIn ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t pt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              <span>Protected System. Authorized Access Only.</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
