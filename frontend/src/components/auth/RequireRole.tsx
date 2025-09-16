"use client";

import { ReactNode } from "react";
import { useAuthContext } from "@/providers/auth-provider";
import { ProtectedRoute } from "./ProtectedRoute";

interface RequireRoleProps {
  children: ReactNode;
  roles: string[];
  fallback?: ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({
  children,
  roles,
  fallback,
}) => {
  const { user } = useAuthContext();

  // Check if user has required role
  const hasRequiredRole = user && roles.includes(user.role);

  if (!hasRequiredRole) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              Access Denied
            </h2>
            <p className="text-neutral-600">
              You don&apos;t have permission to access this page.
            </p>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
};

// Higher-order component for role-based protection
export function withRole<P extends object>(
  Component: React.ComponentType<P>,
  roles: string[]
): React.ComponentType<P> {
  const RoleProtectedComponent = (props: P) => {
    return (
      <ProtectedRoute>
        <RequireRole roles={roles}>
          <Component {...props} />
        </RequireRole>
      </ProtectedRoute>
    );
  };

  RoleProtectedComponent.displayName = `withRole(${
    Component.displayName || Component.name
  })`;

  return RoleProtectedComponent;
}
