"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout";
import { RollupDetail } from "@/features/rollup/components/detail";

function RollupDetailContent() {
  const params = useParams();
  const id = params.id as string;

  return <RollupDetail id={id} />;
}

function RollupDetailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthenticatedLayout>
        <main className="flex-1 p-6 px-16">
          <RollupDetailContent />
        </main>
      </AuthenticatedLayout>
    </Suspense>
  );
}

export default RollupDetailPage;
