"use client";

import React from "react";
import {
  useApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  useApiKeyActions,
} from "../hooks/useApiKeys";
import { APIKeysList } from "./APIKeysList";
import { APIKeyFormData } from "../../schemas";

export function APIKeysManagement() {
  const { apiKeys, isLoading, error } = useApiKeys();
  const createApiKey = useCreateApiKey();
  const updateApiKey = useUpdateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const {
    showSecrets,
    toggleSecretVisibility,
    copyToClipboard,
    maskApiKey,
    formatDate,
  } = useApiKeyActions();

  const handleAdd = (data: APIKeyFormData) => {
    createApiKey.mutate(data);
  };

  const handleUpdate = (id: string, data: APIKeyFormData) => {
    updateApiKey.mutate({ id, data });
  };

  const handleDelete = (id: string) => {
    deleteApiKey.mutate(id);
  };

  // Handle error state
  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="text-destructive mb-2">Error loading API keys</div>
          <div className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <APIKeysList
      apiKeys={apiKeys}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      isLoading={isLoading}
      isAdding={createApiKey.isPending}
      isUpdating={updateApiKey.isPending}
      isDeleting={deleteApiKey.isPending}
      deletingId={deleteApiKey.variables as string}
      showSecrets={showSecrets}
      onToggleSecret={toggleSecretVisibility}
      onCopy={copyToClipboard}
      maskApiKey={maskApiKey}
      formatDate={formatDate}
    />
  );
}
