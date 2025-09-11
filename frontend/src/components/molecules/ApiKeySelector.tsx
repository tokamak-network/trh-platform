"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Key, Info, ChevronDown, Save } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APIKey, APIKeyFormData } from "@/features/configuration/schemas";
import { SaveApiKeyDialog } from "./SaveApiKeyDialog";
import toast from "react-hot-toast";

interface ApiKeySelectorProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly apiKeys: APIKey[];
  readonly error?: string;
  readonly required?: boolean;
  readonly tooltip?: string;
  readonly className?: string;
  // Props for filtering and save functionality
  readonly keyType: string; // e.g., "CMC" for CoinMarketCap
  readonly onSaveKey?: (data: APIKeyFormData) => Promise<void>;
  readonly allowSave?: boolean;
}

export function ApiKeySelector({
  id,
  label,
  placeholder,
  value = "",
  onChange,
  apiKeys,
  error,
  required = false,
  tooltip,
  className = "",
  keyType,
  onSaveKey,
  allowSave = true,
}: ApiKeySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter API keys based on type and input text
  const filteredApiKeys = apiKeys.filter((apiKey) => {
    const searchText = filterText.toLowerCase();
    return (
      apiKey.type === keyType &&
      (apiKey.apiKey.toLowerCase().includes(searchText) ||
        apiKey.id.toLowerCase().includes(searchText))
    );
  });

  // Check if the current value is a new API key that doesn't exist in apiKeys
  const isValidApiKey = (key: string): boolean => {
    // Basic validation - API key should be non-empty and reasonable length
    return key.trim().length > 0 && key.trim().length >= 8;
  };

  const isNewApiKey =
    value &&
    isValidApiKey(value) &&
    !apiKeys.some((apiKey) => apiKey.apiKey === value) &&
    allowSave &&
    onSaveKey;

  // Handle save API key - opens dialog
  const handleSaveApiKey = () => {
    if (!value || !onSaveKey || !isValidApiKey(value)) return;
    setShowSaveDialog(true);
  };

  // Handle actual save from dialog
  const handleDialogSave = async (data: APIKeyFormData) => {
    if (!onSaveKey) return;
    await onSaveKey(data);
    toast.success("API key saved successfully!");
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setFilterText(inputValue);
    onChange(inputValue);
    setIsOpen(true);
  };

  // Handle API key selection
  const handleApiKeySelect = (apiKey: APIKey) => {
    onChange(apiKey.apiKey);
    setFilterText("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (filteredApiKeys.length > 0) {
      setIsOpen(true);
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFilterText("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Show dropdown when there are filtered results
  const shouldShowDropdown = isOpen && filteredApiKeys.length > 0;

  // Format API key for display (masked)
  const formatApiKeyForDisplay = (apiKey: string): string => {
    if (apiKey.length <= 16) return apiKey;
    return `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`;
  };

  return (
    <div className={`space-y-3 ${className} relative`}>
      {/* Label with tooltip */}
      <Label
        htmlFor={id}
        className="text-sm font-medium text-slate-700 flex items-center gap-1"
      >
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  {label} {required && <span className="text-red-500">*</span>}
                  <Info className="w-3 h-3 text-slate-400" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span>
            {label} {required && <span className="text-red-500">*</span>}
          </span>
        )}
      </Label>

      {/* Combobox Input */}
      <div className="relative">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              id={id}
              type="password"
              placeholder={placeholder}
              value={value}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              className={`pr-8 ${error ? "border-red-500" : ""}`}
            />
            {filteredApiKeys.length > 0 && (
              <ChevronDown
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            )}
          </div>

          {/* Save Button for new API keys */}
          {isNewApiKey && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSaveApiKey}
              className="shrink-0 px-3"
            >
              <Save className="w-3 h-3 mr-1" />
              Save
            </Button>
          )}
        </div>

        {/* Dropdown */}
        {shouldShowDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
          >
            {filteredApiKeys.map((apiKey) => (
              <button
                key={apiKey.id}
                type="button"
                className="w-full px-3 py-2 text-left cursor-pointer hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                onClick={() => handleApiKeySelect(apiKey)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm font-mono">
                        {formatApiKeyForDisplay(apiKey.apiKey)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {apiKey.type}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-500">
                      Created: {new Date(apiKey.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Helper text */}
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Key className="w-3 h-3" />
        <span>
          {filteredApiKeys.length > 0 ? (
            <>
              {filteredApiKeys.length} saved {keyType} key{filteredApiKeys.length !== 1 ? "s" : ""} available • Type to filter or enter new key
              {allowSave && onSaveKey ? " • Click Save to store new keys" : ""}
            </>
          ) : (
            <>
              Enter {keyType} API key manually
              {allowSave && onSaveKey ? " • New keys can be saved for future use" : ""}
            </>
          )}
        </span>
      </div>

      {/* Save API Key Dialog */}
      {showSaveDialog && (
        <SaveApiKeyDialog
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSave={handleDialogSave}
          apiKey={value}
          type={keyType}
        />
      )}
    </div>
  );
}
