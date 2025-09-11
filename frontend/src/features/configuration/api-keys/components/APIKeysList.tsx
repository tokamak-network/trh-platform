"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Key as KeyIcon } from "lucide-react";
import Image from "next/image";
import { APIKey, APIKeyFormData } from "../../schemas";
import { APIKeyCard } from "./APIKeyCard";
import { APIKeyForm } from "./APIKeyForm";

interface APIKeysListProps {
  apiKeys: APIKey[];
  onAdd: (data: APIKeyFormData) => void;
  onUpdate: (id: string, data: APIKeyFormData) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
  isAdding?: boolean;
  isUpdating?: boolean;
  isDeleting?: boolean;
  deletingId?: string | null;
  showSecrets: { [key: string]: boolean };
  onToggleSecret: (keyId: string) => void;
  onCopy: (text: string) => void;
  maskApiKey: (apiKey: string) => string;
  formatDate: (dateString: string) => string;
}

export function APIKeysList({
  apiKeys,
  onAdd,
  onUpdate,
  onDelete,
  isLoading = false,
  isAdding = false,
  isUpdating = false,
  isDeleting = false,
  deletingId,
  showSecrets,
  onToggleSecret,
  onCopy,
  maskApiKey,
  formatDate,
}: APIKeysListProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingApiKey, setEditingApiKey] = useState<APIKey | null>(null);

  const handleAdd = (data: APIKeyFormData) => {
    onAdd(data);
    setIsAddDialogOpen(false);
  };

  const handleEdit = (apiKey: APIKey) => {
    setEditingApiKey(apiKey);
  };

  const handleUpdate = (data: APIKeyFormData) => {
    if (editingApiKey) {
      onUpdate(editingApiKey.id, data);
      setEditingApiKey(null);
    }
  };

  const handleDelete = (id: string) => {
    onDelete(id);
  };

  const handleCloseEditDialog = () => {
    setEditingApiKey(null);
  };

  const handleCloseAddDialog = () => {
    setIsAddDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Keys Management</h2>
          <p className="text-muted-foreground">
            Manage API keys for external services and integrations
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} disabled={isLoading}>
          <Plus className="w-4 h-4 mr-2" />
          Add API Key
        </Button>
      </div>

      {/* API Keys List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center text-center">
            <div className="animate-spin mb-4">
              <KeyIcon className="h-12 w-12 text-primary/70" />
            </div>
            <div className="text-lg font-medium">Loading API keys...</div>
            <p className="text-muted-foreground mt-1">
              Please wait while we fetch your API keys
            </p>
          </div>
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center max-w-md">
            <div className="mx-auto w-24 h-24 mb-6 relative">
              <Image
                src="/file.svg"
                alt="API Keys"
                fill
                className="opacity-80"
              />
            </div>
            <h3 className="text-xl font-semibold mb-2">No API Keys</h3>
            <p className="text-muted-foreground mb-6">
              You haven&apos;t added any API keys yet. Add API keys to integrate
              with external services and enhance your platform functionality.
            </p>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              size="lg"
              className="px-6"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add your first API key
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {apiKeys.map((apiKey) => (
            <APIKeyCard
              key={apiKey.id}
              apiKey={apiKey}
              showSecrets={showSecrets}
              onToggleSecret={onToggleSecret}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCopy={onCopy}
              maskApiKey={maskApiKey}
              formatDate={formatDate}
              isDeleting={isDeleting && deletingId === apiKey.id}
            />
          ))}
        </div>
      )}

      {/* Add API Key Dialog */}
      <APIKeyForm
        isOpen={isAddDialogOpen}
        onClose={handleCloseAddDialog}
        onSubmit={handleAdd}
        isLoading={isAdding}
      />

      {/* Edit API Key Dialog */}
      <APIKeyForm
        isOpen={!!editingApiKey}
        onClose={handleCloseEditDialog}
        onSubmit={handleUpdate}
        isLoading={isUpdating}
        apiKey={editingApiKey}
      />
    </div>
  );
}
