import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  TrendingDown } from "lucide-react";
import {
  getActivityLabel,
  getActivityIcon,
  getStatusColor,
} from "../utils/activity-utils.js";
import { formatTimeAgo } from "../utils/format-utils.js";

export default function WalletPage() {
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

  const { data: assets, isLoading: isAssetsLoading } = useQuery({queryKey: ["/api/protected/asset/holders"], queryFn: () => AuthService.authenticatedRequest("GET", "/api/protected/asset/holders")}) as any;

  const [, navigate] = useLocation();

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
            <CardTitle className="flex justify-between items-center">
              Available Balance <Wallet className="w-5 h-5 mr-2" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center text-3xl font-bold">{parseFloat(walletData?.dopeBalance).toFixed(4)}</div>
              <div className="flex gap-2">
                <div className="text-muted-foreground text-sm">DOPE Coin</div>
                <span className="space-x-2">≈</span>
                {isMarketValueLoading ? <div className="h-4 bg-muted rounded animate-pulse" /> : <div className="text-muted-foreground text-sm text-sm">{marketValue?.selling_price ? parseFloat(marketValue?.selling_price).toFixed(2) : "0.00"} XLM</div>}
              </div>
            </div>
            

            <div className="text-xs text-muted-foreground">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {actionButtons?.map((button) => <Button key={button.key} className="flex items-center justify-around space-y-2 text-white hover:bg-muted hover:text-primary" onClick={() => navigate(button.href)}>
                {button.icon}
                {button.label}
              </Button>)}
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
                  {isAssetsLoading  ? <div>
                    <div className="h-8 bg-muted rounded animate-pulse mb-4" />
                  </div> : assets && assets?.map((asset: any) => {
                    return (
                      <div key={asset?.asset_code || asset.asset_type === "native" && "XLM"}>
                        <div className="flex justify-between items-center w-full py-4">
                          <div>
                            <div className="text-xl font-bold text-primary">
                              {parseFloat(asset.balance).toFixed(4)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {asset?.asset_code || asset.asset_type === "native" && "XLM"}
                            </div>
                          </div>
                          <div>
                            <div className="">
                              <div className="flex text-sm font-bold text-success gap-1"><TrendingDown className="text-success" />${parseFloat(asset?.buying_liabilities).toFixed(4)}</div>
                              <div className="flex text-red-500 gap-1 text-sm"><TrendingUp className="text-red-500" />${parseFloat(asset?.selling_liabilities).toFixed(4)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }) || (<div className="text-center py-8 text-muted-foreground">
                    No assets yet
                  </div>)}
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
  );
}
