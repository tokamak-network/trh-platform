"use client";

import { Suspense } from "react";
import { AuthenticatedLayout } from "@/components/layout";
import { ConfigurationManagement } from "@/features/configuration";

function ConfigurationPageContent() {
  return (
    <AuthenticatedLayout>
      <main className="flex-1 p-6 px-16">
        <ConfigurationManagement />
      </main>
    </AuthenticatedLayout>
  );
}

function ConfigurationPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ConfigurationPageContent />
    </Suspense>
  );
}

export default ConfigurationPage;
