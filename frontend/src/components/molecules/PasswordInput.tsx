import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type"> {
  showToggle?: boolean;
  toggleButtonClassName?: string;
  containerClassName?: string;
  error?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      showToggle = true,
      toggleButtonClassName,
      containerClassName,
      error,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    const togglePasswordVisibility = () => {
      setShowPassword(!showPassword);
    };

    return (
      <div className={cn("w-full", containerClassName)}>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            className={cn(
              showToggle && "pr-10", // Add padding for the toggle button
              error &&
                "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
              className
            )}
            ref={ref}
            aria-invalid={error ? "true" : "false"}
            {...props}
          />
          {showToggle && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8",
                "text-muted-foreground hover:text-foreground",
                toggleButtonClassName
              )}
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
