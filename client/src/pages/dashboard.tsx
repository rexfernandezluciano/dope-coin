import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "../components/ui/card.js";
import { MiningInterface } from "../components/mining-interface.js";
import { WalletCard } from "../components/wallet-card.js";
import { ActivityFeed } from "../components/activity-feed.js";
import { ProfileCard } from "../components/profile-card.js";
import { NetworkStats } from "../components/network-stats.js";
import { useAuth } from "../hooks/use-auth.js";
import { Button } from "../components/ui/button.js";
import { History, HelpCircle, BarChart3, Gift } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { isLoading } = useQuery({
    queryKey: ["/api/protected/dashboard"],
    refetchInterval: 30000,
  }) as any;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="h-8 bg-muted rounded animate-pulse mb-4" />
                <div className="h-32 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="h-8 bg-muted rounded animate-pulse mb-4" />
                <div className="h-24 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="dashboard-page">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Main Mining Interface */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Welcome Section */}
          <Card data-testid="welcome-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-foreground" data-testid="welcome-message">
                    Welcome back, {user?.fullName?.split(' ')[0] || 'User'}!
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Continue mining DOPE Coin on the Stellar network.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mining Interface */}
          <MiningInterface />

          {/* Recent Activity */}
          <ActivityFeed />
        </div>

        {/* Right Column: Sidebar */}
        <div className="space-y-6">
          
          {/* Wallet Balance */}
          <WalletCard />

          {/* User Profile Card */}
          <ProfileCard />

          {/* Network Stats */}
          <NetworkStats />

          {/* Quick Actions */}
          <Card data-testid="quick-actions">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline"
                  onClick={() => navigate("/trading")}
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-trading"
                >
                  <BarChart3 className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Trading</span>
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate("/transactions")}
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-history"
                >
                  <History className="w-6 h-6 text-accent mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">History</span>
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => navigate("/referrals")}
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-invite"
                >
                  <Gift className="w-6 h-6 text-secondary mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Earn</span>
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate("/help")}
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-help"
                >
                  <HelpCircle className="w-6 h-6 text-info mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Help</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
