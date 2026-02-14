import { useTicket, useCloseTicket, useStartTicket, useAssignTicket, useUpdateTicket } from "@/hooks/use-tickets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useParams, Link } from "wouter";
import { SLAIndicator } from "@/components/SLAIndicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Clock,
  CheckCircle,
  AlertOctagon,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: technicians } = useUsers("technician");
  
  const { mutate: assignTicket } = useAssignTicket();
  const { mutate: startTicket } = useStartTicket();
  const { mutate: closeTicket } = useCloseTicket();

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeData, setCloseData] = useState({
    actionDescription: "",
    speedtestResult: "",
    proofImageUrl: "",
    closedNote: ""
  });

  if (isLoading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!ticket) return <div className="p-8">Ticket not found</div>;

  const handleClose = () => {
    closeTicket({
      id: ticketId,
      ...closeData
    }, {
      onSuccess: () => setCloseDialogOpen(false)
    });
  };

  const isAssignedToMe = ticket.assignee?.id === user?.id;
  const canManage = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'helpdesk';

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl space-y-6">
      <Link href="/">
        <Button variant="ghost" className="gap-2 pl-0 hover:pl-0 hover:bg-transparent">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold font-display">Ticket #{ticket.ticketNumber}</h1>
            <Badge variant="outline" className="uppercase">{ticket.priority}</Badge>
            <Badge className="uppercase">{ticket.status.replace('_', ' ')}</Badge>
          </div>
          <h2 className="text-xl text-muted-foreground">{ticket.title}</h2>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {ticket.status !== 'closed' && (
            <SLAIndicator 
              deadline={ticket.slaDeadline as unknown as string} 
              createdAt={ticket.createdAt as unknown as string}
              status={ticket.status}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(ticket.createdAt), 'PPp')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </CardContent>
          </Card>

          {ticket.status === 'closed' && (
            <Card className="border-l-4 border-l-green-500 bg-green-50/50">
              <CardHeader>
                <CardTitle className="text-green-800">Resolution Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">Action Taken</h4>
                  <p>{ticket.actionDescription || 'No details provided'}</p>
                </div>
                {ticket.speedtestResult && (
                  <div>
                    <h4 className="font-semibold text-sm">Speedtest Result</h4>
                    <p className="font-mono">{ticket.speedtestResult}</p>
                  </div>
                )}
                {ticket.proofImageUrl && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Proof of Work</h4>
                    <a 
                      href={ticket.proofImageUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      View Image
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            {canManage && ticket.status === 'open' && (
              <div className="flex items-center gap-2 bg-muted p-2 rounded-lg">
                <span className="text-sm font-medium px-2">Assign to:</span>
                <Select onValueChange={(val) => assignTicket({ id: ticketId, userId: Number(val) })}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians?.map(tech => (
                      <SelectItem key={tech.id} value={String(tech.id)}>{tech.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAssignedToMe && ticket.status === 'assigned' && (
              <Button onClick={() => startTicket(ticketId)} className="flex-1 md:flex-none">
                Start Work
              </Button>
            )}

            {isAssignedToMe && ticket.status === 'in_progress' && (
              <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="flex-1 md:flex-none bg-green-600 hover:bg-green-700">
                    Complete & Close
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Close Ticket</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Action Taken</Label>
                      <Textarea 
                        placeholder="What did you do to fix it?"
                        value={closeData.actionDescription}
                        onChange={e => setCloseData({...closeData, actionDescription: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Speedtest URL/Result</Label>
                      <Input 
                        placeholder="https://speedtest.net/..."
                        value={closeData.speedtestResult}
                        onChange={e => setCloseData({...closeData, speedtestResult: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Proof Image URL</Label>
                      <Input 
                        placeholder="https://..."
                        value={closeData.proofImageUrl}
                        onChange={e => setCloseData({...closeData, proofImageUrl: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Closing Notes</Label>
                      <Textarea 
                        placeholder="Any final notes..."
                        value={closeData.closedNote}
                        onChange={e => setCloseData({...closeData, closedNote: e.target.value})}
                      />
                    </div>
                    <Button onClick={handleClose} className="w-full">Submit Closure</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{ticket.customerName}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <a href={`tel:${ticket.customerPhone}`} className="hover:text-primary">{ticket.customerPhone}</a>
              </div>
              {ticket.customerEmail && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <a href={`mailto:${ticket.customerEmail}`} className="hover:text-primary truncate">{ticket.customerEmail}</a>
                </div>
              )}
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <a 
                  href={ticket.customerLocationUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-primary underline font-medium"
                >
                  Open in Maps
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.assignee ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                    {ticket.assignee.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{ticket.assignee.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{ticket.assignee.role}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 p-3 rounded-md">
                  <AlertOctagon className="w-4 h-4" />
                  <span className="text-sm font-medium">Unassigned</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
