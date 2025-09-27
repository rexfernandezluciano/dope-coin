
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Key, Loader2 } from "lucide-react";
import { keyVault } from "../lib/keyVault.js";
import { useAuth } from "../hooks/use-auth.js";
import { useToast } from "../hooks/use-toast.js";

interface WalletUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked?: () => void;
}

export function WalletUnlockDialog({ open, onOpenChange, onUnlocked }: WalletUnlockDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    if (!password || !user) return;

    setIsUnlocking(true);
    try {
      const userVaultId = localStorage.getItem(`vaultId_${user.id}`);
      if (!userVaultId) {
        throw new Error("No vault found. Please create a wallet first.");
      }

      await keyVault.unlockVault(userVaultId, password);
      
      const wallets = keyVault.getAllWallets();
      if (wallets.length === 0) {
        throw new Error("No wallets found in vault.");
      }

      toast({
        title: "Wallet Unlocked",
        description: "Your wallet has been successfully unlocked.",
      });

      setPassword("");
      onOpenChange(false);
      onUnlocked?.();
    } catch (error: any) {
      console.error("Failed to unlock wallet:", error);
      toast({
        title: "Unlock Failed",
        description: error.message || "Failed to unlock wallet. Please check your password.",
        variant: "destructive",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Unlock Your Secure Wallet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter your master password to unlock your secure wallet and access DOPE features.
          </p>
          <div>
            <Label htmlFor="unlock-password">Master Password</Label>
            <Input
              id="unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your master password"
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isUnlocking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnlock}
              disabled={!password || isUnlocking}
              className="flex-1"
            >
              {isUnlocking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Unlocking...
                </>
              ) : (
                "Unlock"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
