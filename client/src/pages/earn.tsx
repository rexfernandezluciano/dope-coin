
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Progress } from "../components/ui/progress.js";
import { useToast } from "../hooks/use-toast.js";
import { AuthService } from "../lib/auth.js";
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
  MousePointer2
} from "lucide-react";

export default function EarnPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
    mutationFn: (data: { gameType: string; score: number; dogeClicks: number; pepeClicks: number }) =>
      AuthService.authenticatedRequest("POST", "/api/protected/games/submit-score", data),
    onSuccess: (data) => {
      toast({
        title: "Score Submitted!",
        description: `You earned ${parseFloat(data.reward).toFixed(4)} DOPE tokens!`,
      });
      refetchGameStats();
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      refetchLeaderboard();
    },
  });

  const claimDailyReward = useMutation({
    mutationFn: () =>
      AuthService.authenticatedRequest("POST", "/api/protected/games/daily-reward"),
    onSuccess: (data) => {
      toast({
        title: "Daily Reward Claimed!",
        description: `You earned ${data.reward} DOPE tokens! Streak: ${data.streak} days`,
      });
      refetchGameStats();
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
    },
  });

  const spinWheelMutation = useMutation({
    mutationFn: (spinResult: number) =>
      AuthService.authenticatedRequest("POST", "/api/protected/games/submit-score", {
        gameType: "spin-wheel",
        score: spinResult,
        dogeClicks: 0,
        pepeClicks: 0
      }),
    onSuccess: (data) => {
      toast({
        title: "Spin Reward!",
        description: `You earned ${parseFloat(data.reward).toFixed(4)} DOPE tokens!`,
      });
      refetchGameStats();
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
    },
  });

  const hamsterTapMutation = useMutation({
    mutationFn: (tapData: { taps: number; coinsEarned: number }) =>
      AuthService.authenticatedRequest("POST", "/api/protected/games/submit-score", {
        gameType: "hamster-tap",
        score: tapData.coinsEarned,
        dogeClicks: tapData.taps,
        pepeClicks: 0
      }),
    onSuccess: (data) => {
      refetchGameStats();
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
    },
  });

  // Energy regeneration for tap game
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy((prev) => Math.min(100, prev + 1));
    }, 3000); // Regenerate 1 energy every 3 seconds
    return () => clearInterval(interval);
  }, []);

  // Spin energy regeneration
  useEffect(() => {
    const interval = setInterval(() => {
      setSpinEnergy((prev) => Math.min(3, prev + 1));
    }, 300000); // Regenerate 1 spin energy every 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Hamster energy regeneration
  useEffect(() => {
    const interval = setInterval(() => {
      setHamsterEnergy((prev) => Math.min(1000 + (hamsterLevel * 100), prev + hamsterLevel));
    }, 1000); // Regenerate based on level
    return () => clearInterval(interval);
  }, [hamsterLevel]);

  // Passive income from hamster
  useEffect(() => {
    const interval = setInterval(() => {
      if (profitPerHour > 0) {
        const hourlyProfit = profitPerHour / 3600; // Per second
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
        hamsterTapMutation.mutate({
          taps: Math.floor(totalCoins / coinsPerTap),
          coinsEarned: Math.floor(totalCoins)
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

    // Spin animation
    if (spinRef.current) {
      const rotation = Math.random() * 360 + 1800; // 5+ full rotations
      spinRef.current.style.transform = `rotate(${rotation}deg)`;
    }

    setTimeout(() => {
      const rewards = [10, 25, 50, 100, 5, 15, 30, 75];
      const reward = rewards[Math.floor(Math.random() * rewards.length)];
      setLastSpinReward(reward);
      setIsSpinning(false);
      
      spinWheelMutation.mutate(reward);
    }, 3000);
  };

  const handleHamsterTap = (event: React.MouseEvent) => {
    if (hamsterEnergy < coinsPerTap) return;

    setHamsterEnergy(prev => prev - coinsPerTap);
    setTotalCoins(prev => prev + coinsPerTap);
    
    // Animation
    setTapAnimation(true);
    setTimeout(() => setTapAnimation(false), 150);

    // Floating coin animation
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="earn-page">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
            <Gamepad2 className="w-8 h-8 text-primary" />
            DOPE Arcade
          </h1>
          <p className="text-muted-foreground">
            Play games, earn real DOPE tokens, and climb the leaderboard!
          </p>
          <div className="text-lg font-semibold text-primary">
            Current Balance: {parseFloat(walletData?.dopeBalance || "0").toFixed(4)} DOPE
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Game Stats */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Zap className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-yellow-500">{energy}</div>
                  <div className="text-xs text-muted-foreground">Tap Energy</div>
                  <Progress value={energy} className="mt-2 h-2" />
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <RefreshCw className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-blue-500">{spinEnergy}</div>
                  <div className="text-xs text-muted-foreground">Spin Energy</div>
                  <Progress value={(spinEnergy / 3) * 100} className="mt-2 h-2" />
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <Coins className="w-6 h-6 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold text-primary">
                    {parseFloat(gameStats?.totalEarned || "0").toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">DOPE Earned</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <Trophy className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-amber-500">
                    #{gameStats?.rank || "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground">Global Rank</div>
                </CardContent>
              </Card>
            </div>

            {/* Hamster Kombat Style Game */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MousePointer2 className="w-5 h-5" />
                    DOPE Hamster - Level {hamsterLevel}
                  </span>
                  <Badge variant="default">
                    {Math.floor(totalCoins)} Coins
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-semibold">Profit per hour</div>
                      <div className="text-primary">+{profitPerHour.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Coins per tap</div>
                      <div className="text-green-500">+{coinsPerTap}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Energy</div>
                      <div className="text-yellow-500">{hamsterEnergy}/{1000 + (hamsterLevel * 100)}</div>
                    </div>
                  </div>

                  {/* Hamster Tap Area */}
                  <div className="relative">
                    <button
                      onClick={handleHamsterTap}
                      disabled={hamsterEnergy < coinsPerTap}
                      className={`relative w-48 h-48 mx-auto rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 border-4 border-yellow-300 shadow-lg transform transition-all duration-150 active:scale-95 ${tapAnimation ? 'scale-110' : ''} ${hamsterEnergy < coinsPerTap ? 'opacity-50' : ''}`}
                    >
                      <div className="text-6xl">🐹</div>
                      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm">
                        TAP ME!
                      </div>
                    </button>
                    
                    {/* Floating coins */}
                    {floatingCoins.map(coin => (
                      <div
                        key={coin.id}
                        className="absolute pointer-events-none text-2xl animate-bounce"
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

                  <Progress value={(hamsterEnergy / (1000 + (hamsterLevel * 100))) * 100} className="w-full" />
                  
                  <Button
                    onClick={upgradeHamster}
                    disabled={totalCoins < hamsterLevel * 1000}
                    className="w-full"
                  >
                    Upgrade Hamster - {hamsterLevel * 1000} coins
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Spin Wheel Game */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  Lucky Spin Wheel
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="relative w-64 h-64 mx-auto">
                  <div 
                    ref={spinRef}
                    className="w-full h-full rounded-full border-8 border-primary bg-gradient-conic from-red-500 via-yellow-500 via-green-500 via-blue-500 to-red-500 transition-transform duration-3000 ease-out"
                    style={{
                      backgroundImage: `conic-gradient(from 0deg, #ef4444 0deg 45deg, #eab308 45deg 90deg, #22c55e 90deg 135deg, #3b82f6 135deg 180deg, #ef4444 180deg 225deg, #eab308 225deg 270deg, #22c55e 270deg 315deg, #3b82f6 315deg 360deg)`
                    }}
                  >
                    <div className="absolute inset-4 rounded-full bg-white flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl font-bold">🎰</div>
                        <div className="text-sm">SPIN</div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 w-0 h-0 border-l-4 border-r-4 border-b-8 border-transparent border-b-black"></div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Last Reward: {lastSpinReward > 0 ? `${lastSpinReward} DOPE` : "None"}
                  </div>
                  <Button
                    onClick={spinWheel}
                    disabled={spinEnergy < 1 || isSpinning}
                    className="w-full max-w-xs"
                  >
                    {isSpinning ? "Spinning..." : `Spin (${spinEnergy}/3 energy)`}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Energy regenerates every 5 minutes
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tap to Earn Game */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    DODGE & PEPE Tap Challenge
                  </span>
                  {gameActive && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      {formatTime(timeLeft)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!gameActive ? (
                  <div className="text-center space-y-4">
                    <div className="space-y-2">
                      <p className="text-muted-foreground">
                        Tap DODGE and PEPE characters to earn points!
                      </p>
                      <div className="flex justify-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span>DODGE = 5 points</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <span>PEPE = 3 points</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                          <span>Regular = 1 point</span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={startGame} 
                      disabled={energy < 20}
                      className="w-full max-w-xs mx-auto"
                    >
                      {energy < 20 ? "Not Enough Energy" : "Start Game (20 Energy)"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Score Display */}
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary mb-2">
                        {currentScore} Points
                      </div>
                      <div className="flex justify-center gap-4 text-sm">
                        <span>Taps: {tapCount}</span>
                        <span className="text-green-500">DODGE: {dogeClicks}</span>
                        <span className="text-blue-500">PEPE: {pepeClicks}</span>
                      </div>
                    </div>

                    {/* Game Area */}
                    <div className="grid grid-cols-3 gap-4 h-64">
                      {/* DODGE Button */}
                      <button
                        onClick={() => handleTap("doge")}
                        className="bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white rounded-xl text-4xl font-bold transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl"
                      >
                        🐕
                        <div className="text-sm font-normal">DODGE</div>
                      </button>

                      {/* Regular Tap */}
                      <button
                        onClick={() => handleTap("normal")}
                        className="bg-gradient-to-br from-gray-400 to-gray-600 hover:from-gray-500 hover:to-gray-700 text-white rounded-xl text-4xl font-bold transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl"
                      >
                        💎
                        <div className="text-sm font-normal">TAP</div>
                      </button>

                      {/* PEPE Button */}
                      <button
                        onClick={() => handleTap("pepe")}
                        className="bg-gradient-to-br from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white rounded-xl text-4xl font-bold transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl"
                      >
                        🐸
                        <div className="text-sm font-normal">PEPE</div>
                      </button>
                    </div>

                    <Button onClick={endGame} variant="outline" className="w-full">
                      End Game Early
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Daily Reward */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5" />
                  Daily Reward
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-1">
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

            {/* Leaderboard */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5" />
                  Top Players
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard?.slice(0, 10).map((player: any, index: number) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        player.id === userProfile?.user?.id 
                          ? "bg-primary/20 border border-primary/30" 
                          : "bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? "bg-yellow-500 text-white" :
                          index === 1 ? "bg-gray-400 text-white" :
                          index === 2 ? "bg-amber-600 text-white" :
                          "bg-muted-foreground text-white"
                        }`}>
                          {index + 1}
                        </div>
                        <span className="font-medium text-sm">
                          {player.username}
                        </span>
                        {player.id === userProfile?.user?.id && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">
                          {parseFloat(player.totalEarned || "0").toFixed(2)} DOPE
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {player.totalScore} pts
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {(!leaderboard || leaderboard.length === 0) && (
                    <div className="text-center py-4 text-muted-foreground">
                      No players yet. Be the first to earn DOPE!
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* User Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Your Stats
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
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
