"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  GitBranch,
  Globe,
  Zap,
  Shield,
  ExternalLink,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { RollupDetailTabProps } from "../../../schemas/detail-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRegisterMetadataDAOQuery } from "../../../api/queries";
import { useCreateRegisterMetadataDAOMutation as useCreateMetadataMutation } from "../../../api/mutations";
import { CreateRegisterMetadataDAORequest } from "../../../schemas/register-metadata-dao";

interface MetadataFormData {
  token: string;
  username: string;
  email: string;
  metadata: {
    chain: {
      description: string;
      logo: string;
      website: string;
    };
    bridge: {
      name: string;
    };
    explorer: {
      name: string;
    };
    supportResources: {
      statusPageUrl: string;
      supportContactUrl: string;
      documentationUrl: string;
      communityUrl: string;
      helpCenterUrl: string;
      announcementUrl: string;
    };
  };
}

const initialFormData: MetadataFormData = {
  token: "",
  username: "",
  email: "",
  metadata: {
    chain: {
      description: "",
      logo: "",
      website: "",
    },
    bridge: {
      name: "",
    },
    explorer: {
      name: "",
    },
    supportResources: {
      statusPageUrl: "",
      supportContactUrl: "",
      documentationUrl: "",
      communityUrl: "",
      helpCenterUrl: "",
      announcementUrl: "",
    },
  },
};

