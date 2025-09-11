"use client";
import { Sidebar } from "@/components/molecules";
import { useAuthContext } from "@/providers";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export const AuthenticatedLayout: React.FC<AuthenticatedLayoutProps> = ({
  children,
}) => {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Fixed sidebar */}
      <div className="fixed left-0 top-0 h-full">
        <Sidebar />
      </div>
      {/* Main content with left margin to account for fixed sidebar */}
      <div className="ml-[250px] min-h-screen bg-gray-100">{children}</div>
    </div>
  );
};
