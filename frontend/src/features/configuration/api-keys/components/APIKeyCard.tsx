"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Key, Edit, Trash2, Copy, Eye, EyeOff } from "lucide-react";
import { APIKey } from "../../schemas";

interface APIKeyCardProps {
  apiKey: APIKey;
  showSecrets: { [key: string]: boolean };
  onToggleSecret: (keyId: string) => void;
  onEdit: (apiKey: APIKey) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string) => void;
  maskApiKey: (apiKey: string) => string;
  formatDate: (dateString: string) => string;
  isDeleting?: boolean;
}

const getServiceTypeLabel = (type: string) => {
  const typeMap: { [key: string]: string } = {
    CMC: "CoinMarketCap",
    MORALIS: "Moralis",
    ALCHEMY: "Alchemy",
    INFURA: "Infura",
    ETHERSCAN: "Etherscan",
    CUSTOM: "Custom",
  };
  return typeMap[type] || type;
};

const getServiceTypeColor = (type: string) => {
  // Use consistent orange styling like AWS credentials
  return "bg-orange-100 text-orange-600";
};

export function APIKeyCard({
  apiKey,
  showSecrets,
  onToggleSecret,
  onEdit,
  onDelete,
  onCopy,
  maskApiKey,
  formatDate,
  isDeleting = false,
}: APIKeyCardProps) {
  const handleEdit = () => {
    onEdit(apiKey);
  };

  const handleDelete = () => {
    onDelete(apiKey.id);
  };

  const handleCopyApiKey = () => {
    onCopy(apiKey.apiKey);
  };

  const handleToggleSecret = () => {
    onToggleSecret(apiKey.id);
  };

  return (
    <Card className="relative group border-0 shadow-xl bg-white/60 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${getServiceTypeColor(
                apiKey.type
              )}`}
            >
              <Key className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {getServiceTypeLabel(apiKey.type)}
              </CardTitle>
              <CardDescription>
                Created: {formatDate(apiKey.createdAt)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default">Active</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              disabled={isDeleting}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={isDeleting}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this{" "}
                    {getServiceTypeLabel(apiKey.type)} API key? This action
                    cannot be undone and may affect services that depend on this
                    key.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">API Key</Label>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleToggleSecret}>
                {showSecrets[apiKey.id] ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopyApiKey}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="font-mono text-sm bg-muted p-2 rounded">
            {showSecrets[apiKey.id] ? apiKey.apiKey : maskApiKey(apiKey.apiKey)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
