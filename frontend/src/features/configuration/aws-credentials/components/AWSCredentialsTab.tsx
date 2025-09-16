"use client";

import React from "react";
import { AWSCredentialsList } from "./AWSCredentialsList";
import { useAwsCredentials } from "../hooks/useAwsCredentials";

export function AWSCredentialsTab() {
  const {
    awsCredentials,
    isLoading,
    error,
    isAdding,
    isUpdating,
    isDeleting,
    deletingId,
    addCredential,
    updateCredential,
    deleteCredential,
  } = useAwsCredentials();

  // Handle error state
  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="text-destructive mb-2">
            Error loading AWS credentials
          </div>
          <div className="text-muted-foreground text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <AWSCredentialsList
      credentials={awsCredentials}
      onAdd={addCredential}
      onUpdate={updateCredential}
      onDelete={deleteCredential}
      isLoading={isLoading}
      isAdding={isAdding}
      isUpdating={isUpdating}
      isDeleting={isDeleting}
      deletingId={deletingId}
    />
  );
}
