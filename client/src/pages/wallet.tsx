
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AuthService } from "@/lib/auth";
import { Wallet, Send, ArrowUpRight, ArrowDownLeft, Copy } from "lucide-react";

export default function WalletPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sendForm, setSendForm] = useState({
    toAddress: "",
    amount: "",
    assetType: "DOPE" as "DOPE" | "XLM"
  });

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  });

  const { data: transactions } = useQuery({
    queryKey: ["/api/protected/transactions"],
    queryFn: () => AuthService.authenticatedRequest("GET", "/api/protected/transactions?limit=5"),
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
    sendTokens.mutate(sendForm);
  };

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
    <div className="max-w-4xl mx-auto px-4 py-8" data-testid="wallet-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Wallet Balance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Wallet className="w-5 h-5 mr-2" />
              Wallet Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg">
                <div className="text-2xl font-bold text-secondary" data-testid="dope-balance">
                  {parseFloat(walletData?.dopeBalance || "0").toFixed(4)}
                </div>
                <div className="text-sm text-muted-foreground">DOPE</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <div className="text-2xl font-bold text-accent" data-testid="xlm-balance">
                  {parseFloat(walletData?.xlmBalance || "0").toFixed(4)}
                </div>
                <div className="text-sm text-muted-foreground">XLM</div>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground text-center">
              Last updated: {walletData?.lastUpdated ? new Date(walletData.lastUpdated).toLocaleString() : "Never"}
            </div>
          </CardContent>
        </Card>

        {/* Send Tokens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Send className="w-5 h-5 mr-2" />
              Send Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type</Label>
                <Select 
                  value={sendForm.assetType} 
                  onValueChange={(value: "DOPE" | "XLM") => 
                    setSendForm(prev => ({ ...prev, assetType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOPE">DOPE</SelectItem>
                    <SelectItem value="XLM">XLM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="toAddress">Recipient Address</Label>
                <Input
                  id="toAddress"
                  placeholder="Enter recipient address"
                  value={sendForm.toAddress}
                  onChange={(e) => setSendForm(prev => ({ ...prev, toAddress: e.target.value }))}
                  data-testid="input-to-address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.0001"
                  placeholder="0.0000"
                  value={sendForm.amount}
                  onChange={(e) => setSendForm(prev => ({ ...prev, amount: e.target.value }))}
                  data-testid="input-amount"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={sendTokens.isPending}
                data-testid="button-send"
              >
                {sendTokens.isPending ? "Sending..." : "Send Transaction"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.slice(0, 5).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-background rounded-full">
                        {tx.type === "transfer" ? (
                          tx.toAddress ? <ArrowUpRight className="w-4 h-4 text-destructive" /> : <ArrowDownLeft className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium">
                          {tx.type === "transfer" ? (tx.toAddress ? "Sent" : "Received") : tx.type}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {tx.type === "transfer" && tx.toAddress ? "-" : "+"}{parseFloat(tx.amount).toFixed(4)} {tx.assetType}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {tx.status}
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
      </div>
    </div>
  );
}
