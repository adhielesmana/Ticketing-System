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
  ArrowRight,
  Wifi,
  Wrench,
  Home,
  Lock,
  CheckCircle2,
  Activity,
  TrendingUp,
  Timer,
  ChevronDown,
} from "lucide-react";

const features = [
  {
    icon: Clock,
    title: "SLA Enforcement",
    description: "Automatic deadline tracking with real-time countdown timers. 24h for maintenance, 72h for installations.",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500",
    stat: "24h",
    statLabel: "Response Time",
  },
  {
    icon: Users,
    title: "Smart Assignment",
    description: "Intelligent workload distribution with a 4:2 maintenance-to-installation ratio and backbone specialist isolation.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500",
    stat: "4:2",
    statLabel: "Ratio",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description: "Real-time dashboards with SLA compliance rates, resolution times, and individual technician metrics.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500",
    stat: "100%",
    statLabel: "Visibility",
  },
  {
    icon: MapPin,
    title: "Location Tracking",
    description: "Integrated map previews for every ticket. Technicians see customer locations from their mobile view.",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500",
    stat: "GPS",
    statLabel: "Integrated",
  },
  {
    icon: Bell,
    title: "Overdue Alerts",
    description: "Automatic status escalation when SLA deadlines pass. Never miss a critical service window.",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500",
    stat: "0",
    statLabel: "Missed SLAs",
  },
  {
    icon: Lock,
    title: "Role-Based Access",
    description: "Four distinct roles — Superadmin, Admin, Helpdesk, Technician — each with tailored permissions.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500",
    stat: "4",
    statLabel: "Roles",
  },
];

