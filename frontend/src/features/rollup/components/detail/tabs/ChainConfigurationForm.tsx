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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, AlertCircle, Lock } from "lucide-react";
import { ThanosStack, ThanosStackStatus } from "../../../schemas/thanos";
import { ChainConfigurationUpdateRequest } from "../../../services/rollupService";
import { useUpdateChainConfigurationMutation } from "../../../api/mutations";

interface ChainConfigurationFormProps {
  stack: ThanosStack;
  onUpdate?: (updatedStack: ThanosStack) => void;
}

interface FormData {
  l1RpcUrl: string;
  l1BeaconUrl: string;
}

interface FormErrors {
  l1RpcUrl?: string;
  l1BeaconUrl?: string;
  general?: string;
}

const validateUrl = (url: string, fieldName: string): string | undefined => {
  if (!url.trim()) {
    return `${fieldName} is required`;
  }

  try {
    new URL(url);
    return undefined;
  } catch {
    return `${fieldName} must be a valid URL`;
  }
};

export function ChainConfigurationForm({
  stack,
  onUpdate,
}: ChainConfigurationFormProps) {
  const [formData, setFormData] = useState<FormData>({
    l1RpcUrl: stack.config.l1RpcUrl || "",
    l1BeaconUrl: stack.config.l1BeaconUrl || "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const updateMutation = useUpdateChainConfigurationMutation({
    onSuccess: () => {
      // Optionally call onUpdate if parent needs to refresh data
      onUpdate?.(stack);
    },
    onError: (error) => {
      setErrors({
        general:
          error.message ||
          "Failed to update chain configuration. Please try again.",
      });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const l1RpcError = validateUrl(formData.l1RpcUrl, "L1 RPC URL");
    if (l1RpcError) newErrors.l1RpcUrl = l1RpcError;

    const l1BeaconError = validateUrl(formData.l1BeaconUrl, "L1 Beacon URL");
    if (l1BeaconError) newErrors.l1BeaconUrl = l1BeaconError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear field-specific error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    // Clear general error when user makes changes
    if (errors.general) {
      setErrors((prev) => ({ ...prev, general: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setErrors({});

    const updateRequest: ChainConfigurationUpdateRequest = {
      l1RpcUrl: formData.l1RpcUrl.trim(),
      l1BeaconUrl: formData.l1BeaconUrl.trim(),
    };

    updateMutation.mutate({
      id: stack.id,
      config: updateRequest,
    });
  };

  const hasChanges =
    formData.l1RpcUrl !== stack.config.l1RpcUrl ||
    formData.l1BeaconUrl !== stack.config.l1BeaconUrl;

  const isDeployed = stack.status === ThanosStackStatus.DEPLOYED;
  const isFormDisabled = !isDeployed || updateMutation.isPending;

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Save className="w-5 h-5" />
          Chain Configuration
        </CardTitle>
        <CardDescription>
          Update the L1 RPC and Beacon URLs for your rollup stack
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Status Warning */}
          {!isDeployed && (
            <Alert className="border-amber-200 bg-amber-50">
              <Lock className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Chain configuration can only be updated when the stack status is
                &ldquo;Deployed&rdquo;. Current status:{" "}
                <span className="font-semibold">{stack.status}</span>
              </AlertDescription>
            </Alert>
          )}

          {/* General Error */}
          {errors.general && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.general}</AlertDescription>
            </Alert>
          )}

          {/* L1 RPC URL Field */}
          <div className="space-y-2">
            <Label htmlFor="l1RpcUrl">L1 RPC URL</Label>
            <Input
              id="l1RpcUrl"
              type="url"
              placeholder="https://your-l1-rpc-endpoint.com"
              value={formData.l1RpcUrl}
              onChange={(e) => handleInputChange("l1RpcUrl", e.target.value)}
              className={errors.l1RpcUrl ? "border-red-500" : ""}
              disabled={isFormDisabled}
            />
            {errors.l1RpcUrl && (
              <p className="text-sm text-red-500">{errors.l1RpcUrl}</p>
            )}
          </div>

          {/* L1 Beacon URL Field */}
          <div className="space-y-2">
            <Label htmlFor="l1BeaconUrl">L1 Beacon URL</Label>
            <Input
              id="l1BeaconUrl"
              type="url"
              placeholder="https://your-l1-beacon-endpoint.com"
              value={formData.l1BeaconUrl}
              onChange={(e) => handleInputChange("l1BeaconUrl", e.target.value)}
              className={errors.l1BeaconUrl ? "border-red-500" : ""}
              disabled={isFormDisabled}
            />
            {errors.l1BeaconUrl && (
              <p className="text-sm text-red-500">{errors.l1BeaconUrl}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isFormDisabled || !hasChanges}
              className="min-w-[120px]"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : !isDeployed ? (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Configuration Locked
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Update Configuration
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
