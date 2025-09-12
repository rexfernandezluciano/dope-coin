import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { MiningInterface } from "@/components/mining-interface";
import { WalletCard } from "@/components/wallet-card";
import { ActivityFeed } from "@/components/activity-feed";
import { ProfileCard } from "@/components/profile-card";
import { NetworkStats } from "@/components/network-stats";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { UserPlus, History, Lock, HelpCircle } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["/api/protected/dashboard"],
    refetchInterval: 30000,
  });

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
                    Continue mining DOPE Coins on the Stellar network
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Mining Rate</div>
                  <div className="text-lg font-semibold text-success" data-testid="mining-rate">
                    {dashboardData?.mining?.rate || "0.25"} DOPE/hour
                  </div>
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
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-invite"
                >
                  <UserPlus className="w-6 h-6 text-secondary mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Invite</span>
                </Button>
                
                <Button
                  variant="outline"
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-history"
                >
                  <History className="w-6 h-6 text-accent mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">History</span>
                </Button>
                
                <Button
                  variant="outline"
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-security"
                >
                  <Lock className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Security</span>
                </Button>
                
                <Button
                  variant="outline"
                  className="p-4 h-auto flex flex-col items-center hover:bg-muted transition-colors group"
                  data-testid="action-support"
                >
                  <HelpCircle className="w-6 h-6 text-muted-foreground mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Support</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
