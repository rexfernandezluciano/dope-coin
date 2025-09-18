import React from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { AlertTriangle, Shield, Loader2 } from "lucide-react";
import { useToast } from "../hooks/use-toast.js";
import { apiRequest, queryClient } from "../lib/queryClient.js";

interface TrustAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void; // Callback to retry the original operation
  asset: {
    code: string;
    issuer: string;
    domain?: string;
  } | null;
}

export function TrustAssetModal({ isOpen, onClose, onSuccess, asset }: TrustAssetModalProps) {
  const { toast } = useToast();

  const trustAssetMutation = useMutation({
    mutationFn: async (data: { assetCode: string; assetIssuer: string }) => {
      const response = await apiRequest("POST", "/api/protected/asset/trust", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Asset Trusted Successfully",
        description: `You can now trade ${asset?.code}`,
      });
      // Invalidate wallet data to reflect the new trustline
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      onClose();
      // Call the success callback to retry the original operation
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Trust Asset",
        description: error.message || "Unable to establish trustline",
        variant: "destructive",
      });
    },
  });

  const handleTrustAsset = () => {
    if (!asset) return;

    trustAssetMutation.mutate({
      assetCode: asset.code,
      assetIssuer: asset.issuer,
    });
  };

  const handleCancel = () => {
    onClose();
  };

  if (!asset) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md h-full md:h-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            Trust Asset Required
          </DialogTitle>
          <DialogDescription className="space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
              <span>
                You need to establish a trustline for this asset before you can trade it.
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Asset Code:</span>
              <Badge variant="secondary">{asset.code}</Badge>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">Issuer:</span>
              <span className="text-xs font-mono text-muted-foreground break-all">
                {asset.issuer}
              </span>
            </div>
            {asset.domain && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Domain:</span>
                <span className="text-sm text-muted-foreground">{asset.domain}</span>
              </div>
            )}
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">What is a trustline?</p>
                <p className="text-xs">
                  A trustline allows you to hold and trade this asset. It's a one-time setup that
                  tells the Stellar network you trust this asset issuer.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={handleCancel}
            disabled={trustAssetMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleTrustAsset}
            disabled={trustAssetMutation.isPending}
            className="min-w-24"
          >
            {trustAssetMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {trustAssetMutation.isPending ? "Trusting..." : "Trust Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}