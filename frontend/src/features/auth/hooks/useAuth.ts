import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { authService } from "../services/authService";
import { LoginRequest, AuthState } from "../schemas";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";

export const useAuth = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const token = authService.getStoredToken();
    if (token) {
      // Fetch user data from token
      authService
        .getCurrentUser()
        .then((userData) => {
          setAuthState({
            user: userData,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        })
        .catch((error) => {
          console.error("Auth error:", error);

          // If token is invalid, clear it and set not authenticated
          authService.removeToken();
          setAuthState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        });
    } else {
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginRequest) => authService.login(credentials),
    onSuccess: (data) => {
      // Store token in localStorage
      authService.storeToken(data.token);

      // Update auth state
      setAuthState({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });

      // Redirect to the intended page or dashboard
      const redirectTo = searchParams.get("redirect") || "/dashboard";
      router.push(redirectTo);

      toast.success("Login successful!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Login failed");
    },
  });

  // Logout function
  const logout = useCallback(() => {
    authService.removeToken();
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    router.push("/auth");
    toast.success("Logged out successfully");
  }, [router]);

  // Login function
  const login = useCallback(
    (credentials: LoginRequest) => {
      loginMutation.mutate(credentials);
    },
    [loginMutation]
  );

  return {
    ...authState,
    login,
    logout,
    isLoggingIn: loginMutation.isPending,
  };
};
