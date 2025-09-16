"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Info, ChevronDown, Save } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RPCUrl, RPCUrlFormData } from "@/features/configuration/schemas";
import { SaveRpcUrlDialog } from "./SaveRpcUrlDialog";
import toast from "react-hot-toast";

interface RPCSelectorProps {
  id: string;
  label: string;
  placeholder: string;
  value?: string;
  onChange: (value: string) => void;
  rpcUrls: RPCUrl[];
  error?: string;
  required?: boolean;
  tooltip?: string;
  className?: string;
  // New props for save functionality
  rpcType: "ExecutionLayer" | "BeaconChain";
  network: "Mainnet" | "Testnet";
  onSaveUrl?: (data: RPCUrlFormData) => Promise<void>;
  allowSave?: boolean;
}

export function RPCSelector({
  id,
  label,
  placeholder,
  value = "",
  onChange,
  rpcUrls,
  error,
  required = false,
  tooltip,
  className = "",
  rpcType,
  network,
  onSaveUrl,
  allowSave = true,
}: RPCSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter RPCs based on input text
  const filteredRpcs = rpcUrls.filter((rpc) => {
    const searchText = filterText.toLowerCase();
    return (
      rpc.name.toLowerCase().includes(searchText) ||
      rpc.rpcUrl.toLowerCase().includes(searchText)
    );
  });

  // Check if the current value is a new URL that doesn't exist in rpcUrls
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isNewUrl =
    value &&
    isValidUrl(value) &&
    !rpcUrls.some((rpc) => rpc.rpcUrl === value) &&
    allowSave &&
    onSaveUrl;

  // Generate a default name for the new URL
  const generateDefaultName = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      // Use hostname and add network/type info
      return `${hostname} (${network} ${
        rpcType === "ExecutionLayer" ? "Execution" : "Beacon"
      })`;
    } catch {
      return `Custom ${
        rpcType === "ExecutionLayer" ? "Execution" : "Beacon"
      } URL`;
    }
  };

  // Handle save URL - opens dialog
  const handleSaveUrl = () => {
    if (!value || !onSaveUrl || !isValidUrl(value)) return;
    setShowSaveDialog(true);
  };

  // Handle actual save from dialog
  const handleDialogSave = async (data: RPCUrlFormData) => {
    if (!onSaveUrl) return;
    await onSaveUrl(data);
    toast.success("RPC URL saved successfully!");
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setFilterText(inputValue);
    onChange(inputValue);
    setIsOpen(true);
  };

  // Handle RPC selection
  const handleRpcSelect = (rpc: RPCUrl) => {
    onChange(rpc.rpcUrl);
    setFilterText("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (rpcUrls.length > 0) {
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
  const shouldShowDropdown = isOpen && filteredRpcs.length > 0;

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
              placeholder={placeholder}
              value={value}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              className={`pr-8 ${error ? "border-red-500" : ""}`}
            />
            {rpcUrls.length > 0 && (
              <ChevronDown
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            )}
          </div>

          {/* Save Button for new URLs */}
          {isNewUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSaveUrl}
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
            {filteredRpcs.map((rpc) => (
              <div
                key={rpc.id}
                className="px-3 py-2 cursor-pointer hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                onClick={() => handleRpcSelect(rpc)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{rpc.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {rpc.type === "ExecutionLayer" ? "Execution" : "Beacon"}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-500 truncate">
                      {rpc.rpcUrl}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Helper text */}
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Globe className="w-3 h-3" />
        <span>
          {rpcUrls.length > 0
            ? `${rpcUrls.length} configured RPC${
                rpcUrls.length !== 1 ? "s" : ""
              } available • Type to filter or enter custom URL${
                allowSave && onSaveUrl ? " • Click Save to store new URLs" : ""
              }`
            : `Enter RPC URL manually${
                allowSave && onSaveUrl
                  ? " • New URLs can be saved for future use"
                  : ""
              }`}
        </span>
      </div>

      {/* Save RPC URL Dialog */}
      {showSaveDialog && (
        <SaveRpcUrlDialog
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSave={handleDialogSave}
          rpcUrl={value}
          rpcType={rpcType}
          network={network}
          defaultName={generateDefaultName(value)}
        />
      )}
    </div>
  );
}
