import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Network } from "lucide-react";
import { formatNumber, formatTimeAgo } from "../utils/format-utils.js";

export function NetworkStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/network/stats"],
    refetchInterval: 60000, // Update every minute
  }) as any;

  if (isLoading) {
    return (
      <Card data-testid="network-stats-loading">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Network className="w-5 h-5 text-accent mr-2" />
            Network Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-muted rounded w-1/4 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="network-stats">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Network className="w-5 h-5 text-accent mr-2" />
          Network Stats
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Active Miners</span>
            <span
              className="font-medium text-foreground"
              data-testid="active-miners"
            >
              {formatNumber(stats?.activeMiners || 0)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Supply</span>
            <span
              className="font-medium text-foreground"
              data-testid="total-supply"
            >
              {formatNumber(parseFloat(stats?.totalSupply || "0"))}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stellar Network</span>
            <span
              className="font-medium text-success flex items-center"
              data-testid="network-status"
            >
              <div className="w-2 h-2 bg-success rounded-full mr-1"></div>
              Online
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last Update</span>
            <span
              className="font-medium text-foreground"
              data-testid="last-update"
            >
              {formatTimeAgo(stats?.updatedAt)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
