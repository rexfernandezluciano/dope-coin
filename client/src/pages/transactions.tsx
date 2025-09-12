
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthService } from "@/lib/auth";
import { History, ArrowUpRight, ArrowDownLeft, Copy, ChevronLeft, ChevronRight } from "lucide-react";

export default function Transactions() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/protected/transactions", { page, limit }],
    queryFn: () => AuthService.authenticatedRequest("GET", `/api/protected/transactions?page=${page}&limit=${limit}`),
  });

  const getTransactionIcon = (tx: any) => {
    if (tx.type === "transfer") {
      return tx.toAddress ? (
        <ArrowUpRight className="w-4 h-4 text-destructive" />
      ) : (
        <ArrowDownLeft className="w-4 h-4 text-success" />
      );
    }
    return <Copy className="w-4 h-4 text-primary" />;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
        return "success";
      case "pending":
        return "secondary";
      case "failed":
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" data-testid="transactions-page">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="w-5 h-5 mr-2" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <>
              <div className="space-y-3 mb-6">
                {transactions.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-background rounded-full">
                        {getTransactionIcon(tx)}
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {tx.type === "transfer" ? (
                            tx.toAddress ? "Sent to" : "Received from"
                          ) : (
                            tx.type.charAt(0).toUpperCase() + tx.type.slice(1)
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString()}
                        </div>
                        {tx.stellarTxHash && (
                          <div className="text-xs text-muted-foreground font-mono">
                            TX: {tx.stellarTxHash.slice(0, 16)}...
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right space-y-1">
                      <div className="font-medium">
                        {tx.type === "transfer" && tx.toAddress ? "-" : "+"}
                        {parseFloat(tx.amount).toFixed(4)} {tx.assetType}
                      </div>
                      <Badge variant={getStatusColor(tx.status)}>
                        {tx.status}
                      </Badge>
                      {(tx.toAddress || tx.fromAddress) && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {(tx.toAddress || tx.fromAddress)?.slice(0, 8)}...
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                
                <span className="text-sm text-muted-foreground" data-testid="page-info">
                  Page {page}
                </span>
                
                <Button
                  variant="outline"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!transactions || transactions.length < limit}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">No transactions yet</h3>
              <p className="text-sm text-muted-foreground">
                Your transaction history will appear here once you start mining or trading.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
