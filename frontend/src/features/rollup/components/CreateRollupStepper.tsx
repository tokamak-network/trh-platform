import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";

type Step = {
  id: number;
  title: string;
  description: string;
  icon: LucideIcon;
};

interface CreateRollupStepperProps {
  steps: Step[];
  currentStep: number;
  progress: number;
  onBack: () => void;
}

export function CreateRollupStepper({
  steps,
  currentStep,
  progress,
  onBack,
}: CreateRollupStepperProps) {
  return (
    <Card className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex items-center gap-2 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Rollups
        </Button>
        <Badge variant="default">
          Step {currentStep} of {steps.length}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Overall Progress</h2>
          <span className="text-sm text-gray-500">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="flex justify-between relative">
        {/* Connection lines container */}
        <div className="absolute top-5 left-0 w-full">
          {steps.slice(0, -1).map((_, index) => {
            const segmentProgress = currentStep - 1 - index;
            return (
              <div
                key={index}
                className="absolute h-[1px]"
                style={{
                  left: `${(index * 100) / (steps.length - 1)}%`,
                  width: `${100 / (steps.length - 1)}%`,
                }}
              >
                {/* Background line */}
                <div
                  className="absolute w-[60%] h-full bg-gray-200"
                  style={{
                    left: "20%",
                    transform: "translateY(-50%)",
                  }}
                />
                {/* Progress line */}
                <div
                  className="absolute h-full bg-primary transition-all duration-300 ease-in-out"
                  style={{
                    left: "20%",
                    width: `${Math.max(
                      0,
                      Math.min(60, segmentProgress * 60)
                    )}%`,
                    transform: "translateY(-50%)",
                  }}
                />
              </div>
            );
          })}
        </div>

        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;

          return (
            <div
              key={step.id}
              className={cn(
                "flex flex-col items-center space-y-2 relative z-10 w-32",
                isCompleted
                  ? "text-primary"
                  : isCurrent
                  ? "text-primary"
                  : "text-gray-400"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-200",
                  isCompleted
                    ? "bg-primary border-primary text-primary-foreground"
                    : isCurrent
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-white border-gray-200 text-gray-400"
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-center">
                <span className="text-sm font-medium block">{step.title}</span>
                <span className="text-xs text-gray-500 block mt-1 max-w-[150px]">
                  {step.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
