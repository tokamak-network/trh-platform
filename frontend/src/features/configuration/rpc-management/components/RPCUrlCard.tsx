"use client";

import React, { useState } from "react";
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
import {
  Network,
  Edit,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Zap,
} from "lucide-react";
import { RPCUrl } from "../../schemas";
import { rpcUrlService } from "../services/rpcUrlService";
import toast from "react-hot-toast";

interface RPCUrlCardProps {
  rpcUrl: RPCUrl;
  onEdit: (rpcUrl: RPCUrl) => void;
  onDelete: (rpcUrlId: string) => void;
  isDeleting?: boolean;
}

export function RPCUrlCard({
  rpcUrl,
  onEdit,
  onDelete,
  isDeleting = false,
}: RPCUrlCardProps) {
  const [showFullUrl, setShowFullUrl] = useState(false);

  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await rpcUrlService.copyToClipboard(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const handleToggleUrl = () => {
    setShowFullUrl(!showFullUrl);
  };

  const handleEdit = () => {
    onEdit(rpcUrl);
  };

  const handleDelete = () => {
    onDelete(rpcUrl.id);
  };

  const maskedUrl = rpcUrlService.maskRpcUrl(rpcUrl.rpcUrl);
  const displayUrl = showFullUrl ? rpcUrl.rpcUrl : maskedUrl;

  const getTypeIcon = () => {
    return rpcUrl.type === "ExecutionLayer" ? (
      <Zap className="w-5 h-5 text-blue-600" />
    ) : (
      <Globe className="w-5 h-5 text-yellow-600" />
    );
  };

  const getTypeColor = () => {
    return rpcUrl.type === "ExecutionLayer" ? "bg-blue-100" : "bg-yellow-100";
  };

  const getNetworkBadgeVariant = () => {
    return rpcUrl.network === "Mainnet" ? "default" : "secondary";
  };

  return (
    <Card className="relative group border-0 shadow-xl bg-white/60 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 ${getTypeColor()} rounded-lg flex items-center justify-center`}
            >
              {getTypeIcon()}
            </div>
            <div>
              <CardTitle className="text-lg">{rpcUrl.name}</CardTitle>
              <CardDescription>
                Created: {new Date(rpcUrl.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getNetworkBadgeVariant()}>{rpcUrl.network}</Badge>
            <Badge
              variant="outline"
              className={
                rpcUrl.type === "ExecutionLayer"
                  ? "border-blue-300 text-blue-700"
                  : "border-yellow-300 text-yellow-700"
              }
            >
              {rpcUrl.type === "ExecutionLayer" ? "Execution" : "Beacon"}
            </Badge>
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
                  <AlertDialogTitle>Delete RPC URL</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &ldquo;{rpcUrl.name}
                    &rdquo;? This action cannot be undone.
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
            <Label className="text-sm font-medium">RPC URL</Label>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleToggleUrl}>
                {showFullUrl ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopyToClipboard(rpcUrl.rpcUrl, "RPC URL")}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="font-mono text-sm bg-muted p-2 rounded break-all">
            {displayUrl}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4" />
            <span>
              {rpcUrl.type === "ExecutionLayer"
                ? "Execution Layer"
                : "Beacon Chain"}{" "}
              Endpoint
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
