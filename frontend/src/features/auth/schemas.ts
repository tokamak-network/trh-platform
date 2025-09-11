import * as z from "zod";

// Login request schema
export const loginRequestSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

// User schema
export const userSchema = z.object({
  email: z.email(),
  id: z.string(),
  role: z.enum(["Admin", "User"]),
});

// Login response schema
export const loginResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
});

export const AuthStateSchema = z.object({
  user: userSchema.nullable(),
  token: z.string().nullable(),
  isAuthenticated: z.boolean(),
  isLoading: z.boolean(),
});

// Infer types from schemas
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthState = z.infer<typeof AuthStateSchema>;
