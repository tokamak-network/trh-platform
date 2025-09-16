import * as z from "zod";

// AWS Credential schemas
export const awsCredentialSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export const createAwsCredentialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
});

export const updateAwsCredentialSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  accessKeyId: z.string().min(1, "Access Key ID is required").optional(),
  secretAccessKey: z
    .string()
    .min(1, "Secret Access Key is required")
    .optional(),
});

// API Response schemas
export const awsCredentialsListResponseSchema = z.object({
  credentials: z.array(awsCredentialSchema),
  total: z.number(),
});

export const awsCredentialResponseSchema = z.object({
  credential: awsCredentialSchema,
});

export const awsRegionsResponseSchema = z.object({
  regions: z.array(z.string()),
  total: z.number(),
});

// Form schemas
export const awsCredentialFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
});

// Infer types from schemas
export type AWSCredential = z.infer<typeof awsCredentialSchema>;
export type CreateAWSCredentialRequest = z.infer<
  typeof createAwsCredentialSchema
>;
export type UpdateAWSCredentialRequest = z.infer<
  typeof updateAwsCredentialSchema
>;
export type AWSCredentialsListResponse = z.infer<
  typeof awsCredentialsListResponseSchema
>;
export type AWSCredentialResponse = z.infer<typeof awsCredentialResponseSchema>;
export type AWSCredentialFormData = z.infer<typeof awsCredentialFormSchema>;

// API Key schemas
export const apiKeySchema = z.object({
  id: z.string(),
  apiKey: z.string().min(1, "API Key is required"),
  type: z.string().min(1, "Type is required"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createApiKeySchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
  type: z.string().min(1, "Type is required"),
});

export const updateApiKeySchema = z.object({
  apiKey: z.string().min(1, "API Key is required").optional(),
  type: z.string().min(1, "Type is required").optional(),
});

// API Key Response schemas
export const apiKeysListResponseSchema = z.object({
  apiKeys: z.array(apiKeySchema),
  total: z.number(),
});

export const apiKeyResponseSchema = z.object({
  apiKey: apiKeySchema,
});

// API Key Form schemas
export const apiKeyFormSchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
  type: z.string().min(1, "Type is required"),
});

// Infer API Key types from schemas
export type APIKey = z.infer<typeof apiKeySchema>;
export type CreateAPIKeyRequest = z.infer<typeof createApiKeySchema>;
export type UpdateAPIKeyRequest = z.infer<typeof updateApiKeySchema>;
export type APIKeysListResponse = z.infer<typeof apiKeysListResponseSchema>;
export type APIKeyResponse = z.infer<typeof apiKeyResponseSchema>;
export type APIKeyFormData = z.infer<typeof apiKeyFormSchema>;

// Configuration tab types
export type ConfigurationTab = "aws" | "rpc" | "api-keys";

// UI state types
export type SecretVisibilityState = { [key: string]: boolean };

export interface ConfigurationState {
  awsCredentials: AWSCredential[];
  isLoading: boolean;
  error: string | null;
}

// RPC URL schemas
export const rpcUrlSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  rpcUrl: z.string().url("Must be a valid URL"),
  type: z.enum(["ExecutionLayer", "BeaconChain"]),
  network: z.enum(["Mainnet", "Testnet"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRpcUrlSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rpcUrl: z.string().url("Must be a valid URL"),
  type: z.enum(["ExecutionLayer", "BeaconChain"]),
  network: z.enum(["Mainnet", "Testnet"]),
});

export const updateRpcUrlSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  rpcUrl: z.string().url("Must be a valid URL").optional(),
  type: z.enum(["ExecutionLayer", "BeaconChain"]).optional(),
  network: z.enum(["Mainnet", "Testnet"]).optional(),
});

// RPC URL Response schemas
export const rpcUrlsListResponseSchema = z.object({
  rpcUrls: z.array(rpcUrlSchema),
  total: z.number(),
});

export const rpcUrlResponseSchema = z.object({
  rpcUrl: rpcUrlSchema,
});

// RPC URL Form schemas
export const rpcUrlFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rpcUrl: z.string().url("Must be a valid URL"),
  type: z.enum(["ExecutionLayer", "BeaconChain"]),
  network: z.enum(["Mainnet", "Testnet"]),
});

// Infer RPC URL types from schemas
export type RPCUrl = z.infer<typeof rpcUrlSchema>;
export type CreateRPCUrlRequest = z.infer<typeof createRpcUrlSchema>;
export type UpdateRPCUrlRequest = z.infer<typeof updateRpcUrlSchema>;
export type RPCUrlsListResponse = z.infer<typeof rpcUrlsListResponseSchema>;
export type RPCUrlResponse = z.infer<typeof rpcUrlResponseSchema>;
export type RPCUrlFormData = z.infer<typeof rpcUrlFormSchema>;
