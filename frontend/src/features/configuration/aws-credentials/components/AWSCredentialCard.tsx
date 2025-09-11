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
import { AWSCredential, SecretVisibilityState } from "../../schemas";
import { awsCredentialsService } from "../services/awsCredentialsService";
import toast from "react-hot-toast";

interface AWSCredentialCardProps {
  credential: AWSCredential;
  showSecrets: SecretVisibilityState;
  onToggleSecret: (credentialId: string) => void;
  onEdit: (credential: AWSCredential) => void;
  onDelete: (credentialId: string) => void;
  isDeleting?: boolean;
}

export function AWSCredentialCard({
  credential,
  showSecrets,
  onToggleSecret,
  onEdit,
  onDelete,
  isDeleting = false,
}: AWSCredentialCardProps) {
  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await awsCredentialsService.copyToClipboard(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const handleToggleSecret = () => {
    onToggleSecret(credential.id);
  };

  const handleEdit = () => {
    onEdit(credential);
  };

  const handleDelete = () => {
    onDelete(credential.id);
  };

  const maskedSecretKey = awsCredentialsService.maskSecretKey(
    credential.secretAccessKey
  );
  const displaySecretKey = showSecrets[credential.id]
    ? credential.secretAccessKey
    : maskedSecretKey;

  return (
    <Card className="relative group border-0 shadow-xl bg-white/60 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{credential.name}</CardTitle>
              <CardDescription>
                Created: {new Date(credential.createdAt).toLocaleDateString()}
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
                  <AlertDialogTitle>Delete AWS Credentials</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &ldquo;{credential.name}
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
            <Label className="text-sm font-medium">Access Key ID</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                handleCopyToClipboard(credential.accessKeyId, "Access Key ID")
              }
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="font-mono text-sm bg-muted p-2 rounded">
            {credential.accessKeyId}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Secret Access Key</Label>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleToggleSecret}>
                {showSecrets[credential.id] ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleCopyToClipboard(
                    credential.secretAccessKey,
                    "Secret Access Key"
                  )
                }
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="font-mono text-sm bg-muted p-2 rounded">
            {displaySecretKey}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
