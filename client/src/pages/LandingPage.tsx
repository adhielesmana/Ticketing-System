import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSetting } from "@/hooks/use-tickets";
import {
  Shield,
  Zap,
  Clock,
  Users,
  BarChart3,
  MapPin,
  Bell,
  CheckCircle2,
  ArrowRight,
  Wifi,
  Wrench,
  Home,
  ChevronRight,
  Lock,
} from "lucide-react";

const features = [
  {
    icon: Clock,
    title: "SLA Enforcement",
    description: "Automatic deadline tracking with real-time countdown timers. 24h for maintenance, 72h for installations.",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/50",
  },
  {
    icon: Users,
    title: "Smart Assignment",
    description: "Intelligent workload distribution with a 4:2 maintenance-to-installation ratio. Backbone specialist isolation.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/50",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description: "Real-time dashboards with SLA compliance rates, resolution times, and individual technician metrics.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
  {
    icon: MapPin,
    title: "Location Tracking",
    description: "Integrated map previews for every ticket. Technicians see customer locations directly from their mobile view.",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/50",
  },
  {
    icon: Bell,
    title: "Overdue Alerts",
    description: "Automatic status escalation when SLA deadlines pass. Never miss a critical service window again.",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/50",
  },
  {
    icon: Lock,
    title: "Role-Based Access",
    description: "Four distinct roles — Superadmin, Admin, Helpdesk, and Technician — each with tailored permissions and views.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/50",
  },
];

const ticketTypes = [
  {
    icon: Home,
    title: "Home Maintenance",
    sla: "24h SLA",
    description: "Residential fiber issues — LOS, slow speeds, and connectivity drops.",
    color: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
  {
    icon: Wifi,
    title: "Backbone Maintenance",
    sla: "24h SLA",
    description: "Core network infrastructure and backbone fiber repairs by specialists.",
    color: "text-violet-600 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-800",
  },
  {
    icon: Wrench,
    title: "New Installation",
    sla: "72h SLA",
    description: "Fresh FTTH installations, ONT setup, and speed provisioning.",
    color: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
  },
];

const steps = [
  {
    step: "01",
    title: "Create Ticket",
    description: "Helpdesk logs the customer issue with details, photos, and location data.",
  },
  {
    step: "02",
    title: "Auto-Assign or Dispatch",
    description: "Technicians grab tickets or admins assign manually based on workload and specialization.",
  },
  {
    step: "03",
    title: "Resolve & Close",
    description: "Technician completes work, uploads proof, and the system logs performance metrics.",
  },
];

export default function LandingPage() {
  const { data: logoSetting } = useSetting("logo_url");
  const logoUrl = logoSetting?.value;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border" data-testid="landing-header">
        <div className="container mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-9 max-w-[140px] object-contain" data-testid="img-landing-logo" />
            ) : (
              <>
                <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-xl">NetGuard</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="outline" className="gap-2" data-testid="button-landing-login">
                Sign In
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(221 83% 53% / 0.12), transparent)"
        }} />
        <div className="container mx-auto px-4 lg:px-8 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full" data-testid="badge-hero">
              <Zap className="w-3.5 h-3.5" />
              FTTH Network Operations Platform
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.1]" data-testid="text-hero-title">
              Keep Your Fiber Network{" "}
              <span className="text-primary">Running Flawlessly</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The all-in-one ticketing and maintenance management system built for FTTH Internet Service Providers. 
              Track SLAs, dispatch technicians, and resolve issues faster.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link href="/login">
                <Button size="lg" className="gap-2 text-base px-8" data-testid="button-hero-login">
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button variant="outline" size="lg" className="gap-2 text-base px-8" data-testid="button-hero-features">
                  Explore Features
                </Button>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-3xl mx-auto">
            {[
              { value: "99.9%", label: "Uptime Target" },
              { value: "24h", label: "Maintenance SLA" },
              { value: "72h", label: "Installation SLA" },
              { value: "4:2", label: "Workload Ratio" },
            ].map((stat, i) => (
              <div key={i} className="text-center p-4">
                <div className="text-2xl md:text-3xl font-display font-bold text-primary" data-testid={`text-stat-${i}`}>
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-20 md:py-28" id="ticket-types">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight" data-testid="text-types-title">
              Three Ticket Types, One System
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Every type of fiber work order managed with appropriate SLA enforcement and specialist routing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {ticketTypes.map((type, i) => (
              <Card key={i} className={`${type.border}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <type.icon className={`w-8 h-8 ${type.color}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${type.color}`}>
                      {type.sla}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">{type.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{type.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28" id="features">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight" data-testid="text-features-title">
              Built for ISP Operations
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Every feature designed around the real challenges of managing fiber-to-the-home networks at scale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <Card key={i}>
                <CardContent className="p-6 space-y-3">
                  <div className={`w-10 h-10 rounded-md ${feature.bg} flex items-center justify-center`}>
                    <feature.icon className={`w-5 h-5 ${feature.color}`} />
                  </div>
                  <h3 className="font-display font-bold text-base">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-20 md:py-28" id="how-it-works">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight" data-testid="text-how-title">
              How It Works
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              From ticket creation to resolution — a streamlined workflow in three steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="relative text-center md:text-left">
                <div className="text-5xl font-display font-bold text-primary/10 mb-3">
                  {step.step}
                </div>
                <h3 className="font-display font-bold text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.description}</p>
                {i < steps.length - 1 && (
                  <ChevronRight className="hidden md:block absolute top-12 -right-3 w-6 h-6 text-muted-foreground/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28" id="roles">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight" data-testid="text-roles-title">
              Tailored for Every Role
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Each team member gets the right tools and the right view for their responsibilities.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {[
              {
                role: "Superadmin",
                desc: "Full system control, user management, branding, and global configuration.",
                icon: Shield,
                color: "text-red-600 dark:text-red-400",
                bg: "bg-red-50 dark:bg-red-950/50",
              },
              {
                role: "Admin",
                desc: "Dashboard analytics, ticket oversight, technician assignment, and staff management.",
                icon: BarChart3,
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-950/50",
              },
              {
                role: "Helpdesk",
                desc: "Ticket creation, customer communication, manual dispatch, and status monitoring.",
                icon: Bell,
                color: "text-violet-600 dark:text-violet-400",
                bg: "bg-violet-50 dark:bg-violet-950/50",
              },
              {
                role: "Technician",
                desc: "Mobile-first task view, auto-assign pickup, location maps, and close-out workflow.",
                icon: Wrench,
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-950/50",
              },
            ].map((r, i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <div className={`w-10 h-10 rounded-md ${r.bg} flex items-center justify-center`}>
                    <r.icon className={`w-5 h-5 ${r.color}`} />
                  </div>
                  <h3 className="font-display font-bold">{r.role}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="container mx-auto px-4 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight" data-testid="text-cta-title">
              Ready to Streamline Your Operations?
            </h2>
            <p className="text-muted-foreground text-lg">
              Sign in to start managing your FTTH network with precision and efficiency.
            </p>
            <Link href="/login">
              <Button size="lg" className="gap-2 text-base px-10 mt-2" data-testid="button-cta-login">
                Sign In Now
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-6 max-w-[100px] object-contain opacity-60" />
              ) : (
                <>
                  <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-display font-semibold text-sm text-muted-foreground">NetGuard</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span>FTTH Ticketing & Maintenance System</span>
            </div>
            <div className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
