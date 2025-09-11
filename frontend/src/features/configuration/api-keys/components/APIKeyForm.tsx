"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APIKey, APIKeyFormData, apiKeyFormSchema } from "../../schemas";

interface APIKeyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: APIKeyFormData) => void;
  isLoading?: boolean;
  apiKey?: APIKey | null;
}

const API_KEY_TYPES = [{ value: "CMC", label: "CoinMarketCap" }];

export function APIKeyForm({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  apiKey,
}: APIKeyFormProps) {
  const [selectedType, setSelectedType] = useState<string>("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<APIKeyFormData>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      apiKey: "",
      type: "",
    },
  });

  useEffect(() => {
    if (apiKey) {
      setValue("apiKey", apiKey.apiKey);
      setValue("type", apiKey.type);
      setSelectedType(apiKey.type);
    } else {
      reset();
      setSelectedType("");
    }
  }, [apiKey, setValue, reset]);

  const handleFormSubmit = (data: APIKeyFormData) => {
    onSubmit(data);
  };

  const handleClose = () => {
    reset();
    setSelectedType("");
    onClose();
  };

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    setValue("type", value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {apiKey ? "Edit API Key" : "Add New API Key"}
          </DialogTitle>
          <DialogDescription>
            {apiKey
              ? "Update your API key information."
              : "Add a new API key for external service integrations."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Service Type</Label>
            <Select value={selectedType} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {API_KEY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-sm text-destructive">{errors.type.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter your API key"
              {...register("apiKey")}
            />
            {errors.apiKey && (
              <p className="text-sm text-destructive">
                {errors.apiKey.message}
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : apiKey ? "Update" : "Add API Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
