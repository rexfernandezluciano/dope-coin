import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { AuthService } from "../lib/auth.js";
import { Wallet, Send, BarChart3, Lock, Unlock, TrendingUp,
  TrendingDown, Shield, Key } from "lucide-react";
import {
  getActivityLabel,
  getActivityIcon,
  getStatusColor,
} from "../utils/activity-utils.js";
import { formatTimeAgo } from "../utils/format-utils.js";
import { useAuth } from "../hooks/use-auth.js";
import { useWallet } from "../hooks/use-wallet.js";
import { WalletSetup } from "../components/wallet-setup.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { toast } from "../components/ui/use-toast.js";

export default function WalletPage() {
  const { user, checkWalletMigrationStatus, hasSecureWallet } = useAuth();
  const { isInitialized, isLocked, unlockWallet, setIsVaultLocked } = useWallet();
  const queryClient = useQueryClient();
  const [showWalletSetup, setShowWalletSetup] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  }) as any;

  const { data: marketValue, isLoading: isMarketValueLoading } = useQuery({
    queryKey: ["/api/protected/trade/values"]
  }) as any;

  const { data: transactions } = useQuery({
    queryKey: ["/api/protected/transactions"],
    queryFn: () =>
      AuthService.authenticatedRequest(
        "GET",
        "/api/protected/transactions?limit=5",
      ),
  }) as any;

  const { data: assets, isLoading: isAssetsLoading } = useQuery({
    queryKey: ["/api/protected/asset/holders"], 
    queryFn: () => AuthService.authenticatedRequest("GET", "/api/protected/asset/holders")
  }) as any;

  const [, navigate] = useLocation();

  useEffect(() => {
    const checkWalletStatus = async () => {
      if (!user) return;

      // Check if user needs migration
      const migrationNeeded = await checkWalletMigrationStatus();
      setNeedsMigration(migrationNeeded);

      // If user has secure wallet setup but it's locked
      if (hasSecureWallet && isLocked) {
        setShowUnlockDialog(true);
      } 
      // If user needs migration (has old wallet but no secure wallet)
      else if (migrationNeeded) {
        setShowMigrationDialog(true);
      } 
      // Only show wallet setup for completely new users (no wallet at all)
      else if (!hasSecureWallet && !user.walletAddress) {
        setShowWalletSetup(true);
      }
    };

    if (isInitialized) {
      checkWalletStatus();
    }
  }, [user, isInitialized, hasSecureWallet, isLocked, checkWalletMigrationStatus]);

  const handleUnlockWallet = async () => {
    if (!unlockPassword) {
      toast({
        title: "Password required",
        description: "Please enter your master password.",
        variant: "destructive",
      });
      return;
    }

    setIsUnlocking(true);
    try {
      const vaults = await keyVault.getAllVaults();
      if (vaults.length === 0) {
        throw new Error("No vaults found. Please create a wallet first.");
      }

      // Try to unlock the user's specific vault first
      const userVaultId = localStorage.getItem(`vaultId_${user?.id}`);
      let vaultToUnlock = vaults[0]; // Default to first vault

      if (userVaultId) {
        const userVault = vaults.find(v => v.id === userVaultId);
        if (userVault) {
          vaultToUnlock = userVault;
        }
      }

      console.log("Attempting to unlock vault:", vaultToUnlock.id);
      await keyVault.unlockVault(vaultToUnlock.id, unlockPassword);

      // Verify the vault is actually unlocked
      if (!keyVault.isVaultUnlocked()) {
        throw new Error("Vault unlock verification failed");
      }

      setShowUnlockDialog(false);
      setUnlockPassword("");
      setIsVaultLocked(false);

      toast({
        title: "Wallet unlocked",
        description: "Your secure wallet has been unlocked successfully.",
      });

      // Trigger a refresh of wallet data
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
    } catch (error) {
      console.error("Unlock error:", error);
      toast({
        title: "Unlock failed",
        description: error instanceof Error ? error.message : "Invalid password or corrupted wallet. Please check your password and try again.",
        variant: "destructive",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleWalletSetupComplete = (vaultId: string) => {
    localStorage.setItem(`vaultId_${user?.id}`, vaultId);
    localStorage.setItem(`secureWallet_${user?.id}`, "true");
    setShowWalletSetup(false);
  };

  const actionButtons = [
    {
      key: "send",
      label: "Send",
      icon: (
        <Send className="w-6 h-6 group-hover:scale-110 transition-transform" />
      ),
      href: "/send",
    },
    {
      key: "trade",
      label: "Trade",
      icon: (
        <BarChart3 className="w-6 h-6 group-hover:scale-110 transition-transform" />
      ),
      href: "/trading",
    },
    {
      key: "withdraw",
      label: "Withdraw",
      icon: (
        <Unlock className="w-6 h-6 group-hover:scale-110 transition-transform" />
      ),
      href: "/withdraw",
    },
    {
      key: "stake",
      label: "Stake",
      icon: (
        <Lock className="w-6 h-6 group-hover:scale-110 transition-transform" />
      ),
      href: "/staking",
    },
  ];

  // Show wallet setup for new users
  if (showWalletSetup) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">Secure Wallet Setup</h1>
          <p className="text-muted-foreground">
            Set up your secure wallet with PIN protection for DOPE transactions
          </p>
        </div>
        <WalletSetup onComplete={handleWalletSetupComplete} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="h-8 bg-muted rounded animate-pulse mb-4" />
              <div className="h-24 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-8" data-testid="wallet-page">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Wallet Balance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Available Balance <Wallet className="w-5 h-5 mr-2" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex items-center text-3xl font-bold">
                  {parseFloat(walletData?.dopeBalance || "0").toFixed(4)}
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground text-sm">DOPE Coin</div>
                  <span className="space-x-2">≈</span>
                  {isMarketValueLoading ? (
                    <div className="h-4 bg-muted rounded animate-pulse" />
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      {marketValue?.selling_price ? parseFloat(marketValue?.selling_price).toFixed(2) : "0.00"} XLM
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {actionButtons?.map((button) => (
                  <Button 
                    key={button.key} 
                    className="flex items-center justify-around space-y-2 text-white hover:bg-muted hover:text-primary" 
                    onClick={() => navigate(button.href)}
                  >
                    {button.icon}
                    {button.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="assets" className="w-full mb-3">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="assets" data-testid="tab-assets">
                Assets
              </TabsTrigger>
              <TabsTrigger value="transactions" data-testid="tab-transactions">
                Transactions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assets" className="space-y-6">
              {/* Assets */}
              <Card>
                <CardHeader>
                  <CardTitle>My Assets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {isAssetsLoading ? (
                      <div>
                        <div className="h-8 bg-muted rounded animate-pulse mb-4" />
                      </div>
                    ) : assets && assets?.length > 0 ? (
                      assets.map((asset: any, index: number) => (
                        <div key={index}>
                          <div className="flex justify-between items-center w-full py-4">
                            <div>
                              <div className="text-xl font-bold text-primary">
                                {parseFloat(asset.balance).toFixed(4)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {asset?.asset_code || (asset.asset_type === "native" && "XLM")}
                              </div>
                            </div>
                            <div>
                              <div className="">
                                <div className="flex text-sm font-bold text-success gap-1">
                                  <TrendingDown className="text-success" />
                                  ${parseFloat(asset?.buying_liabilities || "0").toFixed(4)}
                                </div>
                                <div className="flex text-red-500 gap-1 text-sm">
                                  <TrendingUp className="text-red-500" />
                                  ${parseFloat(asset?.selling_liabilities || "0").toFixed(4)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No assets yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-6">
              {/* Recent Transactions */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {transactions && transactions.length > 0 ? (
                    <div className="space-y-3">
                      {transactions.slice(0, 5).map((tx: any) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-background rounded-full">
                              {getActivityIcon(tx.type)}
                            </div>
                            <div>
                              <div className="font-medium">
                                {getActivityLabel(tx.type)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatTimeAgo(tx.createdAt)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={parseFloat(tx.amount).toFixed(0).length > 4 ? "truncate w-20" : "font-medium"}>
                              {tx.type === "transfer" && tx.toAddress ? "-" : "+"}
                              {parseFloat(tx.amount).toFixed(4)} {tx.assetType}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <Badge variant={getStatusColor(tx.status)}>
                                {tx.status.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No transactions yet
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Unlock Wallet Dialog */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Unlock Your Secure Wallet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your master password to unlock your secure wallet.
            </p>
            <div>
              <Label htmlFor="password">Master Password</Label>
              <Input
                id="password"
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Enter your master password"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowUnlockDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUnlockWallet}
                disabled={!unlockPassword || isUnlocking}
                className="flex-1"
              >
                {isUnlocking ? "Unlocking..." : "Unlock"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Migration Dialog */}
      <Dialog open={showMigrationDialog} onOpenChange={setShowMigrationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Secure Wallet Upgrade Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your existing wallet (public key: {user?.walletAddress?.substring(0, 10)}...) needs to be upgraded to our new secure system.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800">
                <strong>What happens:</strong>
                <ul className="mt-2 space-y-1">
                  <li>• Your existing balance stays safe</li>
                  <li>• Create new secure credentials</li>
                  <li>• Enable PIN-protected transactions</li>
                  <li>• Get secure backup seed phrase</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowMigrationDialog(false)}
                className="flex-1"
              >
                Later
              </Button>
              <Button
                onClick={() => {
                  setShowMigrationDialog(false);
                  setShowWalletSetup(true);
                }}
                className="flex-1"
              >
                Upgrade Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}