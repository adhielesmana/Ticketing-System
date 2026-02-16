import { useState } from "react";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { UserRole, UserRoleValues } from "@shared/schema";
import { Redirect } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Pencil, Trash2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

const roleColors: Record<string, string> = {
  superadmin: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  admin: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  helpdesk: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  technician: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export default function UsersPage() {
  const { user } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { mutate: createUser, isPending: isCreating } = useCreateUser();
  const { mutate: updateUser, isPending: isUpdating } = useUpdateUser();
  const { mutate: deleteUser } = useDeleteUser();

  if (user?.role !== UserRole.SUPERADMIN && user?.role !== UserRole.ADMIN) {
    return <Redirect to="/" />;
  }

  const createForm = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      name: "",
      email: "",
      username: "",
      password: "",
      role: "technician",
      phone: "",
      isBackboneSpecialist: false,
      isActive: true,
    },
  });

  const editForm = useForm({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "technician",
      isBackboneSpecialist: false,
      isActive: true,
      password: "",
    },
  });

  function openEdit(u: any) {
    setEditUser(u);
    editForm.reset({
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      role: u.role,
      isBackboneSpecialist: u.isBackboneSpecialist,
      isActive: u.isActive,
      password: "",
    });
  }

  function onCreateSubmit(data: any) {
    createUser(data, {
      onSuccess: () => {
        setCreateOpen(false);
        createForm.reset();
      },
    });
  }

  function onEditSubmit(data: any) {
    const updates: any = { ...data };
    if (!updates.password) delete updates.password;
    updateUser(
      { id: editUser.id, ...updates },
      { onSuccess: () => setEditUser(null) }
    );
  }

  function handleDelete() {
    if (deleteId) {
      deleteUser(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  }

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display" data-testid="text-page-title">Staff Management</h1>
          <p className="text-sm text-muted-foreground">Manage technicians, helpdesk, and admin users</p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-user">
              <UserPlus className="w-4 h-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input {...field} data-testid="input-user-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={createForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl><Input {...field} data-testid="input-user-username" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input type="password" {...field} data-testid="input-user-password" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} data-testid="input-user-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} data-testid="input-user-phone" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="capitalize" data-testid="select-user-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {UserRoleValues.map((role) => (
                            <SelectItem key={role} value={role} className="capitalize">
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="isBackboneSpecialist"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel className="mb-0">Backbone Specialist</FormLabel>
                        <p className="text-xs text-muted-foreground">Backbone maintenance tickets only</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-backbone" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={isCreating} data-testid="button-submit-create-user">
                    {isCreating ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Specialist</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users className="w-8 h-8 opacity-30" />
                        <p className="text-sm font-medium">No users found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users?.map((u: any) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                              {u.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{u.username}</TableCell>
                      <TableCell>
                        <Badge className={`${roleColors[u.role] || ""} capitalize text-[10px]`}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.phone || "-"}</TableCell>
                      <TableCell>
                        {u.isBackboneSpecialist ? (
                          <Badge variant="outline" className="text-[10px]">Backbone</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={u.isActive
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[10px]"
                        }>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(u)}
                            data-testid={`button-edit-user-${u.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {user?.role === UserRole.SUPERADMIN && u.id !== user.id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setDeleteId(u.id)}
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full Name</label>
              <Input {...editForm.register("name")} data-testid="input-edit-name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" {...editForm.register("email")} data-testid="input-edit-email" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <Input {...editForm.register("phone")} data-testid="input-edit-phone" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select
                value={editForm.watch("role")}
                onValueChange={(val) => editForm.setValue("role", val)}
              >
                <SelectTrigger className="capitalize" data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UserRoleValues.map((role) => (
                    <SelectItem key={role} value={role} className="capitalize">
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New Password</label>
              <Input type="password" {...editForm.register("password")} placeholder="Leave blank to keep current" data-testid="input-edit-password" />
              <p className="text-xs text-muted-foreground">Leave blank to keep current password</p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <label className="text-sm font-medium">Backbone Specialist</label>
                <p className="text-xs text-muted-foreground">Backbone tickets only</p>
              </div>
              <Switch
                checked={editForm.watch("isBackboneSpecialist")}
                onCheckedChange={(val) => editForm.setValue("isBackboneSpecialist", val)}
                data-testid="switch-edit-backbone"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <label className="text-sm font-medium">Active</label>
                <p className="text-xs text-muted-foreground">Inactive users cannot log in</p>
              </div>
              <Switch
                checked={editForm.watch("isActive")}
                onCheckedChange={(val) => editForm.setValue("isActive", val)}
                data-testid="switch-edit-active"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="submit" disabled={isUpdating} data-testid="button-submit-edit-user">
                {isUpdating ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will remove the user and all their assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete-user">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
