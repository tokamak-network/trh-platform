"use client";

import { AccountSetup } from "./AccountSetup";
import { AwsConfig } from "./AwsConfig";

interface AccountAndAwsStepProps {
  onNext?: () => void;
  onBack?: () => void;
}

export function AccountAndAwsStep({
  onNext = () => {},
  onBack = () => {},
}: AccountAndAwsStepProps) {
  return (
    <div className="space-y-8">
      <AccountSetup />
      <AwsConfig onNext={onNext} onBack={onBack} />
    </div>
  );
}