export default function LandingPage() {
  const { data: logoSetting } = useSetting("logo_url");
  const logoUrl = logoSetting?.value;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
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
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#workflow" className="hover:text-foreground transition-colors">Workflow</a>
            <a href="#roles" className="hover:text-foreground transition-colors">Roles</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button className="gap-2" data-testid="button-landing-login">
                Sign In
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-[85vh] flex items-center">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px]" style={{
            background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(221 83% 53% / 0.15), transparent)"
          }} />
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full opacity-[0.04]" style={{
            background: "radial-gradient(circle, hsl(221 83% 53%), transparent)"
          }} />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full opacity-[0.03]" style={{
            background: "radial-gradient(circle, hsl(142 76% 36%), transparent)"
          }} />
          <div className="absolute top-1/2 left-0 w-full h-px opacity-[0.06]" style={{
            background: "linear-gradient(90deg, transparent, hsl(221 83% 53%), transparent)"
          }} />

          <svg className="absolute top-32 right-[15%] w-6 h-6 text-primary/10 animate-pulse" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>
          <svg className="absolute top-60 left-[10%] w-4 h-4 text-emerald-500/10 animate-pulse" style={{animationDelay: "1s"}} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          <svg className="absolute bottom-40 right-[25%] w-5 h-5 text-violet-500/10 animate-pulse" style={{animationDelay: "2s"}} viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,22 2,22"/></svg>
        </div>

        <div className="container mx-auto px-4 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold rounded-full tracking-wide" data-testid="badge-hero">
                <Activity className="w-3.5 h-3.5" />
                FTTH NETWORK OPS PLATFORM
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-display font-bold tracking-tight leading-[1.08]" data-testid="text-hero-title">
                Keep Your Fiber
                <br />
                Network{" "}
                <span className="relative">
                  <span className="text-primary">Running</span>
                  <span className="absolute -bottom-1 left-0 w-full h-1 bg-primary/30 rounded-full" />
                </span>
                {" "}Flawlessly
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                The all-in-one ticketing and maintenance system built for FTTH ISPs.
                Track SLAs, dispatch technicians, and resolve issues faster than ever.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-3">
                <Link href="/login">
                  <Button size="lg" className="gap-2 text-base px-8 shadow-lg shadow-primary/20" data-testid="button-hero-login">
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <a href="#features">
                  <Button variant="outline" size="lg" className="gap-2 text-base px-8" data-testid="button-hero-features">
                    Explore Features
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </a>
              </div>
            </div>

            <div className="hidden lg:block relative">
              <div className="relative mx-auto w-full max-w-md">
                <Card className="relative z-10 shadow-xl">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                          <Activity className="w-4 h-4 text-primary-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">Live Dashboard</p>
                          <p className="text-[10px] text-muted-foreground">Real-time overview</p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded-full font-medium">Online</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { val: "12", label: "Open", color: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500", pct: 40 },
                        { val: "8", label: "In Progress", color: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", pct: 27 },
                        { val: "156", label: "Resolved", color: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", pct: 88 },
                      ].map((s, i) => (
                        <div key={i} className="bg-muted/50 rounded-md p-3 space-y-2">
                          <p className={`text-xl font-display font-bold ${s.color}`}>{s.val}</p>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${s.bar} transition-all`} style={{ width: `${s.pct}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Tickets</p>
                      {[
                        { id: "INC-4821", type: "Home Maintenance", sla: "2h 15m left", icon: Home, slaColor: "text-amber-600 dark:text-amber-400" },
                        { id: "INC-4820", type: "New Installation", sla: "On track", icon: Wrench, slaColor: "text-emerald-600 dark:text-emerald-400" },
                        { id: "INC-4819", type: "Backbone", sla: "Resolved", icon: Wifi, slaColor: "text-muted-foreground" },
                      ].map((t, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded bg-background flex items-center justify-center border border-border">
                              <t.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold">{t.id}</p>
                              <p className="text-[10px] text-muted-foreground">{t.type}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-medium ${t.slaColor}`}>{t.sla}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="absolute -top-3 -right-3 z-20">
                  <div className="bg-emerald-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" />
                    98.7% SLA
                  </div>
                </div>
                <div className="absolute -bottom-3 -left-3 z-20">
                  <div className="bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                    <Timer className="w-3 h-3" />
                    Avg 45min
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px mt-20 rounded-md overflow-hidden border border-border bg-border">
            {[
              { value: "99.9%", label: "Uptime Target", icon: Activity },
              { value: "24h", label: "Maintenance SLA", icon: Clock },
              { value: "72h", label: "Installation SLA", icon: Timer },
              { value: "4:2", label: "Workload Ratio", icon: Users },
            ].map((stat, i) => (
              <div key={i} className="bg-card p-5 text-center space-y-1" data-testid={`text-stat-${i}`}>
                <stat.icon className="w-5 h-5 mx-auto text-primary/40 mb-2" />
                <div className="text-2xl md:text-3xl font-display font-bold text-primary">
                  {stat.value}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 relative" id="ticket-types">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Ticket Management</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mt-3" data-testid="text-types-title">
              Three Ticket Types, One System
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Every type of fiber work order managed with appropriate SLA enforcement and specialist routing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Home,
                title: "Home Maintenance",
                sla: "24h",
                description: "Residential fiber issues — LOS, slow speeds, and connectivity drops.",
                gradient: "from-blue-500 to-blue-600",
                lightBg: "bg-blue-50 dark:bg-blue-950/30",
                pct: 75,
              },
              {
                icon: Wifi,
                title: "Backbone Maintenance",
                sla: "24h",
                description: "Core network infrastructure and backbone fiber repairs by specialists.",
                gradient: "from-violet-500 to-violet-600",
                lightBg: "bg-violet-50 dark:bg-violet-950/30",
                pct: 60,
              },
              {
                icon: Wrench,
                title: "New Installation",
                sla: "72h",
                description: "Fresh FTTH installations, ONT setup, and speed provisioning.",
                gradient: "from-emerald-500 to-emerald-600",
                lightBg: "bg-emerald-50 dark:bg-emerald-950/30",
                pct: 90,
              },
            ].map((type, i) => (
              <Card key={i} className="group relative overflow-visible">
                <div className={`absolute -top-4 left-5 w-12 h-12 rounded-md bg-gradient-to-br ${type.gradient} flex items-center justify-center shadow-lg`}>
                  <type.icon className="w-6 h-6 text-white" />
                </div>
                <CardContent className="pt-12 p-6 space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-lg">{type.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{type.description}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">SLA Compliance</span>
                      <span className="font-bold">{type.pct}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${type.gradient} transition-all duration-1000`}
                        style={{ width: `${type.pct}%` }}
                      />
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${type.lightBg}`}>
                    <Clock className="w-3 h-3" />
                    {type.sla} SLA
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-20 md:py-28" id="features">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Capabilities</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mt-3" data-testid="text-features-title">
              Built for ISP Operations
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Every feature designed around the real challenges of managing fiber-to-the-home networks at scale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <Card key={i} className="group">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`w-11 h-11 rounded-md ${feature.bg} flex items-center justify-center shadow-sm`}>
                      <feature.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-display font-bold">{feature.stat}</p>
                      <p className="text-[10px] text-muted-foreground">{feature.statLabel}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 relative" id="workflow">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-0 w-full h-px opacity-[0.06]" style={{
            background: "linear-gradient(90deg, transparent, hsl(221 83% 53%), transparent)"
          }} />
        </div>
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Process</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mt-3" data-testid="text-how-title">
              How It Works
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              From ticket creation to resolution — a streamlined workflow in three steps.
            </p>
          </div>

          <div className="max-w-4xl mx-auto relative">
            <div className="hidden md:block absolute top-16 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 opacity-20" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  step: 1,
                  title: "Create Ticket",
                  description: "Helpdesk logs the customer issue with details, photos, and location data.",
                  icon: ClipboardIcon,
                  gradient: "from-blue-500 to-blue-600",
                },
                {
                  step: 2,
                  title: "Assign & Dispatch",
                  description: "Technicians grab tickets with a partner or admins assign manually based on workload.",
                  icon: Users,
                  gradient: "from-violet-500 to-violet-600",
                },
                {
                  step: 3,
                  title: "Resolve & Close",
                  description: "Technician completes work, uploads proof, and the system logs performance metrics.",
                  icon: CheckCircle2,
                  gradient: "from-emerald-500 to-emerald-600",
                },
              ].map((step, i) => (
                <div key={i} className="relative text-center">
                  <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg relative z-10`}>
                    <step.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="mt-5">
                    <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">
                      Step {step.step}
                    </div>
                    <h3 className="font-display font-bold text-lg">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-xs mx-auto">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-20 md:py-28" id="roles">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Access Control</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mt-3" data-testid="text-roles-title">
              Tailored for Every Role
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Each team member gets the right tools and the right view for their responsibilities.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                role: "Superadmin",
                desc: "Full system control, user management, branding, and global configuration.",
                icon: Shield,
                gradient: "from-red-500 to-red-600",
                permissions: ["User CRUD", "System Settings", "Branding"],
              },
              {
                role: "Admin",
                desc: "Dashboard analytics, ticket oversight, technician assignment, and staff management.",
                icon: BarChart3,
                gradient: "from-blue-500 to-blue-600",
                permissions: ["Dashboard", "Assign Tickets", "Reports"],
              },
              {
                role: "Helpdesk",
                desc: "Ticket creation, customer communication, manual dispatch, and status monitoring.",
                icon: Bell,
                gradient: "from-violet-500 to-violet-600",
                permissions: ["Create Tickets", "Dispatch", "Monitor"],
              },
              {
                role: "Technician",
                desc: "Mobile-first task view, partner selection, location maps, and close-out workflow.",
                icon: Wrench,
                gradient: "from-emerald-500 to-emerald-600",
                permissions: ["Get Ticket", "Upload Proof", "Track SLA"],
              },
            ].map((r, i) => (
              <Card key={i} className="group relative overflow-visible">
                <div className={`absolute -top-4 left-5 w-10 h-10 rounded-md bg-gradient-to-br ${r.gradient} flex items-center justify-center shadow-lg`}>
                  <r.icon className="w-5 h-5 text-white" />
                </div>
                <CardContent className="pt-10 p-5 space-y-3">
                  <h3 className="font-display font-bold text-base">{r.role}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
                  <div className="space-y-1.5 pt-1">
                    {r.permissions.map((p, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-muted-foreground">{p}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(135deg, hsl(221 83% 53% / 0.06), hsl(142 76% 36% / 0.04))"
        }} />
        <div className="container mx-auto px-4 lg:px-8 py-20 md:py-28 relative">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight" data-testid="text-cta-title">
              Ready to Streamline Your Operations?
            </h2>
            <p className="text-muted-foreground text-lg max-w-lg mx-auto">
              Sign in to start managing your FTTH network with precision and efficiency.
            </p>
            <Link href="/login">
              <Button size="lg" className="gap-2 text-base px-10 mt-2 shadow-lg shadow-primary/20" data-testid="button-cta-login">
                Sign In Now
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card py-8">
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

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" /><path d="M12 16h4" />
      <path d="M8 11h.01" /><path d="M8 16h.01" />
    </svg>
  );
}
