

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Progress } from "../components/ui/progress.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { useToast } from "../hooks/use-toast.js";
import { AuthService } from "../lib/auth.js";
import { useAuth } from "../hooks/use-auth.js";
import { keyVault } from "../lib/keyVault.js";
import { WalletUnlockDialog } from "../components/wallet-unlock-dialog.js";
import { PinDialog } from "../components/pin-dialog.js";
import { 
  Gamepad2, 
  Trophy, 
  Coins, 
  Zap, 
  Target, 
  Crown,
  Star,
  Gift,
  Timer,
  Users,
  RefreshCw,
  MousePointer2,
  ArrowLeft,
  RotateCcw,
  Wallet,
  TrendingUp,
  Play,
  Pause,
  Loader2
} from "lucide-react";

export default function EarnPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Navigation
  const [currentTab, setCurrentTab] = useState("hamster");
  
  // Game states
  const [tapCount, setTapCount] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [dogeClicks, setDogeClicks] = useState(0);
  const [pepeClicks, setPepeClicks] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentScore, setCurrentScore] = useState(0);
  
  // Spin game states
  const [spinEnergy, setSpinEnergy] = useState(3);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastSpinReward, setLastSpinReward] = useState(0);
  const spinRef = useRef<HTMLDivElement>(null);
  
  // Hamster clicker states
  const [hamsterEnergy, setHamsterEnergy] = useState(1000);
  const [hamsterLevel, setHamsterLevel] = useState(1);
  const [profitPerHour, setProfitPerHour] = useState(0);
  const [coinsPerTap, setCoinsPerTap] = useState(1);
  const [totalCoins, setTotalCoins] = useState(0);
  
  // Animation states
  const [tapAnimation, setTapAnimation] = useState(false);
  const [floatingCoins, setFloatingCoins] = useState<Array<{id: number, x: number, y: number}>>([]);

  // Wallet states
  const [walletSessionActive, setWalletSessionActive] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [checkingWallet, setCheckingWallet] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pendingReward, setPendingReward] = useState<any>(null);

  const { data: gameStats, refetch: refetchGameStats } = useQuery({
    queryKey: ["/api/protected/games/stats"],
    refetchInterval: 30000,
  }) as any;

  const { data: leaderboard, refetch: refetchLeaderboard } = useQuery({
    queryKey: ["/api/protected/games/leaderboard"],
    refetchInterval: 60000,
  }) as any;

  const { data: userProfile } = useQuery({
    queryKey: ["/api/protected/profile"],
  }) as any;

  const { data: walletData } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  }) as any;

  const submitScore = useMutation({
    mutationFn: async (data: { gameType: string; score: number; dogeClicks: number; pepeClicks: number; pin?: string }) => {
      return AuthService.authenticatedRequest("POST", "/api/protected/games/submit-score", data);
    },
    onSuccess: (data) => {
      if (parseFloat(data.reward) > 0) {
        setPendingReward(data);
        setShowPinDialog(true);
      } else {
        toast({
          title: "Score Submitted!",
          description: "Your score has been recorded.",
        });
      }
      refetchGameStats();
      refetchLeaderboard();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit score",
        variant: "destructive",
      });
    },
  });

  const claimDailyReward = useMutation({
    mutationFn: (data?: { pin?: string }) =>
      AuthService.authenticatedRequest("POST", "/api/protected/games/daily-reward", data || {}),
    onSuccess: (data) => {
      if (data.reward > 0) {
        setPendingReward(data);
        setShowPinDialog(true);
      } else {
        toast({
          title: "Daily Reward Claimed!",
          description: `Streak: ${data.streak} days`,
        });
      }
      refetchGameStats();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to claim daily reward",
        variant: "destructive",
      });
    },
  });

  // Check wallet status on component mount only
  useEffect(() => {
    const checkWalletStatus = () => {
      setCheckingWallet(true);
      try {
        const isUnlocked = keyVault.isVaultUnlocked();
        setWalletSessionActive(isUnlocked);
      } catch (error) {
        console.error("Error checking wallet session:", error);
        setWalletSessionActive(false);
      } finally {
        setCheckingWallet(false);
      }
    };

    checkWalletStatus();
  }, []);

  // Energy regeneration for tap game
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy((prev) => Math.min(100, prev + 1));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Spin energy regeneration
  useEffect(() => {
    const interval = setInterval(() => {
      setSpinEnergy((prev) => Math.min(3, prev + 1));
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  // Hamster energy regeneration
  useEffect(() => {
    const interval = setInterval(() => {
      setHamsterEnergy((prev) => Math.min(1000 + (hamsterLevel * 100), prev + hamsterLevel));
    }, 1000);
    return () => clearInterval(interval);
  }, [hamsterLevel]);

  // Passive income from hamster
  useEffect(() => {
    const interval = setInterval(() => {
      if (profitPerHour > 0) {
        const hourlyProfit = profitPerHour / 3600;
        setTotalCoins(prev => prev + hourlyProfit);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [profitPerHour]);

  // Game timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && gameActive) {
      endGame();
    }
    return () => clearInterval(interval);
  }, [gameActive, timeLeft]);

  // Auto-submit hamster taps every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (totalCoins > 0) {
        submitScore.mutate({
          gameType: "hamster-tap",
          score: Math.floor(totalCoins),
          dogeClicks: Math.floor(totalCoins / coinsPerTap),
          pepeClicks: 0
        });
        setTotalCoins(0);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [totalCoins, coinsPerTap]);

  const startGame = () => {
    if (energy < 20) {
      toast({
        title: "Not enough energy!",
        description: "You need at least 20 energy to start a game. Wait for energy to regenerate.",
        variant: "destructive",
      });
      return;
    }

    setGameActive(true);
    setTimeLeft(60);
    setTapCount(0);
    setDogeClicks(0);
    setPepeClicks(0);
    setCurrentScore(0);
    setEnergy((prev) => prev - 20);
  };

  const endGame = () => {
    setGameActive(false);
    const totalScore = tapCount + (dogeClicks * 5) + (pepeClicks * 3);
    
    if (totalScore > 0) {
      submitScore.mutate({
        gameType: "tap-to-earn",
        score: totalScore,
        dogeClicks,
        pepeClicks,
      });
    }
  };

  const handleTap = (type: "normal" | "doge" | "pepe") => {
    if (!gameActive || energy <= 0) return;

    setTapCount((prev) => prev + 1);
    let points = 1;
    
    if (type === "doge") {
      setDogeClicks((prev) => prev + 1);
      points = 5;
    } else if (type === "pepe") {
      setPepeClicks((prev) => prev + 1);
      points = 3;
    }
    
    setCurrentScore(prev => prev + points);
  };

  const spinWheel = () => {
    if (spinEnergy < 1) {
      toast({
        title: "No spin energy!",
        description: "Wait for spin energy to regenerate (5 minutes per spin).",
        variant: "destructive",
      });
      return;
    }

    setIsSpinning(true);
    setSpinEnergy(prev => prev - 1);

    if (spinRef.current) {
      const rotation = Math.random() * 360 + 1800;
      spinRef.current.style.transform = `rotate(${rotation}deg)`;
    }

    setTimeout(() => {
      const rewards = [1, 1, 5, 5, 10, 10, 20];
      const reward = rewards[Math.floor(Math.random() * rewards.length)];
      setLastSpinReward(reward);
      setIsSpinning(false);
      
      submitScore.mutate({
        gameType: "spin-wheel",
        score: reward,
        dogeClicks: 0,
        pepeClicks: 0
      });
    }, 3000);
  };

  const handleHamsterTap = (event: React.MouseEvent) => {
    if (hamsterEnergy < coinsPerTap) return;

    setHamsterEnergy(prev => prev - coinsPerTap);
    setTotalCoins(prev => prev + coinsPerTap);
    
    setTapAnimation(true);
    setTimeout(() => setTapAnimation(false), 150);

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const coinId = Date.now() + Math.random();
    setFloatingCoins(prev => [...prev, {
      id: coinId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }]);

    setTimeout(() => {
      setFloatingCoins(prev => prev.filter(coin => coin.id !== coinId));
    }, 1000);
  };

  const upgradeHamster = () => {
    const upgradeCost = hamsterLevel * 1000;
    if (totalCoins >= upgradeCost) {
      setTotalCoins(prev => prev - upgradeCost);
      setHamsterLevel(prev => prev + 1);
      setCoinsPerTap(prev => prev + 1);
      setProfitPerHour(prev => prev + hamsterLevel * 10);
      
      toast({
        title: "Hamster Upgraded!",
        description: `Level ${hamsterLevel + 1}: +${hamsterLevel + 1} coins per tap, +${(hamsterLevel + 1) * 10} profit/hour`,
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleUnlockSuccess = () => {
    setWalletSessionActive(true);
    toast({
      title: "Wallet Unlocked",
      description: "You can now start earning DOPE rewards!",
    });
  };

  const handlePinConfirm = async (pin: string) => {
    if (!pendingReward) return;

    try {
      // Re-submit with PIN to get actual DOPE tokens
      if (pendingReward.reward) {
        // Daily reward
        await claimDailyReward.mutateAsync({ pin });
        toast({
          title: "Daily Reward Claimed!",
          description: `You earned ${pendingReward.reward} DOPE tokens! Streak: ${pendingReward.streak} days`,
        });
      } else {
        // Game score - would need to modify submitScore to accept PIN
        toast({
          title: "DOPE Tokens Earned!",
          description: `You earned ${parseFloat(pendingReward.reward).toFixed(4)} DOPE tokens!`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
    } catch (error) {
      toast({
        title: "Failed to Earn DOPE",
        description: "Please check your PIN and try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Navigation Header */}
      <div className="bg-white dark:bg-gray-900 shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden md:inline">Back</span>
              </Button>
              <div className="flex items-center space-x-2">
                <Gamepad2 className="w-6 h-6 text-primary" />
                <h1 className="text-lg md:text-xl font-bold">DOPE Arcade</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="hidden md:flex">
                Balance: {parseFloat(walletData?.dopeBalance || "0").toFixed(4)} DOPE
              </Badge>
              {walletSessionActive ? (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => window.location.href = "/wallet"}
                  className="hidden md:flex"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Wallet
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  onClick={() => setShowUnlockDialog(true)}
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={checkingWallet}
                >
                  {checkingWallet ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4 mr-2" />
                  )}
                  Unlock Wallet
                </Button>
              )}
            </div>
          </div>
          
          {/* Mobile Balance */}
          <div className="md:hidden mt-2">
            <Badge variant="secondary" className="w-full justify-center">
              Balance: {parseFloat(walletData?.dopeBalance || "0").toFixed(4)} DOPE
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Games Tabs */}
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6 bg-white dark:bg-gray-800 shadow-sm h-auto">
            <TabsTrigger value="hamster" className="flex flex-col items-center space-y-1 py-3 px-2 data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700 dark:data-[state=active]:bg-yellow-900/30 dark:data-[state=active]:text-yellow-400">
              <MousePointer2 className="w-4 h-4" />
              <span className="text-xs font-medium">Hamster</span>
            </TabsTrigger>
            <TabsTrigger value="spin" className="flex flex-col items-center space-y-1 py-3 px-2 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30 dark:data-[state=active]:text-purple-400">
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs font-medium">Spin</span>
            </TabsTrigger>
            <TabsTrigger value="tap" className="flex flex-col items-center space-y-1 py-3 px-2 data-[state=active]:bg-green-100 data-[state=active]:text-green-700 dark:data-[state=active]:bg-green-900/30 dark:data-[state=active]:text-green-400">
              <Target className="w-4 h-4" />
              <span className="text-xs font-medium">Tap</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex flex-col items-center space-y-1 py-3 px-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Stats</span>
            </TabsTrigger>
          </TabsList>

          {/* Hamster Kombat Game */}
          <TabsContent value="hamster" className="space-y-6">
            <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MousePointer2 className="w-5 h-5 text-yellow-600" />
                    <span>DOPE Hamster - Level {hamsterLevel}</span>
                  </div>
                  <Badge variant="default" className="bg-yellow-500">
                    {Math.floor(totalCoins)} Coins
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 md:gap-4 text-center">
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 md:p-3">
                    <div className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">Profit/Hour</div>
                    <div className="text-sm md:text-lg font-bold text-green-600">+{profitPerHour.toFixed(0)}</div>
                  </div>
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 md:p-3">
                    <div className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">Per Tap</div>
                    <div className="text-sm md:text-lg font-bold text-blue-600">+{coinsPerTap}</div>
                  </div>
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 md:p-3">
                    <div className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">Energy</div>
                    <div className="text-sm md:text-lg font-bold text-yellow-600">{hamsterEnergy}/{1000 + (hamsterLevel * 100)}</div>
                  </div>
                </div>

                {/* Hamster Tap Area */}
                <div className="relative flex justify-center">
                  <button
                    onClick={handleHamsterTap}
                    disabled={hamsterEnergy < coinsPerTap}
                    className={`relative w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 border-4 border-yellow-300 shadow-xl transform transition-all duration-150 active:scale-95 ${tapAnimation ? 'scale-110' : ''} ${hamsterEnergy < coinsPerTap ? 'opacity-50' : ''}`}
                  >
                    <MousePointer2 className="w-8 h-8 md:w-12 md:h-12 mx-auto text-white" />
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white font-bold text-xs md:text-sm">
                      TAP ME!
                    </div>
                  </button>
                  
                  {/* Floating coins */}
                  {floatingCoins.map(coin => (
                    <div
                      key={coin.id}
                      className="absolute pointer-events-none text-lg md:text-2xl font-bold text-yellow-500 animate-bounce"
                      style={{
                        left: coin.x,
                        top: coin.y,
                        animation: 'float 1s ease-out forwards'
                      }}
                    >
                      +{coinsPerTap}
                    </div>
                  ))}
                </div>

                <Progress value={(hamsterEnergy / (1000 + (hamsterLevel * 100))) * 100} className="w-full h-3" />
                
                <Button
                  onClick={upgradeHamster}
                  disabled={totalCoins < hamsterLevel * 1000}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade Hamster - {hamsterLevel * 1000} coins
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Spin Wheel Game */}
          <TabsContent value="spin" className="space-y-6">
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <RotateCcw className="w-5 h-5 text-purple-600" />
                  <span>Lucky Spin Wheel</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-6">
                <div className="relative w-48 h-48 md:w-64 md:h-64 mx-auto">
                  <div 
                    ref={spinRef}
                    className="w-full h-full rounded-full border-8 border-purple-500 shadow-2xl transition-transform duration-3000 ease-out overflow-hidden"
                  >
                    {/* Spin wheel segments */}
                    <div className="w-full h-full relative bg-gradient-conic from-red-500 via-yellow-500 via-green-500 via-blue-500 to-red-500">
                      <div className="absolute inset-4 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-inner">
                        <div className="text-center">
                          <RotateCcw className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 text-purple-600" />
                          <div className="text-xs md:text-sm font-bold">SPIN</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 w-0 h-0 border-l-4 border-r-4 border-b-8 border-transparent border-b-black dark:border-b-white"></div>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded">1 DOPE</div>
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded">5 DOPE</div>
                    <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded">10 DOPE</div>
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded">20 DOPE</div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Last Reward: {lastSpinReward > 0 ? `${lastSpinReward} DOPE` : "None"}
                  </div>
                  
                  <div className="space-y-2">
                    <Progress value={(spinEnergy / 3) * 100} className="w-full h-3" />
                    <div className="text-xs text-muted-foreground">
                      Energy: {spinEnergy}/3 (Regenerates every 5 minutes)
                    </div>
                  </div>
                  
                  <Button
                    onClick={spinWheel}
                    disabled={spinEnergy < 1 || isSpinning}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    {isSpinning ? "Spinning..." : `Spin (${spinEnergy}/3 energy)`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tap Game */}
          <TabsContent value="tap" className="space-y-6">
            <Card className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-green-600" />
                    <span className="text-sm md:text-base">DOGE & PEPE Tap Challenge</span>
                  </div>
                  {gameActive && (
                    <Badge variant="default" className="flex items-center space-x-1 bg-red-500 w-fit">
                      <Timer className="w-3 h-3" />
                      <span>{formatTime(timeLeft)}</span>
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Energy Display */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg gap-2">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    <span className="font-medium">Energy: {energy}/100</span>
                  </div>
                  <Progress value={energy} className="flex-1 md:mx-4 h-3" />
                </div>

                {!gameActive ? (
                  <div className="text-center space-y-6">
                    <div className="space-y-4">
                      <p className="text-muted-foreground text-sm md:text-base">
                        Tap DOGE and PEPE characters to earn points!
                      </p>
                      <div className="grid grid-cols-3 gap-2 md:gap-4 text-xs md:text-sm">
                        <div className="bg-green-100 dark:bg-green-900/30 p-2 md:p-3 rounded-lg">
                          <div className="w-4 h-4 md:w-6 md:h-6 bg-green-500 rounded-full mx-auto mb-2"></div>
                          <span>DOGE = 5 points</span>
                        </div>
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 md:p-3 rounded-lg">
                          <div className="w-4 h-4 md:w-6 md:h-6 bg-blue-500 rounded-full mx-auto mb-2"></div>
                          <span>PEPE = 3 points</span>
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-700 p-2 md:p-3 rounded-lg">
                          <div className="w-4 h-4 md:w-6 md:h-6 bg-gray-500 rounded-full mx-auto mb-2"></div>
                          <span>Regular = 1 point</span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={startGame} 
                      disabled={energy < 20}
                      className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                    >
                      {energy < 20 ? "Not Enough Energy" : "Start Game (20 Energy)"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Score Display */}
                    <div className="text-center bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
                      <div className="text-2xl md:text-3xl font-bold text-primary mb-2">
                        {currentScore} Points
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs md:text-sm">
                        <span>Taps: {tapCount}</span>
                        <span className="text-green-500">DOGE: {dogeClicks}</span>
                        <span className="text-blue-500">PEPE: {pepeClicks}</span>
                      </div>
                    </div>

                    {/* Game Area */}
                    <div className="grid grid-cols-3 gap-2 md:gap-4 h-40 md:h-64">
                      <button
                        onClick={() => handleTap("doge")}
                        className="bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white rounded-xl text-lg md:text-2xl font-bold transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl flex flex-col items-center justify-center"
                      >
                        <div className="w-6 h-6 md:w-8 md:h-8 bg-green-300 rounded-full mb-2"></div>
                        <div className="text-xs md:text-sm font-normal">DOGE</div>
                      </button>

                      <button
                        onClick={() => handleTap("normal")}
                        className="bg-gradient-to-br from-gray-400 to-gray-600 hover:from-gray-500 hover:to-gray-700 text-white rounded-xl text-lg md:text-2xl font-bold transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl flex flex-col items-center justify-center"
                      >
                        <Coins className="w-6 h-6 md:w-8 md:h-8 mb-2" />
                        <div className="text-xs md:text-sm font-normal">TAP</div>
                      </button>

                      <button
                        onClick={() => handleTap("pepe")}
                        className="bg-gradient-to-br from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white rounded-xl text-lg md:text-2xl font-bold transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl flex flex-col items-center justify-center"
                      >
                        <div className="w-6 h-6 md:w-8 md:h-8 bg-blue-300 rounded-full mb-2"></div>
                        <div className="text-xs md:text-sm font-normal">PEPE</div>
                      </button>
                    </div>

                    <Button onClick={endGame} variant="outline" className="w-full">
                      End Game Early
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats & Leaderboard */}
          <TabsContent value="stats" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Reward */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Gift className="w-5 h-5 text-orange-500" />
                    <span>Daily Reward</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center space-x-1">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="font-semibold">
                        {gameStats?.canClaimDaily ? "Available!" : "Come back tomorrow"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Streak: {gameStats?.dailyStreak || 0} days
                    </div>
                    <Button
                      onClick={() => claimDailyReward.mutate()}
                      disabled={!gameStats?.canClaimDaily || claimDailyReward.isPending}
                      className="w-full"
                    >
                      {claimDailyReward.isPending ? "Claiming..." : "Claim Reward"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* User Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    <span>Your Stats</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span>Games Played:</span>
                      <span className="font-medium">{gameStats?.gamesPlayed || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Best Score:</span>
                      <span className="font-medium">{gameStats?.bestScore || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total DOGE Taps:</span>
                      <span className="font-medium text-green-500">{gameStats?.totalDogeClicks || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total PEPE Taps:</span>
                      <span className="font-medium text-blue-500">{gameStats?.totalPepeClicks || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Earned:</span>
                      <span className="font-medium text-primary">{parseFloat(gameStats?.totalEarned || "0").toFixed(2)} DOPE</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Leaderboard */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Crown className="w-5 h-5 text-amber-500" />
                    <span>Top Players</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {leaderboard?.slice(0, 10).map((player: any, index: number) => (
                      <div
                        key={player.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          player.id === userProfile?.user?.id 
                            ? "bg-primary/20 border border-primary/30" 
                            : "bg-muted"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold ${
                            index === 0 ? "bg-yellow-500 text-white" :
                            index === 1 ? "bg-gray-400 text-white" :
                            index === 2 ? "bg-amber-600 text-white" :
                            "bg-muted-foreground text-white"
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-sm md:text-base">
                              {player.username}
                              {player.id === userProfile?.user?.id && (
                                <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs md:text-sm font-medium">
                            {parseFloat(player.totalEarned || "0").toFixed(2)} DOPE
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {player.totalScore} pts
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {(!leaderboard || leaderboard.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No players yet. Be the first to earn DOPE!</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Wallet Unlock Dialog */}
      <WalletUnlockDialog
        open={showUnlockDialog}
        onOpenChange={setShowUnlockDialog}
        onUnlocked={handleUnlockSuccess}
      />

      {/* PIN Dialog for Earning DOPE */}
      <PinDialog
        open={showPinDialog}
        onOpenChange={(open) => {
          setShowPinDialog(open);
          if (!open) setPendingReward(null);
        }}
        onConfirm={handlePinConfirm}
        title="Enter PIN to Earn DOPE"
        description={`Enter your 4-digit PIN to receive ${pendingReward?.reward || 0} DOPE tokens.`}
      />

      {/* CSS for floating animation */}
      <style>{`
        @keyframes float {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-50px);
          }
        }
      `}</style>
    </div>
  );
}
