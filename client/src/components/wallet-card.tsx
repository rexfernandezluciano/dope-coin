import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Wallet, Send, QrCode } from "lucide-react";
import { useLocation } from "wouter";

export function WalletCard() {
  const { data: wallet, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000, // Update every 30 seconds
  }) as any;

  const navigate = useLocation()[1];

  if (isLoading) {
    return (
      <Card data-testid="wallet-card-loading">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Wallet Balance</span>
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const dopeBalance = parseFloat(wallet?.dopeBalance || "0");
  const xlmBalance = parseFloat(wallet?.xlmBalance || "0");
  const usdValue = (dopeBalance * 0.1 + xlmBalance * 0.006).toFixed(2);

  return (
    <Card data-testid="wallet-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Wallet Balance</span>
          <Wallet className="h-5 w-5 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div
              className="text-3xl font-bold text-foreground"
              data-testid="dope-balance"
            >
              {dopeBalance.toFixed(4)}
            </div>
            <div className="text-sm text-muted-foreground">DOPE Coins</div>
          </div>

          <div className="pt-4 border-t border-border">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">XLM Balance</span>
              <span className="font-medium" data-testid="xlm-balance">
                {xlmBalance.toFixed(4)} XLM
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">USD Value</span>
              <span className="font-medium" data-testid="usd-value">
                ${usdValue}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4">
            <Button
              className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              size="sm"
              data-testid="button-send"
              onClick={() => navigate("/send")}
            >
              <Send className="w-4 h-4 mr-1" />
              Send
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-receive"
              onClick={() => navigate("/receive")}
            >
              <QrCode className="w-4 h-4 mr-1" />
              Receive
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
