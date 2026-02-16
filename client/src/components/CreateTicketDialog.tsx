import { useState, useRef } from "react";
import { useCreateTicket, useUploadImages } from "@/hooks/use-tickets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTicketSchema, TicketTypeValues, TicketPriorityValues } from "@shared/schema";
import { z } from "zod";
import { Plus, ImagePlus, X, Loader2 } from "lucide-react";
import { addHours } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  type: z.string().min(1, "Type is required"),
  priority: z.string().min(1, "Priority is required"),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().min(1, "Phone is required"),
  customerEmail: z.string().optional(),
  customerLocationUrl: z.string().optional(),
  odpInfo: z.string().optional(),
  odpLocation: z.string().optional(),
  ticketIdCustom: z.string().optional(),
  title: z.string().min(1, "Subject is required"),
  description: z.string().min(1, "Description is required"),
  descriptionImages: z.array(z.string()).optional(),
});

export function CreateTicketDialog() {
  const [open, setOpen] = useState(false);
  const { mutate: createTicket, isPending } = useCreateTicket();
  const { mutateAsync: uploadImages, isPending: isUploading } = useUploadImages();
  const [previewFiles, setPreviewFiles] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "home_maintenance",
      priority: "medium",
      title: "",
      description: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerLocationUrl: "",
      odpInfo: "",
      odpLocation: "",
      ticketIdCustom: "",
      descriptionImages: [],
    },
  });

  function calculateSLA(type: string): Date {
    const now = new Date();
    if (type === "installation") return addHours(now, 72);
    return addHours(now, 24);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const totalFiles = previewFiles.length + files.length;
    if (totalFiles > 5) {
      toast({ title: "Limit Reached", description: "Maximum 5 images allowed", variant: "destructive" });
      return;
    }

    const newPreviews = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPreviewFiles(prev => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setPreviewFiles(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const slaDeadline = calculateSLA(values.type);
    
    let imageUrls: string[] = [];
    if (previewFiles.length > 0) {
      try {
        const result = await uploadImages(previewFiles.map(p => p.file));
        imageUrls = result.urls;
      } catch {
        toast({ title: "Upload Failed", description: "Could not upload images", variant: "destructive" });
        return;
      }
    }

    createTicket({
      ...values,
      slaDeadline,
      odpInfo: values.odpInfo || undefined,
      odpLocation: values.odpLocation || undefined,
      ticketIdCustom: values.ticketIdCustom || undefined,
      descriptionImages: imageUrls.length > 0 ? imageUrls : undefined,
    } as any, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        previewFiles.forEach(p => URL.revokeObjectURL(p.preview));
        setPreviewFiles([]);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) {
        previewFiles.forEach(p => URL.revokeObjectURL(p.preview));
        setPreviewFiles([]);
      }
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-create-ticket">
          <Plus className="w-4 h-4" />
          New Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Support Ticket</DialogTitle>
          <DialogDescription>
            Enter customer details and issue description. SLA will be calculated automatically.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticket Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="capitalize" data-testid="select-ticket-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TicketTypeValues.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="capitalize" data-testid="select-ticket-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TicketPriorityValues.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 border rounded-md p-4 bg-muted/30">
              <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Customer Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-customer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 234 567 8900" {...field} data-testid="input-customer-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="john@example.com" {...field} value={field.value || ''} data-testid="input-customer-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerLocationUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location URL (Google Maps)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://maps.google.com/..." {...field} data-testid="input-customer-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4 border rounded-md p-4 bg-muted/30">
              <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Ticket & ODP Info</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="ticketIdCustom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticket ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Auto-generated if empty" {...field} data-testid="input-ticket-id-custom" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="odpInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ODP Info</FormLabel>
                      <FormControl>
                        <Input placeholder="ODP-XXX-YYY" {...field} data-testid="input-odp-info" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="odpLocation"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>ODP Location (Google Maps URL)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://maps.google.com/..." {...field} data-testid="input-odp-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief issue summary" {...field} data-testid="input-ticket-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Detailed description of the issue..." 
                      className="min-h-[100px]"
                      {...field} 
                      data-testid="textarea-ticket-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Attachments</FormLabel>
              <div className="border rounded-md p-3 bg-muted/20">
                {previewFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {previewFiles.map((pf, i) => (
                      <div key={i} className="relative group rounded-md overflow-visible">
                        <img
                          src={pf.preview}
                          alt={`Preview ${i + 1}`}
                          className="w-full h-20 object-cover rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                          data-testid={`button-remove-image-${i}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={previewFiles.length >= 5}
                  className="gap-2 w-full"
                  data-testid="button-add-images"
                >
                  <ImagePlus className="w-4 h-4" />
                  {previewFiles.length > 0
                    ? `Add More (${previewFiles.length}/5)`
                    : "Add Images"}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || isUploading} data-testid="button-submit-create-ticket">
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...</>
                ) : isPending ? "Creating..." : "Create Ticket"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