export function MetadataTab({ stack }: RollupDetailTabProps) {
  const [metadata, setMetadata] = useState<MetadataFormData>(initialFormData);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Query to fetch existing metadata
  const {
    data: existingMetadata,
    isLoading: isLoadingMetadata,
    error: queryError,
  } = useRegisterMetadataDAOQuery(stack?.id);

  // Mutation to create/update metadata
  const createMetadataMutation = useCreateMetadataMutation({
    onSuccess: () => {
      setSuccess("Metadata registered successfully!");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to register metadata");
      setSuccess(null);
    },
  });

  // Populate form with existing data when it loads
  useEffect(() => {
    if (existingMetadata) {
      setMetadata({
        token: existingMetadata.config.token,
        username: existingMetadata.config.username,
        email: existingMetadata.config.email,
        metadata: existingMetadata.config.metadata,
      });
    }
  }, [existingMetadata]);

  const isMetadataSubmitted = Boolean(existingMetadata);
  const isSubmitting = createMetadataMutation.isPending;

  const handleMetadataChange = (
    section: keyof MetadataFormData | keyof MetadataFormData["metadata"],
    field: string,
    value: string
  ) => {
    if (section === "token" || section === "username" || section === "email") {
      setMetadata((prev) => ({ ...prev, [section]: value }));
    } else {
      setMetadata((prev) => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          [section]: {
            ...(prev.metadata[section as keyof typeof prev.metadata] as object),
            [field]: value,
          },
        },
      }));
    }
  };

  const handleSubmitMetadata = async () => {
    if (!stack?.id) {
      setError("No stack ID available");
      return;
    }

    setError(null);
    setSuccess(null);

    const requestPayload: CreateRegisterMetadataDAORequest = {
      username: metadata.username,
      token: metadata.token,
      email: metadata.email,
      metadata: metadata.metadata,
    };

    createMetadataMutation.mutate({
      id: stack.id,
      request: requestPayload,
    });
  };

  const handleUpdateMetadata = async () => {
    await handleSubmitMetadata(); // Same function for create and update
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            {success}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Chain Metadata Registration</h2>
          <p className="text-muted-foreground">
            Register and manage metadata for your deployed rollup chain
          </p>
        </div>
        {isMetadataSubmitted && (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <Database className="w-3 h-3 mr-1" />
            Metadata Registered
          </Badge>
        )}
      </div>

      {/* Step 1: GitHub PAT */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Step 1: GitHub Authentication
          </CardTitle>
          <CardDescription>
            Provide your GitHub credentials to register metadata. All fields are
            required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="githubUsername">
                GitHub Username <span className="text-red-500">*</span>
              </Label>
              <Input
                id="githubUsername"
                placeholder="your-github-username"
                value={metadata.username}
                onChange={(e) =>
                  handleMetadataChange("username", "", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="githubEmail">
                GitHub Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="githubEmail"
                type="email"
                placeholder="you@example.com"
                value={metadata.email}
                onChange={(e) =>
                  handleMetadataChange("email", "", e.target.value)
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubPAT">
              GitHub Personal Access Token{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="githubPAT"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={metadata.token}
              onChange={(e) =>
                handleMetadataChange("token", "", e.target.value)
              }
            />
            <p className="text-xs text-muted-foreground">
              Required permissions: repo, write:packages.
              <Button variant="link" className="h-auto p-0 text-xs" asChild>
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create token <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Chain Information */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Step 2: Chain Information
          </CardTitle>
          <CardDescription>
            Basic information about your rollup chain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chainDescription">Description</Label>
            <Textarea
              id="chainDescription"
              placeholder="Example rollup deployed with TRH SDK"
              value={metadata.metadata?.chain.description}
              onChange={(e) =>
                handleMetadataChange("chain", "description", e.target.value)
              }
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chainLogo">Logo URL</Label>
              <Input
                id="chainLogo"
                placeholder="https://example.com/logo.png"
                value={metadata.metadata?.chain.logo}
                onChange={(e) =>
                  handleMetadataChange("chain", "logo", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chainWebsite">Website URL</Label>
              <Input
                id="chainWebsite"
                placeholder="https://example-l2.com"
                value={metadata.metadata?.chain.website}
                onChange={(e) =>
                  handleMetadataChange("chain", "website", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Infrastructure */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Step 3: Infrastructure
          </CardTitle>
          <CardDescription>Bridge and explorer information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bridgeName">Bridge Name</Label>
              <Input
                id="bridgeName"
                placeholder="Example Bridge"
                value={metadata.metadata?.bridge.name}
                onChange={(e) =>
                  handleMetadataChange("bridge", "name", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="explorerName">Explorer Name</Label>
              <Input
                id="explorerName"
                placeholder="Example Explorer"
                value={metadata.metadata?.explorer.name}
                onChange={(e) =>
                  handleMetadataChange("explorer", "name", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Support Resources */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Step 4: Support Resources
          </CardTitle>
          <CardDescription>Community and support links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="statusPageUrl">Status Page URL</Label>
              <Input
                id="statusPageUrl"
                placeholder="https://status.example-l2.com"
                value={metadata.metadata?.supportResources.statusPageUrl}
                onChange={(e) =>
                  handleMetadataChange(
                    "supportResources",
                    "statusPageUrl",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportContactUrl">Support Contact URL</Label>
              <Input
                id="supportContactUrl"
                placeholder="https://discord.gg/example-support"
                value={metadata.metadata?.supportResources.supportContactUrl}
                onChange={(e) =>
                  handleMetadataChange(
                    "supportResources",
                    "supportContactUrl",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentationUrl">Documentation URL</Label>
              <Input
                id="documentationUrl"
                placeholder="https://docs.example-l2.com"
                value={metadata.metadata?.supportResources.documentationUrl}
                onChange={(e) =>
                  handleMetadataChange(
                    "supportResources",
                    "documentationUrl",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="communityUrl">Community URL</Label>
              <Input
                id="communityUrl"
                placeholder="https://t.me/example_community"
                value={metadata.metadata?.supportResources.communityUrl}
                onChange={(e) =>
                  handleMetadataChange(
                    "supportResources",
                    "communityUrl",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="helpCenterUrl">Help Center URL</Label>
              <Input
                id="helpCenterUrl"
                placeholder="https://help.example-l2.com"
                value={metadata.metadata?.supportResources.helpCenterUrl}
                onChange={(e) =>
                  handleMetadataChange(
                    "supportResources",
                    "helpCenterUrl",
                    e.target.value
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcementUrl">Announcement URL</Label>
              <Input
                id="announcementUrl"
                placeholder="https://twitter.com/example_l2"
                value={metadata.metadata?.supportResources.announcementUrl}
                onChange={(e) =>
                  handleMetadataChange(
                    "supportResources",
                    "announcementUrl",
                    e.target.value
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit/Update Actions */}
      <Card className="border-0 shadow-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {isMetadataSubmitted ? "Update Metadata" : "Register Metadata"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isMetadataSubmitted
                  ? "Update your chain metadata with the latest information"
                  : "Submit your chain metadata to the registry"}
              </p>
            </div>
            <Button
              onClick={
                isMetadataSubmitted
                  ? handleUpdateMetadata
                  : handleSubmitMetadata
              }
              disabled={
                isSubmitting ||
                !metadata.token ||
                !metadata.username ||
                !metadata.email
              }
              className=" text-white font-medium shadow-lg"
            >
              {isSubmitting
                ? "Processing..."
                : isMetadataSubmitted
                ? "Update Metadata"
                : "Register Metadata"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
