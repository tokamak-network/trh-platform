"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AWSCredentialFormData,
  awsCredentialFormSchema,
  AWSCredential,
} from "../../schemas";

interface AWSCredentialFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AWSCredentialFormData) => void;
  isLoading?: boolean;
  credential?: AWSCredential | null;
  title?: string;
  description?: string;
}

export function AWSCredentialForm({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  credential = null,
  title,
  description,
}: AWSCredentialFormProps) {
  const isEditing = !!credential;

  const form = useForm<AWSCredentialFormData>({
    resolver: zodResolver(awsCredentialFormSchema),
    defaultValues: {
      name: credential?.name || "",
      accessKeyId: credential?.accessKeyId || "",
      secretAccessKey: credential?.secretAccessKey || "",
    },
  });

  React.useEffect(() => {
    if (credential) {
      form.reset({
        name: credential.name,
        accessKeyId: credential.accessKeyId,
        secretAccessKey: credential.secretAccessKey,
      });
    } else {
      form.reset({
        name: "",
        accessKeyId: "",
        secretAccessKey: "",
      });
    }
  }, [credential, form]);

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
    form.reset({
      name: "",
      accessKeyId: "",
      secretAccessKey: "",
    });
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {title ||
              (isEditing ? "Edit AWS Credentials" : "Add AWS Credentials")}
          </DialogTitle>
          <DialogDescription>
            {description ||
              (isEditing
                ? "Update AWS access key and secret key pair."
                : "Add new AWS access key and secret key pair for rollup deployments.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Production AWS Account"
              {...form.register("name")}
              disabled={isLoading}
              className={form.formState.errors.name ? "border-destructive" : ""}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessKeyId">Access Key ID</Label>
            <Input
              id="accessKeyId"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              {...form.register("accessKeyId")}
              disabled={isLoading}
              className={
                form.formState.errors.accessKeyId ? "border-destructive" : ""
              }
            />
            {form.formState.errors.accessKeyId && (
              <p className="text-sm text-destructive">
                {form.formState.errors.accessKeyId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">Secret Access Key</Label>
            <Input
              id="secretAccessKey"
              type="password"
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              {...form.register("secretAccessKey")}
              disabled={isLoading}
              className={
                form.formState.errors.secretAccessKey
                  ? "border-destructive"
                  : ""
              }
            />
            {form.formState.errors.secretAccessKey && (
              <p className="text-sm text-destructive">
                {form.formState.errors.secretAccessKey.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || form.formState.isSubmitting}
            >
              {isLoading || form.formState.isSubmitting
                ? isEditing
                  ? "Updating..."
                  : "Adding..."
                : isEditing
                ? "Update Credentials"
                : "Add Credentials"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
