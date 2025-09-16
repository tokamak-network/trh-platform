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
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { APIKeyFormData } from "@/features/configuration/schemas";

interface SaveApiKeyDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (data: APIKeyFormData) => Promise<void>;
  readonly apiKey: string;
  readonly type: string;
  readonly defaultName?: string;
}

export function SaveApiKeyDialog({
  isOpen,
  onClose,
  onSave,
  apiKey,
  type,
  defaultName = "",
}: SaveApiKeyDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Reset state when dialog opens
  const handleDialogOpen = () => {
    setError("");
  };

  // Handle dialog close
  const handleDialogClose = () => {
    onClose();
  };

  // Reset state when dialog opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      return handleDialogOpen();
    }
    return handleDialogClose();
  };

  // Handle save
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError("");

      const keyData: APIKeyFormData = {
        apiKey,
        type,
      };

      await onSave(keyData);
      onClose();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save API key";
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Generate display API key (masked for security)
  const displayApiKey = apiKey.length > 20 
    ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}` 
    : apiKey;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save API Key</DialogTitle>
          <DialogDescription>
            Save this {type} API key to use it later without re-entering.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* API Key Info */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">API Key</Label>
            <div className="p-3 bg-slate-50 rounded-md">
              <p className="text-sm text-slate-600 font-mono break-all" title={apiKey}>
                {displayApiKey}
              </p>
              <div className="flex gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {type}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
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
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save API Key
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
