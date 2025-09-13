import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { AuthService } from "@/lib/auth.js";
import { useToast } from "@/hooks/use-toast.js";
import { Pickaxe, Play, Pause } from "lucide-react";
import { formatTime } from "../utils/format-utils.js";

export function MiningInterface() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [timeToNextReward, setTimeToNextReward] = useState(0);

  const { data: miningStatus, isLoading } = useQuery({
    queryKey: ["/api/protected/mining/status"],
    refetchInterval: 5000, // Update every 5 seconds
  }) as any;

  const startMining = useMutation({
    mutationFn: () => AuthService.authenticatedRequest("POST", "/api/protected/mining/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/mining/status"] });
      toast({
        title: "Mining started",
        description: "You've started mining DOPE Coins!",
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
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      toast({
        title: "Mining stopped",
        description: "Your mining rewards have been added to your wallet!",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      toast({
        title: "Reward claimed",
        description: "Mining rewards have been added to your account!",
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

  useEffect(() => {
    if (miningStatus?.nextReward) {
      setTimeToNextReward(miningStatus.nextReward);
    }
  }, [miningStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeToNextReward(prev => Math.max(0, prev - 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  

  if (isLoading) {
    return (
      <Card data-testid="mining-interface-loading">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="w-32 h-32 mx-auto rounded-full bg-muted animate-pulse mb-6" />
            <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="mining-interface">
      <CardContent className="p-6">
        <div className="text-center mb-8">
          <div 
            className={`w-32 h-32 mx-auto rounded-full gradient-bg flex items-center justify-center mb-6 ${
              miningStatus?.isActive ? 'mining-pulse' : ''
            }`}
            data-testid="mining-indicator"
          >
            <Pickaxe className="text-white text-3xl" />
          </div>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2" data-testid="mining-status">
              Mining Status: <span className={miningStatus?.isActive ? "text-success" : "text-muted-foreground"}>
                {miningStatus?.isActive ? "Active" : "Inactive"}
              </span>
            </h2>
            {miningStatus?.isActive && (
              <p className="text-muted-foreground" data-testid="mining-rate">
                Mining at {miningStatus.rate} DOPE/hour
              </p>
            )}
          </div>
          
          {miningStatus?.isActive && (
            <>
              <div className="w-full bg-muted rounded-full h-3 mb-4">
                <div 
                  className="progress-bar h-3 rounded-full transition-all duration-500" 
                  style={{ width: `${miningStatus.progress}%` }}
                  data-testid="mining-progress"
                />
              </div>
              <div className="text-sm text-muted-foreground mb-6" data-testid="next-reward-time">
                Next reward in {formatTime(timeToNextReward)}
              </div>
            </>
          )}
          
          <div className="flex gap-3 justify-center">
            {!miningStatus?.isActive ? (
              <Button
                onClick={() => startMining.mutate()}
                disabled={startMining.isPending}
                className="gradient-bg hover:opacity-90 text-white"
                data-testid="button-start-mining"
              >
                <Play className="w-4 h-4 mr-2" />
                {startMining.isPending ? "Starting..." : "Start Mining"}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => stopMining.mutate()}
                  disabled={stopMining.isPending}
                  variant="outline"
                  data-testid="button-stop-mining"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {stopMining.isPending ? "Stopping..." : "Stop Mining"}
                </Button>
                <Button
                  onClick={() => claimReward.mutate()}
                  disabled={claimReward.isPending || timeToNextReward > 0}
                  className="gradient-bg hover:opacity-90 text-white"
                  data-testid="button-claim-reward"
                >
                  {claimReward.isPending ? "Claiming..." : "Claim Reward"}
                </Button>
              </>
            )}
          </div>
        </div>
        
        {miningStatus?.isActive && (
          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-border">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground" data-testid="current-earned">
                {parseFloat(miningStatus.currentEarned || "0").toFixed(4)}
              </div>
              <div className="text-sm text-muted-foreground">DOPE earned this session</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground" data-testid="session-progress">
                {miningStatus.progress}%
              </div>
              <div className="text-sm text-muted-foreground">Session progress</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
