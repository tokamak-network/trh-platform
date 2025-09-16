"use client";

import { AuthenticatedLayout } from "@/components/layout";
import { CreateRollupStepper } from "@/features/rollup/components/CreateRollupStepper";
import { useCreateRollup } from "@/features/rollup/hooks/useCreateRollup";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Rocket } from "lucide-react";
import {
  NetworkAndChainStep,
  AccountAndAwsStep,
  DaoCandidateStep,
  ReviewAndDeployStep,
} from "@/features/rollup/components/steps";
import { FormProvider } from "react-hook-form";

function CreateRollupContent() {
  const {
    form,
    currentStep,
    progress,
    steps,
    onBack,
    goToNextStep,
    goToPreviousStep,
    isDeploying,
  } = useCreateRollup();

  const handleSkipDaoCandidate = () => {
    form.setValue("daoCandidate", undefined);
    goToNextStep();
  };

  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === steps.length;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <NetworkAndChainStep />;
      case 2:
        return <AccountAndAwsStep />;
      case 3:
        return <DaoCandidateStep />;
      case 4:
        return <ReviewAndDeployStep />;
      default:
        return null;
    }
  };

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-gray-100">
        {/* Main content with bottom padding to prevent overlap with fixed footer */}
        <div className="p-6 pb-24">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">Deploy New Stack</h1>
              </div>
              <p className="text-gray-500">
                Follow the steps below to deploy your custom rollup
              </p>
            </div>

            <CreateRollupStepper
              steps={steps}
              currentStep={currentStep}
              progress={progress}
              onBack={onBack}
            />

            <FormProvider {...form}>{renderStepContent()}</FormProvider>
          </div>
        </div>

        {/* Fixed footer */}
        <div className="fixed bottom-0 right-0 left-[250px] bg-white">
          <footer className="border-t py-4 shadow-md">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={goToPreviousStep}
                  disabled={isFirstStep}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex gap-3">
                  {currentStep === 3 && (
                    <Button
                      variant="outline"
                      onClick={() => handleSkipDaoCandidate()}
                      type="button"
                      className="flex items-center"
                    >
                      Skip this step
                    </Button>
                  )}
                  <Button
                    onClick={goToNextStep}
                    disabled={form.formState.isValidating || isDeploying}
                    className="flex items-center gap-2"
                  >
                    {isLastStep ? "Deploy Rollup" : "Next"}
                    {isLastStep && isDeploying ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : isLastStep ? (
                      <Rocket className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

export default function CreateRollupPage() {
  return <CreateRollupContent />;
}
