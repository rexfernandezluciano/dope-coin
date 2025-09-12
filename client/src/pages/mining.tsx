
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AuthService } from "@/lib/auth";
import { Pickaxe, Play, Square, Award, TrendingUp, Clock } from "lucide-react";

export default function Mining() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: miningStatus, isLoading } = useQuery({
    queryKey: ["/api/protected/mining/status"],
    refetchInterval: 5000,
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["/api/protected/dashboard"],
  });

  const startMining = useMutation({
    mutationFn: () => AuthService.authenticatedRequest("POST", "/api/protected/mining/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/mining/status"] });
      toast({
        title: "Mining started",
        description: "Your mining session has begun!",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to start mining",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stopMining = useMutation({
    mutationFn: () => AuthService.authenticatedRequest("POST", "/api/protected/mining/stop"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/mining/status"] });
      toast({
        title: "Mining stopped",
        description: "Your mining session has been stopped.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to stop mining",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const claimReward = useMutation({
    mutationFn: () => AuthService.authenticatedRequest("POST", "/api/protected/mining/claim"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      toast({
        title: "Reward claimed!",
        description: `You earned ${data.reward?.amount || 0} DOPE tokens!`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to claim reward",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="h-8 bg-muted rounded animate-pulse mb-4" />
              <div className="h-32 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isActive = miningStatus?.isActive || false;
  const progress = miningStatus?.progress || 0;
  const currentEarned = miningStatus?.currentEarned || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" data-testid="mining-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Mining Control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Pickaxe className="w-5 h-5 mr-2" />
              Mining Control
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-secondary to-accent p-1 mb-4">
                <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
                  <Pickaxe className={`w-16 h-16 ${isActive ? 'text-success animate-pulse' : 'text-muted-foreground'}`} />
                </div>
              </div>
              
              <Badge variant={isActive ? "default" : "secondary"} className="mb-4">
                {isActive ? "Mining Active" : "Mining Inactive"}
              </Badge>
              
              <div className="text-2xl font-bold text-success mb-2" data-testid="current-earned">
                {currentEarned.toFixed(4)} DOPE
              </div>
              <div className="text-sm text-muted-foreground">Current Session Earnings</div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => startMining.mutate()}
                disabled={isActive || startMining.isPending}
                className="w-full"
                data-testid="button-start-mining"
              >
                <Play className="w-4 h-4 mr-2" />
                {startMining.isPending ? "Starting..." : "Start"}
              </Button>
              
              <Button
                onClick={() => stopMining.mutate()}
                disabled={!isActive || stopMining.isPending}
                variant="outline"
                className="w-full"
                data-testid="button-stop-mining"
              >
                <Square className="w-4 h-4 mr-2" />
                {stopMining.isPending ? "Stopping..." : "Stop"}
              </Button>
            </div>

            <Button
              onClick={() => claimReward.mutate()}
              disabled={currentEarned === 0 || claimReward.isPending}
              className="w-full"
              data-testid="button-claim-reward"
            >
              <Award className="w-4 h-4 mr-2" />
              {claimReward.isPending ? "Claiming..." : "Claim Reward"}
            </Button>
          </CardContent>
        </Card>

        {/* Mining Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Mining Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg">
                <Clock className="w-6 h-6 text-secondary mx-auto mb-2" />
                <div className="text-lg font-bold text-secondary">
                  {dashboardData?.mining?.rate || "0.25"}
                </div>
                <div className="text-sm text-muted-foreground">DOPE/hour</div>
              </div>
              
              <div className="text-center p-4 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <Award className="w-6 h-6 text-accent mx-auto mb-2" />
                <div className="text-lg font-bold text-accent">
                  {parseFloat(dashboardData?.wallet?.dopeBalance || "0").toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">Total DOPE</div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Mining Level</span>
                <span className="text-sm font-medium">{dashboardData?.user?.level || 1}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Session Status</span>
                <Badge variant={isActive ? "default" : "secondary"}>
                  {isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Next Reward</span>
                <span className="text-sm font-medium">
                  {miningStatus?.nextReward ? `${miningStatus.nextReward}s` : "N/A"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Mining Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>How Mining Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                <Play className="w-6 h-6 text-primary" />
              </div>
              <h4 className="font-medium">Start Mining</h4>
              <p className="text-sm text-muted-foreground">Click start to begin your mining session</p>
            </div>
            
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-secondary" />
              </div>
              <h4 className="font-medium">Earn Rewards</h4>
              <p className="text-sm text-muted-foreground">Accumulate DOPE tokens over time</p>
            </div>
            
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mx-auto">
                <Award className="w-6 h-6 text-success" />
              </div>
              <h4 className="font-medium">Claim Tokens</h4>
              <p className="text-sm text-muted-foreground">Claim your earned tokens to your wallet</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
