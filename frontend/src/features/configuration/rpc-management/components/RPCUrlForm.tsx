"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RPCUrlFormData, rpcUrlFormSchema, RPCUrl } from "../../schemas";

interface RPCUrlFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RPCUrlFormData) => void;
  isLoading?: boolean;
  rpcUrl?: RPCUrl | null;
  title?: string;
  description?: string;
}

export function RPCUrlForm({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  rpcUrl = null,
  title,
  description,
}: RPCUrlFormProps) {
  const isEditing = !!rpcUrl;

  const form = useForm<RPCUrlFormData>({
    resolver: zodResolver(rpcUrlFormSchema),
    defaultValues: {
      name: rpcUrl?.name || "",
      rpcUrl: rpcUrl?.rpcUrl || "",
      type: rpcUrl?.type || "ExecutionLayer",
      network: rpcUrl?.network || "Testnet",
    },
  });

  React.useEffect(() => {
    if (rpcUrl) {
      form.reset({
        name: rpcUrl.name,
        rpcUrl: rpcUrl.rpcUrl,
        type: rpcUrl.type,
        network: rpcUrl.network,
      });
    } else {
      form.reset({
        name: "",
        rpcUrl: "",
        type: "ExecutionLayer",
        network: "Testnet",
      });
    }
  }, [rpcUrl, form]);

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
    form.reset({
      name: "",
      rpcUrl: "",
      type: "ExecutionLayer",
      network: "Testnet",
    });
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {title || (isEditing ? "Edit RPC Endpoint" : "Add RPC Endpoint")}
          </DialogTitle>
          <DialogDescription>
            {description ||
              (isEditing
                ? "Update the RPC endpoint configuration."
                : "Add a new RPC endpoint for blockchain connectivity.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Ethereum Mainnet"
              {...form.register("name")}
              disabled={isLoading}
              className={form.formState.errors.name ? "border-destructive" : ""}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rpcUrl">RPC URL</Label>
            <Input
              id="rpcUrl"
              placeholder="https://mainnet.infura.io/v3/YOUR-PROJECT-ID"
              {...form.register("rpcUrl")}
              disabled={isLoading}
              className={
                form.formState.errors.rpcUrl ? "border-destructive" : ""
              }
            />
            {form.formState.errors.rpcUrl && (
              <p className="text-sm text-destructive">
                {form.formState.errors.rpcUrl.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(value: "ExecutionLayer" | "BeaconChain") =>
                  form.setValue("type", value)
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ExecutionLayer">
                    Execution Layer
                  </SelectItem>
                  <SelectItem value="BeaconChain">Beacon Chain</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.type && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.type.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="network">Network</Label>
              <Select
                value={form.watch("network")}
                onValueChange={(value: "Mainnet" | "Testnet") =>
                  form.setValue("network", value)
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mainnet">Mainnet</SelectItem>
                  <SelectItem value="Testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.network && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.network.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || form.formState.isSubmitting}
            >
              {isLoading || form.formState.isSubmitting
                ? isEditing
                  ? "Updating..."
                  : "Adding..."
                : isEditing
                ? "Update"
                : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
