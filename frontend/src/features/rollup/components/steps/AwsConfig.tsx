"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, ExternalLink, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFormContext } from "react-hook-form";
import type { CreateRollupFormData } from "../../schemas/create-rollup";
import { useAwsCredentials } from "@/features/configuration/aws-credentials/hooks/useAwsCredentials";
import { useAwsRegions } from "@/features/configuration/aws-credentials/hooks/useAwsRegions";

interface AwsConfigProps {
  onNext: () => void;
  onBack: () => void;
}

export function AwsConfig({ onNext, onBack }: AwsConfigProps) {
  const {
    setValue,
    watch,
    register,
    formState: { errors },
  } = useFormContext<CreateRollupFormData>();

  // Register fields with validation
  React.useEffect(() => {
    register("accountAndAws.credentialId", {
      required: "AWS Access Key is required",
    });
    register("accountAndAws.awsRegion", { required: "AWS Region is required" });
  }, [register]);

  const { awsCredentials, isLoading, refreshCredentials } = useAwsCredentials();
  const {
    regions,
    isLoading: isLoadingRegions,
    error: regionsError,
    fetchRegions,
    clearRegions,
  } = useAwsRegions();
  const selectedCredentialId = watch("accountAndAws.credentialId") as string;

  // Track the last fetched credential to prevent refetching
  const [lastFetchedCredentialId, setLastFetchedCredentialId] =
    React.useState<string>("");

  // Fetch regions when credentials are selected
  React.useEffect(() => {
    if (
      selectedCredentialId &&
      awsCredentials &&
      selectedCredentialId !== lastFetchedCredentialId
    ) {
      const selectedCredential = awsCredentials.find(
        (cred) => cred.id === selectedCredentialId
      );

      if (selectedCredential) {
        // Clear current region selection and fetch new regions
        setValue("accountAndAws.awsRegion", "");
        fetchRegions(
          selectedCredential.accessKeyId,
          selectedCredential.secretAccessKey
        );
        setLastFetchedCredentialId(selectedCredentialId);
      }
    } else if (!selectedCredentialId && lastFetchedCredentialId) {
      // Clear regions when no credential is selected
      clearRegions();
      setValue("accountAndAws.awsRegion", "");
      setLastFetchedCredentialId("");
    }
  }, [
    selectedCredentialId,
    awsCredentials,
    lastFetchedCredentialId,
    fetchRegions,
    clearRegions,
    setValue,
  ]);

  // Set default region when regions are loaded
  const currentRegion = watch("accountAndAws.awsRegion");
  React.useEffect(() => {
    if (regions.length > 0 && !currentRegion && !isLoadingRegions) {
      // Set first available region as default, or prefer us-east-1 if available
      const defaultRegion =
        regions.find((r) => r.value === "us-east-1") || regions[0];
      setValue("accountAndAws.awsRegion", defaultRegion.value);
    }
  }, [regions, currentRegion, isLoadingRegions, setValue]);

  const handleNext = () => {
    if (selectedCredentialId && watch("accountAndAws.awsRegion")) {
      onNext();
    }
  };

  // Call handleNext when both fields are filled
  React.useEffect(() => {
    if (selectedCredentialId && watch("accountAndAws.awsRegion")) {
      handleNext();
    }
  }, [selectedCredentialId, watch("accountAndAws.awsRegion")]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">AWS Configuration</h2>
        <p className="text-muted-foreground">
          Select AWS credentials for your rollup deployment
        </p>
      </div>

      <Card className="border-0 shadow-lg w-3/4">
        <CardHeader>
          <CardTitle>AWS Access Key</CardTitle>
          <CardDescription>
            Choose the AWS credentials to use for deploying your rollup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {awsCredentials && awsCredentials.length > 0 ? (
            <div className="flex justify-between gap-4">
              <div className="space-y-2 w-3/4">
                <label className="text-sm font-medium">
                  Select AWS Access Key{" "}
                  <span className="text-destructive">*</span>
                </label>
                <Select
                  value={selectedCredentialId}
                  onValueChange={(value) => {
                    setValue("accountAndAws.credentialId", value);
                    const selectedCredential = awsCredentials.find(
                      (cred) => cred.id === value
                    );
                    if (selectedCredential) {
                      setValue(
                        "accountAndAws.accountName",
                        selectedCredential.name
                      );
                      setValue(
                        "accountAndAws.awsAccessKey",
                        selectedCredential.accessKeyId
                      );
                      setValue(
                        "accountAndAws.awsSecretKey",
                        selectedCredential.secretAccessKey
                      );
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        isLoading ? "Loading..." : "Choose an AWS access key"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {awsCredentials.map((credential) => (
                      <SelectItem key={credential.id} value={credential.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{credential.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {credential.accessKeyId}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.accountAndAws?.credentialId && (
                  <p className="text-sm text-destructive">
                    {errors.accountAndAws.credentialId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2 w-3/4">
                <label className="text-sm font-medium">
                  AWS Region <span className="text-destructive">*</span>
                </label>
                <Select
                  value={watch("accountAndAws.awsRegion")}
                  onValueChange={(value) =>
                    setValue("accountAndAws.awsRegion", value)
                  }
                  disabled={!selectedCredentialId || isLoadingRegions}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        !selectedCredentialId
                          ? "Select AWS credentials first"
                          : isLoadingRegions
                          ? "Loading regions..."
                          : "Select a region"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {regionsError && (
                  <p className="text-sm text-destructive">{regionsError}</p>
                )}
                {errors.accountAndAws?.awsRegion && (
                  <p className="text-sm text-destructive">
                    {errors.accountAndAws.awsRegion.message}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                No AWS access keys found
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 hover:bg-transparent cursor-pointer"
                  onClick={() => refreshCredentials()}
                >
                  <RotateCw className="h-3 w-3" />
                </Button>
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>
                  No AWS access keys found. Please add AWS credentials in the
                  Configuration section.
                </span>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="/configuration"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Go to Configuration{" "}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
