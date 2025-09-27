
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import { useToast } from "../hooks/use-toast.js";
import { AuthService } from "../lib/auth.js";
import { Send, ArrowLeft, Copy, Wallet, Unlock } from "lucide-react";
import { useLocation } from "wouter";
import { PinVerification } from "../components/pin-verification.js";
import { useAuth } from "../hooks/use-auth.js";
import { keyVault } from "../lib/keyVault.js";

export default function SendPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [showPinVerification, setShowPinVerification] = useState(false);
  const [walletUnlocked, setWalletUnlocked] = useState(false);
  const [sendForm, setSendForm] = useState({
    toAddress: "",
    amount: "",
    assetType: "DOPE",
  });

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  }) as any;

  const { data: userAssets } = useQuery({
    queryKey: ["/api/protected/asset/holders"],
    refetchInterval: 30000,
  }) as any;

  // Check wallet unlock status
  useEffect(() => {
    const checkWalletStatus = () => {
      const wallets = keyVault.getAllWallets();
      setWalletUnlocked(wallets.length > 0 && keyVault.isVaultUnlocked());
    };

    checkWalletStatus();
    const interval = setInterval(checkWalletStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const sendTokens = useMutation({
    mutationFn: (data: typeof sendForm & { pin: string }) =>
      AuthService.authenticatedRequest(
        "POST",
        "/api/protected/wallet/send",
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/protected/transactions"],
      });
      setSendForm({ toAddress: "", amount: "", assetType: "DOPE" });
      setShowPinVerification(false);
      toast({
        title: "Transaction sent",
        description: "Your transaction has been submitted successfully.",
      });
      setTimeout(() => navigate("/wallet"), 2000);
    },
    onError: (error) => {
      setShowPinVerification(false);
      toast({
        title: "Transaction failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!walletUnlocked) {
      toast({
        title: "Wallet Locked",
        description: "Please unlock your wallet first to send transactions.",
        variant: "destructive",
      });
      return;
    }

    if (!sendForm.toAddress || !sendForm.amount) {
      toast({
        title: "Invalid input",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    const selectedAsset = userAssets?.find((asset: any) => 
      asset.asset_code === sendForm.assetType || 
      (sendForm.assetType === "XLM" && asset.asset_type === "native")
    );

    const maxBalance = parseFloat(selectedAsset?.balance || "0");

    if (parseFloat(sendForm.amount) > maxBalance) {
      toast({
        title: "Insufficient balance",
        description: `You don't have enough ${sendForm.assetType} tokens.`,
        variant: "destructive",
      });
      return;
    }

    setShowPinVerification(true);
  };

  const handlePinVerified = async (pin: string) => {
    try {
      const wallets = keyVault.getAllWallets();
      if (wallets.length === 0) {
        throw new Error("No active wallets found. Please unlock your vault.");
      }

      const primaryWallet = wallets[0];
      
      await fetch("/api/protected/wallet/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          secretKey: primaryWallet.keypair.secret(),
          pin: pin
        })
      });

      sendTokens.mutate({ ...sendForm, pin });
    } catch (error) {
      console.error("Failed to establish wallet session:", error);
      setShowPinVerification(false);
      toast({
        title: "Session Error",
        description: "Failed to establish secure wallet session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePinCancel = () => {
    setShowPinVerification(false);
  };

  const setMaxAmount = () => {
    const selectedAsset = userAssets?.find((asset: any) => 
      asset.asset_code === sendForm.assetType || 
      (sendForm.assetType === "XLM" && asset.asset_type === "native")
    );
    
    const maxBalance = selectedAsset?.balance || "0";
    setSendForm((prev) => ({
      ...prev,
      amount: parseFloat(maxBalance).toFixed(4),
    }));
  };

  const unlockWallet = async () => {
    try {
      // Navigate to dashboard to unlock wallet
      navigate("/dashboard");
      toast({
        title: "Unlock Required",
        description: "Please unlock your wallet from the dashboard.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to navigate to wallet unlock",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <div className="h-8 bg-muted rounded animate-pulse mb-4" />
            <div className="h-64 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="send-page">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">Send Transaction</h1>
        </div>

        {/* Wallet Status */}
        {!walletUnlocked && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wallet className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    Wallet is locked. Please unlock to send transactions.
                  </span>
                </div>
                <Button size="sm" onClick={unlockWallet} className="bg-orange-500 hover:bg-orange-600">
                  <Unlock className="w-4 h-4 mr-2" />
                  Unlock Wallet
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Send Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Send className="w-5 h-5 mr-2" />
              Send Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type</Label>
                <Select
                  value={sendForm.assetType}
                  onValueChange={(value) =>
                    setSendForm((prev) => ({
                      ...prev,
                      assetType: value,
                      amount: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {userAssets?.map((asset: any) => (
                      <SelectItem 
                        key={asset.asset_type === "native" ? "XLM" : asset.asset_code} 
                        value={asset.asset_type === "native" ? "XLM" : asset.asset_code}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>
                            {asset.asset_type === "native" ? "XLM" : asset.asset_code}
                            {asset.asset_issuer && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({asset.asset_issuer.slice(0, 8)}...)
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground ml-4">
                            {parseFloat(asset.balance).toFixed(4)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select from your available assets
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="toAddress">Recipient Address</Label>
                <div className="flex space-x-2">
                  <Input
                    id="toAddress"
                    placeholder="Enter recipient's address"
                    value={sendForm.toAddress}
                    onChange={(e) =>
                      setSendForm((prev) => ({
                        ...prev,
                        toAddress: e.target.value,
                      }))
                    }
                    className="font-mono text-sm"
                    data-testid="input-to-address"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        setSendForm((prev) => ({ ...prev, toAddress: text }));
                        toast({
                          title: "Address pasted",
                          description: "Recipient address has been pasted.",
                        });
                      } catch (err) {
                        toast({
                          title: "Paste failed",
                          description: "Could not paste from clipboard.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a valid Stellar public key (starts with G...)
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount">Amount</Label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={setMaxAmount}
                    className="h-auto p-0 text-xs"
                  >
                    Max:{" "}
                    {(() => {
                      const selectedAsset = userAssets?.find((asset: any) => 
                        asset.asset_code === sendForm.assetType || 
                        (sendForm.assetType === "XLM" && asset.asset_type === "native")
                      );
                      return parseFloat(selectedAsset?.balance || "0").toFixed(4);
                    })()} {sendForm.assetType}
                  </Button>
                </div>
                <Input
                  id="amount"
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="0.0000"
                  value={sendForm.amount}
                  onChange={(e) =>
                    setSendForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  data-testid="input-amount"
                />
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    sendTokens.isPending ||
                    !sendForm.toAddress ||
                    !sendForm.amount ||
                    !walletUnlocked
                  }
                  data-testid="button-send-transaction"
                >
                  {sendTokens.isPending
                    ? "Sending..."
                    : !walletUnlocked
                    ? "Unlock Wallet to Send"
                    : `Send ${sendForm.amount || "0"} ${sendForm.assetType}`}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Security Note */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900">
          <CardContent className="p-4">
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">Security Reminder:</p>
              <p>
                Double-check the recipient address before sending. Transactions
                on the Stellar network are irreversible.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* PIN Verification Modal */}
        {showPinVerification && user && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center top z-50">
            <div className="bg-white rounded-0 max-w-md w-full h-full md:rounded-lg md:h-auto">
              <PinVerification
                walletId={localStorage.getItem(`walletId_${user.id}`) || ""}
                onVerified={handlePinVerified}
                onCancel={handlePinCancel}
                title="Authorize Transaction"
                description={`Enter your PIN to send ${sendForm.amount} ${sendForm.assetType} to the recipient.`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
