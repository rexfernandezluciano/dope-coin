
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AuthService } from "@/lib/auth";
import { Send, ArrowLeft, Copy } from "lucide-react";
import { useLocation } from "wouter";

export default function SendPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [sendForm, setSendForm] = useState({
    toAddress: "",
    amount: "",
    assetType: "DOPE" as "DOPE" | "XLM"
  });

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  });

  const sendTokens = useMutation({
    mutationFn: (data: typeof sendForm) => 
      AuthService.authenticatedRequest("POST", "/api/protected/wallet/send", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/transactions"] });
      setSendForm({ toAddress: "", amount: "", assetType: "DOPE" });
      toast({
        title: "Transaction sent",
        description: "Your transaction has been submitted successfully.",
      });
      // Navigate back to wallet after successful send
      setTimeout(() => navigate("/wallet"), 2000);
    },
    onError: (error) => {
      toast({
        title: "Transaction failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendForm.toAddress || !sendForm.amount) {
      toast({
        title: "Invalid input",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    const maxBalance = parseFloat(sendForm.assetType === "DOPE" ? 
      walletData?.dopeBalance || "0" : walletData?.xlmBalance || "0");
    
    if (parseFloat(sendForm.amount) > maxBalance) {
      toast({
        title: "Insufficient balance",
        description: `You don't have enough ${sendForm.assetType} tokens.`,
        variant: "destructive",
      });
      return;
    }

    sendTokens.mutate(sendForm);
  };

  const setMaxAmount = () => {
    const maxBalance = sendForm.assetType === "DOPE" ? 
      walletData?.dopeBalance || "0" : walletData?.xlmBalance || "0";
    setSendForm(prev => ({ ...prev, amount: parseFloat(maxBalance).toFixed(4) }));
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

        {/* Current Balance */}
        <Card>
          <CardHeader>
            <CardTitle>Available Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg">
                <div className="text-xl font-bold text-secondary">
                  {parseFloat(walletData?.dopeBalance || "0").toFixed(4)}
                </div>
                <div className="text-sm text-muted-foreground">DOPE</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <div className="text-xl font-bold text-accent">
                  {parseFloat(walletData?.xlmBalance || "0").toFixed(4)}
                </div>
                <div className="text-sm text-muted-foreground">XLM</div>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  onValueChange={(value: "DOPE" | "XLM") => 
                    setSendForm(prev => ({ ...prev, assetType: value, amount: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOPE">DOPE Coin</SelectItem>
                    <SelectItem value="XLM">Stellar Lumens (XLM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="toAddress">Recipient Address</Label>
                <div className="flex space-x-2">
                  <Input
                    id="toAddress"
                    placeholder="Enter recipient's Stellar address"
                    value={sendForm.toAddress}
                    onChange={(e) => setSendForm(prev => ({ ...prev, toAddress: e.target.value }))}
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
                        setSendForm(prev => ({ ...prev, toAddress: text }));
                        toast({ title: "Address pasted", description: "Recipient address has been pasted." });
                      } catch (err) {
                        toast({ 
                          title: "Paste failed", 
                          description: "Could not paste from clipboard.",
                          variant: "destructive"
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
                    Max: {parseFloat(sendForm.assetType === "DOPE" ? 
                      walletData?.dopeBalance || "0" : walletData?.xlmBalance || "0").toFixed(4)} {sendForm.assetType}
                  </Button>
                </div>
                <Input
                  id="amount"
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="0.0000"
                  value={sendForm.amount}
                  onChange={(e) => setSendForm(prev => ({ ...prev, amount: e.target.value }))}
                  data-testid="input-amount"
                />
              </div>

              <div className="pt-4">
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={sendTokens.isPending || !sendForm.toAddress || !sendForm.amount}
                  data-testid="button-send-transaction"
                >
                  {sendTokens.isPending ? "Sending..." : `Send ${sendForm.amount || "0"} ${sendForm.assetType}`}
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
              <p>Double-check the recipient address before sending. Transactions on the Stellar network are irreversible.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
