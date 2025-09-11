"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Globe } from "lucide-react";
import { RPCUrl, RPCUrlFormData } from "../../schemas";
import { RPCUrlCard } from "./RPCUrlCard";
import { RPCUrlForm } from "./RPCUrlForm";

interface RPCUrlsListProps {
  rpcUrls: RPCUrl[];
  onAdd: (data: RPCUrlFormData) => Promise<void>;
  onUpdate: (id: string, data: RPCUrlFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading?: boolean;
  isAdding?: boolean;
  isUpdating?: boolean;
  isDeleting?: boolean;
  deletingId?: string | null;
}

export function RPCUrlsList({
  rpcUrls,
  onAdd,
  onUpdate,
  onDelete,
  isLoading = false,
  isAdding = false,
  isUpdating = false,
  isDeleting = false,
  deletingId = null,
}: RPCUrlsListProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingRpcUrl, setEditingRpcUrl] = useState<RPCUrl | null>(null);

  // Filter RPC URLs by network
  const mainnetRpcUrls = rpcUrls.filter(
    (rpcUrl) => rpcUrl.network === "Mainnet"
  );
  const testnetRpcUrls = rpcUrls.filter(
    (rpcUrl) => rpcUrl.network === "Testnet"
  );

  const handleAdd = async (data: RPCUrlFormData) => {
    try {
      await onAdd(data);
      setIsAddDialogOpen(false);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleUpdate = async (data: RPCUrlFormData) => {
    if (!editingRpcUrl) return;

    try {
      await onUpdate(editingRpcUrl.id, data);
      setEditingRpcUrl(null);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleEdit = (rpcUrl: RPCUrl) => {
    setEditingRpcUrl(rpcUrl);
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
    } catch {
      // Error is handled by the hook
    }
  };

  const renderRpcEndpoints = (endpoints: RPCUrl[]) => {
    if (endpoints.length === 0) {
      return (
        <div className="flex items-center justify-center py-8 text-center">
          <div className="space-y-2">
            <Globe className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No RPC endpoints configured</p>
            <p className="text-sm text-muted-foreground">
              Add your first RPC endpoint to get started
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        {endpoints.map((rpcUrl) => (
          <RPCUrlCard
            key={rpcUrl.id}
            rpcUrl={rpcUrl}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={isDeleting && deletingId === rpcUrl.id}
          />
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading RPC endpoints...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">RPC Management</h2>
          <p className="text-muted-foreground">
            Manage execution and beacon chain RPC endpoints
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isAdding}>
              <Plus className="w-4 h-4 mr-2" />
              Add RPC Endpoint
            </Button>
          </DialogTrigger>
        </Dialog>
      </div>

      {/* Network Tabs */}
      <Tabs defaultValue="testnet" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-white/60 backdrop-blur-sm border-0 shadow-lg">
          <TabsTrigger
            value="mainnet"
            className="flex items-center gap-2 cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            <Globe className="w-4 h-4" />
            Mainnet
            <Badge
              variant="outline"
              className="ml-1 data-[state=active]:border-white data-[state=active]:text-white"
            >
              {mainnetRpcUrls.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="testnet"
            className="flex items-center gap-2 cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            <Globe className="w-4 h-4" />
            Testnet
            <Badge
              variant="outline"
              className="ml-1 data-[state=active]:border-white data-[state=active]:text-white"
            >
              {testnetRpcUrls.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mainnet" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Mainnet Endpoints</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Execution</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span>Beacon</span>
              </div>
            </div>
          </div>
          {renderRpcEndpoints(mainnetRpcUrls)}
        </TabsContent>

        <TabsContent value="testnet" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Testnet Endpoints</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Execution</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span>Beacon</span>
              </div>
            </div>
          </div>
          {renderRpcEndpoints(testnetRpcUrls)}
        </TabsContent>
      </Tabs>

      {/* Add RPC URL Form */}
      <RPCUrlForm
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSubmit={handleAdd}
        isLoading={isAdding}
        title="Add RPC Endpoint"
        description="Add a new RPC endpoint for blockchain connectivity."
      />

      {/* Edit RPC URL Form */}
      <RPCUrlForm
        isOpen={!!editingRpcUrl}
        onClose={() => setEditingRpcUrl(null)}
        onSubmit={handleUpdate}
        isLoading={isUpdating}
        rpcUrl={editingRpcUrl}
        title="Edit RPC Endpoint"
        description="Update the RPC endpoint configuration."
      />
    </div>
  );
}
