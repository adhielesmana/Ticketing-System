import { useTicket, useCloseTicket, useStartTicket, useAssignTicket, useReassignTicket, useUploadFile, useUploadImages, useFreeTechnicians, useNoResponseTicket, useRejectTicket, useCancelReject, useCloseByHelpdesk, useUpdateTicket, useReopenTicket } from "@/hooks/use-tickets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useParams, Link } from "wouter";
import { SLAIndicator } from "@/components/SLAIndicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  AlertOctagon,
  CheckCircle2,
  ExternalLink,
  Zap,
  UserCheck,
  ImageIcon,
  Map,
  Upload,
  X,
  Loader2,
  Camera,
  Network,
  PhoneOff,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const priorityColors: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  waiting_assignment: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pending_rejection: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function toCapName(name: string): string {
  if (!name) return "";
  return name.replace(/\b\w/g, c => c.toUpperCase());
}

function toTitleCase(str: string): string {
  if (!str) return "";
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

const attentionStatuses = new Set(["pending_rejection", "open"]);
const attentionDotColors: Record<string, string> = {
  pending_rejection: "bg-orange-500",
  open: "bg-blue-500",
};
function AttentionDot({ status, slaOverdue }: { status: string; slaOverdue?: boolean }) {
  if (slaOverdue) {
    return <span className="inline-block w-2 h-2 rounded-full bg-red-500 attention-dot" />;
  }
  if (!attentionStatuses.has(status)) return null;
  const color = attentionDotColors[status] || "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} attention-dot`} />;
}

function extractCoordinates(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const patterns = [
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /@([-\d.]+),([-\d.]+)/,
    /place\/([-\d.]+),([-\d.]+)/,
    /ll=([-\d.]+),([-\d.]+)/,
    /center=([-\d.]+),([-\d.]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

function GoogleMapsPreview({ url }: { url: string }) {
  const coords = extractCoordinates(url);
  if (!coords) return null;

  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.005},${coords.lat - 0.003},${coords.lng + 0.005},${coords.lat + 0.003}&layer=mapnik&marker=${coords.lat},${coords.lng}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Map className="w-3 h-3" />
        Customer Location
      </div>
      <div className="rounded-md overflow-hidden border border-border">
        <iframe
          src={embedUrl}
          className="w-full h-48"
          title="Customer Location Map"
          data-testid="map-preview"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary inline-flex items-center gap-1"
        data-testid="link-open-maps"
      >
        <ExternalLink className="w-3 h-3" />
        Open in Google Maps
      </a>
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: technicians } = useUsers("technician");
  const hasOneAssignee = ticket?.assignees?.length === 1;
  const { data: freeTechnicians } = useFreeTechnicians(
    hasOneAssignee ? ticket?.assignees?.[0]?.id : undefined,
    hasOneAssignee
  );

  const { mutate: assignTicket } = useAssignTicket();
  const { mutate: reassignTicket, isPending: isReassigning } = useReassignTicket();
  const { mutate: startTicket } = useStartTicket();
  const { mutate: closeTicket } = useCloseTicket();
  const { mutate: noResponse, isPending: isReportingNoResponse } = useNoResponseTicket();
  const { mutate: rejectTicket, isPending: isRejecting } = useRejectTicket();
  const { mutate: cancelReject, isPending: isCancellingReject } = useCancelReject();
  const { mutate: closeByHelpdesk, isPending: isClosingByHelpdesk } = useCloseByHelpdesk();
  const { mutate: updateTicket, isPending: isUpdatingTicket } = useUpdateTicket();
  const { mutate: reopenTicket, isPending: isReopening } = useReopenTicket();

  const { mutateAsync: uploadFile, isPending: isUploadingFile } = useUploadFile();
  const { mutateAsync: uploadMultiple, isPending: isUploadingMultiple } = useUploadImages();
  const { toast } = useToast();

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [noResponseDialogOpen, setNoResponseDialogOpen] = useState(false);
  const [noResponseReason, setNoResponseReason] = useState("");
  const [rejectReasonDialogOpen, setRejectReasonDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [helpdeskCloseDialogOpen, setHelpdeskCloseDialogOpen] = useState(false);
  const [helpdeskCloseReason, setHelpdeskCloseReason] = useState("");
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignTech1, setReassignTech1] = useState<string>("");
  const [reassignTech2, setReassignTech2] = useState<string>("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenTech1, setReopenTech1] = useState<string>("");
  const [reopenTech2, setReopenTech2] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [closeData, setCloseData] = useState({
    actionDescription: "",
    speedtestImageUrl: "",
    proofImageUrls: [] as string[],
    closedNote: ""
  });

  const speedtestInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 lg:p-6 max-w-4xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-64 md:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="container mx-auto p-4 lg:p-6 max-w-4xl">
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Ticket not found</p>
          <Link href="/tickets">
            <Button variant="outline" className="mt-4 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Tickets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSpeedtestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadFile(file);
      setCloseData(prev => ({ ...prev, speedtestImageUrl: result.url }));
    } catch {
      toast({ title: "Error", description: "Failed to upload speedtest image", variant: "destructive" });
    }
    if (speedtestInputRef.current) speedtestInputRef.current.value = "";
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const result = await uploadMultiple(Array.from(files));
      setCloseData(prev => ({ ...prev, proofImageUrls: [...prev.proofImageUrls, ...result.urls] }));
    } catch {
      toast({ title: "Error", description: "Failed to upload proof images", variant: "destructive" });
    }
    if (proofInputRef.current) proofInputRef.current.value = "";
  };

  const removeProofImage = (index: number) => {
    setCloseData(prev => ({
      ...prev,
      proofImageUrls: prev.proofImageUrls.filter((_, i) => i !== index)
    }));
  };

  const handleClose = () => {
    closeTicket({
      id: ticketId,
      actionDescription: closeData.actionDescription,
      speedtestImageUrl: closeData.speedtestImageUrl || undefined,
      proofImageUrls: closeData.proofImageUrls.length > 0 ? closeData.proofImageUrls : undefined,
      closedNote: closeData.closedNote,
    }, {
      onSuccess: () => setCloseDialogOpen(false)
    });
  };

  const isAssignedToMe = ticket.assignees?.some((a: any) => a.id === user?.id) || ticket.assignee?.id === user?.id;
  const canManage = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'helpdesk';
  const descImages: string[] = ticket.descriptionImages || [];
  const hasMapPreview = ticket.customerLocationUrl && extractCoordinates(ticket.customerLocationUrl);

  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tickets">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground" data-testid="text-ticket-id">#{ticket.ticketIdCustom || ticket.ticketNumber}</span>
            <Badge className={`${priorityColors[ticket.priority] || ""} text-[10px] capitalize`}>
              {ticket.priority}
            </Badge>
            <AttentionDot status={ticket.status} slaOverdue={!['closed', 'rejected'].includes(ticket.status) && new Date(ticket.slaDeadline) < new Date()} />
            <Badge className={`${statusColors[ticket.status] || ""} text-[10px] capitalize`}>
              {ticket.status.replace(/_/g, ' ')}
            </Badge>
            {!['closed', 'rejected'].includes(ticket.status) && (
              new Date(ticket.slaDeadline) < new Date() ? (
                <Badge className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 text-[10px]">
                  Overdue
                </Badge>
              ) : (
                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
                  On Time
                </Badge>
              )
            )}
            {canManage && !['closed', 'rejected'].includes(ticket.status) ? (
              <Select
                value={ticket.type}
                onValueChange={(newType) => {
                  if (newType === ticket.type) return;
                  updateTicket({ id: ticketId, type: newType }, {
                    onSuccess: () => toast({ title: "Success", description: "Ticket type updated. Fees and SLA recalculated." }),
                    onError: () => toast({ title: "Error", description: "Failed to update ticket type", variant: "destructive" }),
                  });
                }}
                disabled={isUpdatingTicket}
              >
                <SelectTrigger className="h-6 w-auto gap-1 px-2 text-[10px] capitalize border-dashed" data-testid="select-ticket-type">
                  {isUpdatingTicket ? <Loader2 className="w-3 h-3 animate-spin" /> : <SelectValue />}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home_maintenance" className="capitalize text-xs">Home Maintenance</SelectItem>
                  <SelectItem value="backbone_maintenance" className="capitalize text-xs">Backbone Maintenance</SelectItem>
                  <SelectItem value="installation" className="capitalize text-xs">Installation</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="text-[10px] capitalize">
                {ticket.type.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-bold font-display mt-1" data-testid="text-ticket-title">{toTitleCase(ticket.title)}</h1>
        </div>
      </div>

      {!['closed', 'rejected'].includes(ticket.status) && (
        <div className="max-w-xs">
          <SLAIndicator
            deadline={ticket.slaDeadline as unknown as string}
            createdAt={ticket.createdAt as unknown as string}
            status={ticket.status}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground" data-testid="text-ticket-description">
                {ticket.description}
              </p>

              {hasMapPreview && (
                <GoogleMapsPreview url={ticket.customerLocationUrl} />
              )}

              {descImages.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <ImageIcon className="w-3 h-3" />
                    Attachments ({descImages.length})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {descImages.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setImagePreview(url)}
                        className="rounded-md overflow-visible border border-border hover-elevate"
                        data-testid={`button-preview-image-${i}`}
                      >
                        <img
                          src={url}
                          alt={`Attachment ${i + 1}`}
                          className="w-full h-28 object-cover rounded-md"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {ticket.status === 'closed' && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <CardTitle className="text-base">Resolution</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ticket.actionDescription && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Action Taken</p>
                    <p className="text-sm">{ticket.actionDescription}</p>
                  </div>
                )}
                {ticket.speedtestImageUrl && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Speedtest Screenshot</p>
                    <button
                      onClick={() => setImagePreview(ticket.speedtestImageUrl)}
                      className="rounded-md overflow-visible border border-border hover-elevate"
                      data-testid="button-preview-speedtest"
                    >
                      <img
                        src={ticket.speedtestImageUrl}
                        alt="Speedtest result"
                        className="w-full max-w-xs h-32 object-cover rounded-md"
                      />
                    </button>
                  </div>
                )}
                {ticket.speedtestResult && !ticket.speedtestImageUrl && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Speedtest</p>
                    <p className="text-sm font-mono">{ticket.speedtestResult}</p>
                  </div>
                )}
                {(ticket.proofImageUrls && ticket.proofImageUrls.length > 0) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Proof Images ({ticket.proofImageUrls.length})</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ticket.proofImageUrls.map((url: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => setImagePreview(url)}
                          className="rounded-md overflow-visible border border-border hover-elevate"
                          data-testid={`button-preview-proof-${i}`}
                        >
                          <img
                            src={url}
                            alt={`Proof ${i + 1}`}
                            className="w-full h-28 object-cover rounded-md"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {ticket.proofImageUrl && (!ticket.proofImageUrls || ticket.proofImageUrls.length === 0) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Proof</p>
                    <button
                      onClick={() => setImagePreview(ticket.proofImageUrl)}
                      className="rounded-md overflow-visible border border-border hover-elevate"
                      data-testid="button-preview-proof-legacy"
                    >
                      <img
                        src={ticket.proofImageUrl}
                        alt="Proof"
                        className="w-full max-w-xs h-28 object-cover rounded-md"
                      />
                    </button>
                  </div>
                )}
                {ticket.closedNote && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm">{ticket.closedNote}</p>
                  </div>
                )}
                {ticket.reopenReason && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Reopen History</p>
                    <p className="text-sm whitespace-pre-line">{ticket.reopenReason}</p>
                  </div>
                )}
                {canManage && (
                  <div className="pt-2">
                    <Dialog open={reopenDialogOpen} onOpenChange={(open) => {
                      setReopenDialogOpen(open);
                      if (open) {
                        const assignees = ticket.assignees || (ticket.assignee ? [ticket.assignee] : []);
                        setReopenTech1(assignees[0] ? String(assignees[0].id) : "");
                        setReopenTech2(assignees[1] ? String(assignees[1].id) : "");
                        setReopenReason("");
                      } else {
                        setReopenReason(""); setReopenTech1(""); setReopenTech2("");
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-reopen-ticket">
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reopen & Reassign
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Reopen Ticket</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-sm">Reason for Reopening</Label>
                            <Textarea
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              placeholder="Why is this ticket being reopened?"
                              className="text-sm"
                              data-testid="input-reopen-reason"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm">Lead Technician</Label>
                            <Select value={reopenTech1} onValueChange={setReopenTech1}>
                              <SelectTrigger className="capitalize" data-testid="select-reopen-tech1">
                                <SelectValue placeholder="Select technician..." />
                              </SelectTrigger>
                              <SelectContent>
                                {technicians?.filter((t: any) => t.role === 'technician').map((tech: any) => (
                                  <SelectItem key={tech.id} value={String(tech.id)} disabled={String(tech.id) === reopenTech2}>
                                    {tech.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm">Partner (Optional)</Label>
                            <Select value={reopenTech2} onValueChange={setReopenTech2}>
                              <SelectTrigger className="capitalize" data-testid="select-reopen-tech2">
                                <SelectValue placeholder="Select partner..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No partner</SelectItem>
                                {technicians?.filter((t: any) => t.role === 'technician').map((tech: any) => (
                                  <SelectItem key={tech.id} value={String(tech.id)} disabled={String(tech.id) === reopenTech1}>
                                    {tech.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => {
                              if (!reopenReason.trim()) return toast({ title: "Error", description: "Please provide a reason", variant: "destructive" });
                              if (!reopenTech1) return toast({ title: "Error", description: "Please select a technician", variant: "destructive" });
                              const techIds = [Number(reopenTech1)];
                              if (reopenTech2 && reopenTech2 !== "none") techIds.push(Number(reopenTech2));
                              reopenTicket({ id: ticketId, reason: reopenReason.trim(), technicianIds: techIds });
                              setReopenDialogOpen(false);
                              setReopenReason("");
                              setReopenTech1("");
                              setReopenTech2("");
                            }}
                            disabled={isReopening || !reopenReason.trim() || !reopenTech1}
                            data-testid="button-confirm-reopen"
                          >
                            {isReopening ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Reopening...</> : "Reopen Ticket"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {['pending_rejection', 'rejected'].includes(ticket.status) && ticket.rejectionReason && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <PhoneOff className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                    {ticket.status === 'rejected' ? 'Ticket Rejected - Customer No Response' : 'Customer No Response (Pending Review)'}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{ticket.rejectionReason}</p>
                {canManage && ticket.status === 'pending_rejection' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Dialog open={rejectReasonDialogOpen} onOpenChange={setRejectReasonDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" size="sm" data-testid="button-confirm-reject">
                          Confirm Reject & Close
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <PhoneOff className="w-5 h-5 text-red-600 dark:text-red-400" />
                            Confirm Reject & Close
                          </DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                          This will permanently reject the ticket with zero bonus. Please provide a reason.
                        </p>
                        <Textarea
                          placeholder="Enter rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          data-testid="input-reject-reason"
                        />
                        <Button
                          variant="destructive"
                          disabled={!rejectReason.trim() || isRejecting}
                          data-testid="button-submit-reject"
                          onClick={() => {
                            rejectTicket({ id: ticketId, reason: rejectReason.trim() });
                            setRejectReasonDialogOpen(false);
                            setRejectReason("");
                          }}
                        >
                          {isRejecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Rejecting...</> : "Confirm Reject"}
                        </Button>
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelReject(ticketId)}
                      disabled={isCancellingReject}
                      data-testid="button-cancel-reject"
                    >
                      {isCancellingReject ? <><Loader2 className="w-4 h-4 animate-spin" /> Reopening...</> : <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Cancel Reject (Reopen)</>}
                    </Button>

                    <Dialog open={helpdeskCloseDialogOpen} onOpenChange={setHelpdeskCloseDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="secondary" size="sm" data-testid="button-close-by-helpdesk">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Close Ticket
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            Close Ticket by Helpdesk
                          </DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                          Close this ticket with normal bonus calculation. Please provide a reason why helpdesk is closing it.
                        </p>
                        <Textarea
                          placeholder="Enter reason for closing..."
                          value={helpdeskCloseReason}
                          onChange={(e) => setHelpdeskCloseReason(e.target.value)}
                          data-testid="input-helpdesk-close-reason"
                        />
                        <Button
                          disabled={!helpdeskCloseReason.trim() || isClosingByHelpdesk}
                          data-testid="button-submit-helpdesk-close"
                          onClick={() => {
                            closeByHelpdesk({ id: ticketId, reason: helpdeskCloseReason.trim() });
                            setHelpdeskCloseDialogOpen(false);
                            setHelpdeskCloseReason("");
                          }}
                        >
                          {isClosingByHelpdesk ? <><Loader2 className="w-4 h-4 animate-spin" /> Closing...</> : "Close Ticket"}
                        </Button>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isAssignedToMe && (ticket.status === 'assigned' || ticket.status === 'in_progress') && (
            <div className="flex flex-wrap gap-3">
              {ticket.status === 'assigned' && (
                <Button onClick={() => startTicket(ticketId)} data-testid="button-start-work">
                  Start Work
                </Button>
              )}

              <Dialog open={noResponseDialogOpen} onOpenChange={setNoResponseDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-no-response">
                    <PhoneOff className="w-4 h-4 mr-1.5" />
                    No Response
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <PhoneOff className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      No Response
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">Report that the customer did not respond. This ticket will be sent to admin for review.</p>
                  <Textarea
                    placeholder="Enter reason (e.g. Customer unreachable after 3 call attempts)"
                    value={noResponseReason}
                    onChange={(e) => setNoResponseReason(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="input-no-response-reason-detail"
                  />
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => { setNoResponseDialogOpen(false); setNoResponseReason(""); }}>Cancel</Button>
                    <Button
                      onClick={() => {
                        if (!noResponseReason.trim()) return;
                        noResponse({ id: ticketId, rejectionReason: noResponseReason.trim() }, {
                          onSuccess: () => { setNoResponseDialogOpen(false); setNoResponseReason(""); },
                        });
                      }}
                      disabled={!noResponseReason.trim() || isReportingNoResponse}
                      data-testid="button-confirm-no-response-detail"
                    >
                      {isReportingNoResponse ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : "Submit"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {ticket.status === 'in_progress' && (
                <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-complete-close">
                      Complete & Close
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Close Ticket</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <Label>Action Taken</Label>
                        <Textarea
                          placeholder="What did you do to resolve this?"
                          value={closeData.actionDescription}
                          onChange={e => setCloseData({...closeData, actionDescription: e.target.value})}
                          data-testid="textarea-action"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Speedtest Screenshot</Label>
                        <input
                          ref={speedtestInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSpeedtestUpload}
                          className="hidden"
                          data-testid="input-speedtest-file"
                        />
                        {closeData.speedtestImageUrl ? (
                          <div className="relative rounded-md overflow-visible border border-border">
                            <img
                              src={closeData.speedtestImageUrl}
                              alt="Speedtest"
                              className="w-full h-32 object-cover rounded-md"
                            />
                            <Button
                              variant="secondary"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={() => setCloseData(prev => ({ ...prev, speedtestImageUrl: "" }))}
                              data-testid="button-remove-speedtest"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => speedtestInputRef.current?.click()}
                            disabled={isUploadingFile}
                            data-testid="button-upload-speedtest"
                          >
                            {isUploadingFile ? (
                              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                            ) : (
                              <><Camera className="w-4 h-4" /> Upload Speedtest Screenshot</>
                            )}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Proof Images</Label>
                        <input
                          ref={proofInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleProofUpload}
                          className="hidden"
                          data-testid="input-proof-files"
                        />
                        {closeData.proofImageUrls.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {closeData.proofImageUrls.map((url, i) => (
                              <div key={i} className="relative rounded-md overflow-visible border border-border">
                                <img
                                  src={url}
                                  alt={`Proof ${i + 1}`}
                                  className="w-full h-20 object-cover rounded-md"
                                />
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="absolute top-0.5 right-0.5 h-5 w-5"
                                  onClick={() => removeProofImage(i)}
                                  data-testid={`button-remove-proof-${i}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => proofInputRef.current?.click()}
                          disabled={isUploadingMultiple}
                          data-testid="button-upload-proof"
                        >
                          {isUploadingMultiple ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                          ) : (
                            <><Upload className="w-4 h-4" /> Upload Proof Images</>
                          )}
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Closing Notes</Label>
                        <Textarea
                          placeholder="Any additional notes..."
                          value={closeData.closedNote}
                          onChange={e => setCloseData({...closeData, closedNote: e.target.value})}
                          data-testid="textarea-notes"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleClose} data-testid="button-submit-close">Submit</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{toCapName(ticket.customerName)}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`tel:${ticket.customerPhone}`} className="text-sm">{ticket.customerPhone}</a>
              </div>
              {ticket.customerEmail && (
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${ticket.customerEmail}`} className="text-sm truncate">{ticket.customerEmail}</a>
                </div>
              )}
              {ticket.customerLocationUrl && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col">
                    <a
                      href={ticket.customerLocationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open in Maps
                    </a>
                    {ticket.area && (
                      <span className="text-xs text-muted-foreground mt-0.5" data-testid="text-ticket-area">{ticket.area}</span>
                    )}
                  </div>
                </div>
              )}
              {!ticket.customerLocationUrl && ticket.area && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm" data-testid="text-ticket-area">{ticket.area}</span>
                </div>
              )}
              {(ticket.odpInfo || ticket.odpLocation) && (
                <div className="pt-2 mt-2 border-t space-y-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ODP Info</span>
                  {ticket.odpInfo && (
                    <div className="flex items-center gap-2.5">
                      <Network className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm" data-testid="text-odp-info">{ticket.odpInfo}</span>
                    </div>
                  )}
                  {ticket.odpLocation && (
                    <div className="flex items-center gap-2.5">
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                      <a
                        href={ticket.odpLocation}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary inline-flex items-center gap-1"
                        data-testid="link-odp-location"
                      >
                        <ExternalLink className="w-3 h-3" />
                        ODP Location
                      </a>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticket.assignees && ticket.assignees.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {ticket.assignees.map((assignee: any, idx: number) => (
                      <div key={assignee.id} className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                            {assignee.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{toCapName(assignee.name)}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {idx === 0 ? "Lead Technician" : "Partner"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {ticket.assignmentType && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {ticket.assignmentType === 'auto' ? (
                        <><Zap className="w-3 h-3 text-amber-500" /> Auto-assigned</>
                      ) : (
                        <><UserCheck className="w-3 h-3 text-blue-500" /> Manually assigned</>
                      )}
                    </div>
                  )}
                  {canManage && ticket.assignees.length < 2 && !['closed', 'rejected', 'pending_rejection'].includes(ticket.status) && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Only technicians without active tickets are shown:</p>
                      {freeTechnicians && freeTechnicians
                        .filter((tech: any) => !ticket.assignees.some((a: any) => a.id === tech.id))
                        .filter((tech: any) => user?.role === 'helpdesk' ? (tech.isBackboneSpecialist || tech.isVendorSpecialist) : true)
                        .length > 0 ? (
                        <Select onValueChange={(val) => assignTicket({ id: ticketId, userId: Number(val) })}>
                          <SelectTrigger data-testid="select-add-second-technician">
                            <SelectValue placeholder="Add second technician..." />
                          </SelectTrigger>
                          <SelectContent>
                            {freeTechnicians
                              .filter((tech: any) => !ticket.assignees.some((a: any) => a.id === tech.id))
                              .filter((tech: any) => user?.role === 'helpdesk' ? (tech.isBackboneSpecialist || tech.isVendorSpecialist) : true)
                              .map((tech: any) => (
                              <SelectItem key={tech.id} value={String(tech.id)}>{tech.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No free technicians available.</p>
                      )}
                    </div>
                  )}
                  {canManage && !['closed', 'rejected'].includes(ticket.status) && (
                    <Dialog open={reassignDialogOpen} onOpenChange={(open) => {
                      setReassignDialogOpen(open);
                      if (!open) { setReassignTech1(""); setReassignTech2(""); }
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-reassign">
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Reassign
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Reassign Ticket</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          <p className="text-sm text-muted-foreground">
                            Select new technician(s) to replace the current assignment. This will remove all existing assignees.
                          </p>
                          <div className="space-y-2">
                            <Label>Lead Technician *</Label>
                            <Select value={reassignTech1} onValueChange={setReassignTech1}>
                              <SelectTrigger data-testid="select-reassign-tech1">
                                <SelectValue placeholder="Select lead technician..." />
                              </SelectTrigger>
                              <SelectContent>
                                {technicians?.filter((t: any) => t.role === 'technician')
                                  .filter((t: any) => user?.role === 'helpdesk' ? (t.isBackboneSpecialist || t.isVendorSpecialist) : true)
                                  .map((tech: any) => (
                                  <SelectItem key={tech.id} value={String(tech.id)} disabled={String(tech.id) === reassignTech2}>
                                    {toCapName(tech.name)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Partner (optional)</Label>
                            <Select value={reassignTech2} onValueChange={setReassignTech2}>
                              <SelectTrigger data-testid="select-reassign-tech2">
                                <SelectValue placeholder="Select partner..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No partner</SelectItem>
                                {technicians?.filter((t: any) => t.role === 'technician')
                                  .filter((t: any) => user?.role === 'helpdesk' ? (t.isBackboneSpecialist || t.isVendorSpecialist) : true)
                                  .map((tech: any) => (
                                  <SelectItem key={tech.id} value={String(tech.id)} disabled={String(tech.id) === reassignTech1}>
                                    {toCapName(tech.name)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>Cancel</Button>
                          <Button
                            disabled={!reassignTech1 || isReassigning}
                            data-testid="button-confirm-reassign"
                            onClick={() => {
                              const ids = [Number(reassignTech1)];
                              if (reassignTech2 && reassignTech2 !== "none") ids.push(Number(reassignTech2));
                              reassignTicket({ id: ticketId, technicianIds: ids }, {
                                onSuccess: () => {
                                  setReassignDialogOpen(false);
                                  setReassignTech1("");
                                  setReassignTech2("");
                                }
                              });
                            }}
                          >
                            {isReassigning ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Reassigning...</> : "Confirm Reassign"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              ) : canManage && !['closed', 'rejected', 'pending_rejection'].includes(ticket.status) ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 p-2.5 rounded-md">
                    <AlertOctagon className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-medium">Unassigned</span>
                  </div>
                  <Select onValueChange={(val) => assignTicket({ id: ticketId, userId: Number(val) })}>
                    <SelectTrigger data-testid="select-assign-technician">
                      <SelectValue placeholder="Select Technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians
                        ?.filter((tech: any) => user?.role === 'helpdesk' ? (tech.isBackboneSpecialist || tech.isVendorSpecialist) : true)
                        .map((tech: any) => (
                        <SelectItem key={tech.id} value={String(tech.id)}>{tech.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 p-2.5 rounded-md">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">Unassigned</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between gap-1 text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(ticket.createdAt), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex justify-between gap-1 text-sm">
                <span className="text-muted-foreground">Time</span>
                <span>{format(new Date(ticket.createdAt), 'HH:mm')}</span>
              </div>
              <div className="flex justify-between gap-1 text-sm">
                <span className="text-muted-foreground">SLA Deadline</span>
                <span>{format(new Date(ticket.slaDeadline), 'MMM d, HH:mm')}</span>
              </div>
              {ticket.assignedAt && (
                <div className="flex justify-between gap-1 text-sm">
                  <span className="text-muted-foreground">Assigned At</span>
                  <span>{format(new Date(ticket.assignedAt), 'MMM d, HH:mm')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {imagePreview && (
        <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
          <DialogContent className="max-w-2xl p-2">
            <img src={imagePreview} alt="Preview" className="w-full rounded-md" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
