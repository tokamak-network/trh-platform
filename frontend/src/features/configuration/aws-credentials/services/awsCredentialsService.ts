import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import {
  AWSCredential,
  CreateAWSCredentialRequest,
  UpdateAWSCredentialRequest,
  AWSCredentialsListResponse,
  AWSCredentialResponse,
  awsCredentialsListResponseSchema,
  awsCredentialResponseSchema,
  awsRegionsResponseSchema,
} from "../../schemas";

export class AwsCredentialsService {
  private static instance: AwsCredentialsService | null = null;

  private constructor() {}

  public static getInstance(): AwsCredentialsService {
    if (!AwsCredentialsService.instance) {
      AwsCredentialsService.instance = new AwsCredentialsService();
    }
    return AwsCredentialsService.instance;
  }

  // AWS Credentials methods
  async getAwsCredentials(): Promise<AWSCredential[]> {
    try {
      const response = await apiGet<{
        status: number;
        message: string;
        data: {
          credentials: AWSCredential[];
          total: number;
        };
      }>("configuration/aws-credentials");

      const validatedResponse = awsCredentialsListResponseSchema.parse(
        response.data
      );
      return validatedResponse.credentials;
    } catch (error) {
      const apiError = error as ApiError;
      throw new Error(apiError.message || "Failed to fetch AWS credentials");
    }
  }

  async getAwsCredential(id: string): Promise<AWSCredential> {
    try {
      const response = await apiGet<{
        status: number;
        message: string;
        data: {
          credential: AWSCredential;
        };
      }>(`configuration/aws-credentials/${id}`);

      const validatedResponse = awsCredentialResponseSchema.parse(
        response.data.data.credential
      );
      return validatedResponse.credential;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("AWS credential not found");
      }
      throw new Error(apiError.message || "Failed to fetch AWS credential");
    }
  }

  async createAwsCredential(
    data: CreateAWSCredentialRequest
  ): Promise<AWSCredential> {
    try {
      const response = await apiPost<{
        status: number;
        message: string;
        data: {
          credential: AWSCredential;
        };
      }>("configuration/aws-credentials", data);

      const validatedResponse = awsCredentialResponseSchema.parse(
        response.data
      );
      return validatedResponse.credential;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 400) {
        throw new Error("Invalid credential data");
      }
      if (apiError.status === 409) {
        throw new Error("AWS credential with this name already exists");
      }
      throw new Error(apiError.message || "Failed to create AWS credential");
    }
  }

  async updateAwsCredential(
    id: string,
    data: UpdateAWSCredentialRequest
  ): Promise<AWSCredential> {
    try {
      const response = await apiPatch<{
        status: number;
        message: string;
        data: {
          credential: AWSCredential;
        };
      }>(`configuration/aws-credentials/${id}`, data);

      const validatedResponse = awsCredentialResponseSchema.parse(
        response.data
      );
      return validatedResponse.credential;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("AWS credential not found");
      }
      if (apiError.status === 400) {
        throw new Error("Invalid credential data");
      }
      if (apiError.status === 409) {
        throw new Error("AWS credential with this name already exists");
      }
      throw new Error(apiError.message || "Failed to update AWS credential");
    }
  }

  async deleteAwsCredential(id: string): Promise<void> {
    try {
      await apiDelete(`configuration/aws-credentials/${id}`);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("AWS credential not found");
      }
      if (apiError.status === 409) {
        throw new Error("Cannot delete credential that is currently in use");
      }
      throw new Error(apiError.message || "Failed to delete AWS credential");
    }
  }

  async getAwsRegions(
    accessKeyId: string,
    secretAccessKey: string
  ): Promise<string[]> {
    try {
      const response = await apiPost<{
        status: number;
        message: string;
        data: {
          regions: string[];
          total: number;
        };
      }>("configuration/aws-credentials/regions", {
        accessKeyId,
        secretAccessKey,
      });

      const validatedResponse = awsRegionsResponseSchema.parse(response.data);
      return validatedResponse.regions;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 400) {
        throw new Error("Invalid AWS credentials");
      }
      if (apiError.status === 401) {
        throw new Error("AWS credentials are not authorized");
      }
      if (apiError.status === 403) {
        throw new Error("Insufficient permissions to access AWS regions");
      }
      throw new Error(apiError.message || "Failed to fetch AWS regions");
    }
  }

  maskSecretKey(secretKey: string): string {
    if (secretKey.length <= 8) {
      return "•".repeat(secretKey.length);
    }
    return `${secretKey.slice(0, 4)}${"•".repeat(32)}${secretKey.slice(-4)}`;
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  }
}

// Create and export the singleton instance
export const awsCredentialsService = AwsCredentialsService.getInstance();
