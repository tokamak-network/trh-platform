"use client";

import { DashboardLogoIcon } from "@/components/icon";
import { AuthForm } from "@/features/auth/components/AuthForm";
import Link from "next/link";

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="flex flex-col gap-10 items-center w-full max-w-md">
        <div className="flex flex-col items-center gap-2">
          <DashboardLogoIcon />
        </div>
        <AuthForm />
        <div className="flex flex-col items-center gap-2">
          <p className="text-neutral-600">
            Need Help?{" "}
            <Link href="/help" className="text-primary-500">
              Contract Rollup Hub team
            </Link>
          </p>
          <p className="text-neutral-600 text-sm">
            ©2025 Tokamak Rollup Hub. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
