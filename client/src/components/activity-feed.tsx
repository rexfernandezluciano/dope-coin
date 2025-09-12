import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUp, UserPlus } from "lucide-react";

export function ActivityFeed() {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/protected/transactions"],
    queryParam: { limit: 5 },
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "mining_reward":
        return <Plus className="text-success text-sm" />;
      case "send":
      case "receive":
        return <ArrowUp className="text-accent text-sm" />;
      case "referral_bonus":
        return <UserPlus className="text-secondary text-sm" />;
      default:
        return <Plus className="text-success text-sm" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case "mining_reward":
        return "Mining Reward";
      case "send":
        return "Sent Tokens";
      case "receive":
        return "Received Tokens";
      case "referral_bonus":
        return "Referral Bonus";
      default:
        return "Transaction";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return "Less than an hour ago";
    }
  };

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
