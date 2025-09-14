
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Badge } from "../components/ui/badge.js";
import { useToast } from "../hooks/use-toast.js";
import { AuthService } from "../lib/auth.js";
import { Wallet } from "lucide-react";
import { getActivityLabel, getActivityIcon, getStatusColor } from "../utils/activity-utils.js";

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
  }) as any;

  const { data: transactions } = useQuery({
    queryKey: ["/api/protected/transactions"],
    queryFn: () => AuthService.authenticatedRequest("GET", "/api/protected/transactions?limit=5"),
  }) as any;

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
                <div className="text-xl font-bold text-secondary" data-testid="dope-balance">
                  {parseFloat(walletData?.dopeBalance || "0").toFixed(4)}
                </div>
                <div className="text-sm text-muted-foreground">DOPE</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <div className="text-xl font-bold text-accent" data-testid="xlm-balance">
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
                        {getActivityIcon(tx.type)}
                      </div>
                      <div>
                        <div className="font-medium">
                          {getActivityLabel(tx.type)}
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
      </div>
    </div>
  );
}
