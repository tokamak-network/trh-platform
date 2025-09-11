"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { RPCUrlFormData } from "@/features/configuration/schemas";

interface SaveRpcUrlDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RPCUrlFormData) => Promise<void>;
  rpcUrl: string;
  rpcType: "ExecutionLayer" | "BeaconChain";
  network: "Mainnet" | "Testnet";
  defaultName?: string;
}

export function SaveRpcUrlDialog({
  isOpen,
  onClose,
  onSave,
  rpcUrl,
  rpcType,
  network,
  defaultName = "",
}: SaveRpcUrlDialogProps) {
  const [name, setName] = useState(defaultName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Reset state when dialog opens/closes
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setName(defaultName);
      setError("");
    } else {
      onClose();
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    try {
      setIsSaving(true);
      setError("");

      const urlData: RPCUrlFormData = {
        name: name.trim(),
        rpcUrl,
        type: rpcType,
        network,
      };

      await onSave(urlData);
      onClose();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save RPC URL";
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSaving) {
      handleSave();
    }
  };

  // Generate display URL (truncated for display)
  const displayUrl = rpcUrl.length > 50 ? `${rpcUrl.substring(0, 50)}...` : rpcUrl;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save RPC URL</DialogTitle>
          <DialogDescription>
            Give your RPC URL a memorable name to use it later.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* RPC URL Info */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">RPC URL</Label>
            <div className="p-3 bg-slate-50 rounded-md">
              <p className="text-sm text-slate-600 break-all" title={rpcUrl}>
                {displayUrl}
              </p>
              <div className="flex gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {network}
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {rpcType === "ExecutionLayer" ? "Execution" : "Beacon"}
                </span>
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="rpc-name" className="text-sm font-medium text-slate-700">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="rpc-name"
              placeholder="e.g. Alchemy Sepolia, QuickNode Mainnet"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              onKeyPress={handleKeyPress}
              className={error ? "border-red-500" : ""}
              disabled={isSaving}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onClose()}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save RPC URL
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
