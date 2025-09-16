"use client";
import { AuthenticatedLayout } from "@/components/layout";

function NotificationPage() {
  return (
    <AuthenticatedLayout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Coming Soon</h1>
          <p className="text-lg text-gray-600">Notifications</p>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

export default NotificationPage;
