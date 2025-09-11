"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AWSCredentialsTab } from "../aws-credentials";
import { RPCManagement } from "../rpc-management";
import { APIKeysManagement } from "../api-keys";
import { ConfigurationTab } from "../schemas";

interface ConfigurationTabsProps {
  currentTab: ConfigurationTab;
}

export function ConfigurationTabs({ currentTab }: ConfigurationTabsProps) {
  const router = useRouter();

  const handleTabChange = (value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    router.push(url.pathname + url.search);
  };

  return (
    <Tabs
      value={currentTab}
      onValueChange={handleTabChange}
      className="space-y-6"
    >
      <TabsList className="grid w-full grid-cols-3 bg-white/60 backdrop-blur-sm border-0 shadow-lg">
        <TabsTrigger
          value="aws"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          AWS Credentials
        </TabsTrigger>
        <TabsTrigger
          value="rpc"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          RPC Management
        </TabsTrigger>
        <TabsTrigger
          value="api-keys"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          API Keys
        </TabsTrigger>
      </TabsList>

      {/* AWS Credentials Tab */}
      <TabsContent value="aws" className="space-y-6">
        <AWSCredentialsTab />
      </TabsContent>

      {/* RPC Management Tab */}
      <TabsContent value="rpc" className="space-y-6">
        <RPCManagement />
      </TabsContent>

      {/* API Keys Tab */}
      <TabsContent value="api-keys" className="space-y-6">
        <APIKeysManagement />
      </TabsContent>
    </Tabs>
  );
}
