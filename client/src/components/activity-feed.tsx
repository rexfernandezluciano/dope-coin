import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { formatTimeAgo } from "../utils/format-utils.js";
import { getActivityIcon, getActivityLabel } from "../utils/activity-utils.js";";

export function ActivityFeed() {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/protected/transactions"],
    queryParam: { limit: 5 },
  }) as any;

  if (isLoading) {
    return (
      <Card data-testid="activity-feed-loading">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-3">
                <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                </div>
                <div className="h-4 bg-muted rounded w-16 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="activity-feed">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {transactions && transactions.length > 0 ? (
            transactions.map((transaction: any) => (
              <div 
                key={transaction.id} 
                className="flex items-center space-x-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                data-testid={`activity-item-${transaction.id}`}
              >
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  {getActivityIcon(transaction.type)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground" data-testid="activity-type">
                    {getActivityLabel(transaction.type)}
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid="activity-time">
                    {formatTimeAgo(transaction.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div 
                    className={`font-semibold ${
                      transaction.type === 'send' ? 'text-destructive' : 'text-success'
                    }`}
                    data-testid="activity-amount"
                  >
                    {transaction.type === 'send' ? '-' : '+'}
                    {parseFloat(transaction.amount).toFixed(4)} DOPE
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <div className="text-muted-foreground mb-2">No recent activity</div>
              <div className="text-sm text-muted-foreground">
                Start mining to see your first transaction!
              </div>
            </div>
          )}
        </div>
        
        {transactions && transactions.length > 0 && (
          <Button 
            variant="ghost" 
            className="w-full mt-4 text-accent hover:text-accent/80"
            data-testid="button-view-all"
          >
            View All Activity
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
