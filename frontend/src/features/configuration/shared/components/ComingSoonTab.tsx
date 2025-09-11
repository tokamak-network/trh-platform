"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ComingSoonTabProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoonTab({
  icon: Icon,
  title,
  description,
}: ComingSoonTabProps) {
  return (
    <Card className="border-2 border-dashed border-muted-foreground/25">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <Icon className="w-10 h-10 text-primary" />
        </div>
        <CardTitle className="text-2xl mb-4">{title}</CardTitle>
        <CardDescription className="text-center max-w-md">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}
