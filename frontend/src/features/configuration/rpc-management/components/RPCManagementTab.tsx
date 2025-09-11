"use client";

import React from "react";
import { RPCUrlsList } from "./RPCUrlsList";
import { useRpcUrls } from "../hooks/useRpcUrls";

export function RPCManagementTab() {
  const {
    rpcUrls,
    isLoading,
    error,
    isAdding,
    isUpdating,
    isDeleting,
    deletingId,
    addRpcUrl,
    updateRpcUrl,
    deleteRpcUrl,
  } = useRpcUrls();

  // Handle error state
  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="text-destructive mb-2">Error loading RPC URLs</div>
          <div className="text-muted-foreground text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <RPCUrlsList
      rpcUrls={rpcUrls}
      onAdd={addRpcUrl}
      onUpdate={updateRpcUrl}
      onDelete={deleteRpcUrl}
      isLoading={isLoading}
      isAdding={isAdding}
      isUpdating={isUpdating}
      isDeleting={isDeleting}
      deletingId={deletingId}
    />
  );
}
