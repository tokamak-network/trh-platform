import { apiPost, apiGet, ApiError } from "@/lib/api";
import {
  LoginRequest,
  LoginResponse,
  loginResponseSchema,
  User,
  userSchema,
} from "../schemas";

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await apiPost<LoginResponse>("auth/login", credentials);
      // Validate response with Zod schema
      const validatedResponse = loginResponseSchema.parse(response);
      return validatedResponse;
    } catch (error) {
      const apiError = error as ApiError;

      if (apiError.status === 401) {
        throw new Error("Invalid email or password");
      }
      if (apiError.status === 400) {
        throw new Error("Invalid request data");
      }
      if (apiError.status >= 500) {
        throw new Error("Server error. Please try again later.");
      }
      throw new Error(apiError.message || "Login failed");
    }
  }

  // Get current user from backend API
  async getCurrentUser(): Promise<User> {
    try {
      const token = this.getStoredToken();
      if (!token) {
        throw new Error("No authentication token found");
      }

      // Make an API call to get the current user profile
      const response = await apiGet<User>("auth/profile");
      // Validate the user data with our schema
      return userSchema.parse(response);
    } catch (error) {
      console.error("Failed to get current user:", error);
      throw new Error("Failed to authenticate user");
    }
  }

  // Helper method to get stored token
  getStoredToken(): string | null {
    if (typeof window !== "undefined") {
      // Try to get from cookie first, fallback to localStorage for backward compatibility
      const cookies = document.cookie.split(";");
      const authCookie = cookies.find((cookie) =>
        cookie.trim().startsWith("auth-token=")
      );
      if (authCookie) {
        return authCookie.split("=")[1];
      }
      return localStorage.getItem("accessToken");
    }
    return null;
  }

  // Helper method to store token
  storeToken(token: string): void {
    if (typeof window !== "undefined") {
      // Store in both cookie (for middleware) and localStorage (for backward compatibility)
      document.cookie = `auth-token=${token}; path=/; max-age=${
        60 * 60 * 24 * 7
      }; SameSite=Strict`;
      localStorage.setItem("accessToken", token);
    }
  }

  // Helper method to remove token
  removeToken(): void {
    if (typeof window !== "undefined") {
      // Remove from both cookie and localStorage
      document.cookie =
        "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      localStorage.removeItem("accessToken");
    }
  }
}

export const authService = AuthService.getInstance();
