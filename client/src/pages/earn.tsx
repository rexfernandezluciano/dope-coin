
import { useState, useEffect } from "react";
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
  Users
} from "lucide-react";

export default function EarnPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tapCount, setTapCount] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [dogeClicks, setDogeClicks] = useState(0);
  const [pepeClicks, setPepeClicks] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [dailyStreak, setDailyStreak] = useState(0);

  const { data: gameStats } = useQuery({
    queryKey: ["/api/protected/games/stats"],
    refetchInterval: 30000,
  }) as any;

  const { data: leaderboard } = useQuery({
    queryKey: ["/api/protected/games/leaderboard"],
    refetchInterval: 60000,
  }) as any;

  const { data: userProfile } = useQuery({
    queryKey: ["/api/protected/profile"],
  }) as any;

  const submitScore = useMutation({
    mutationFn: (data: { gameType: string; score: number; dogeClicks: number; pepeClicks: number }) =>
      AuthService.authenticatedRequest("POST", "/api/protected/games/submit-score", data),
    onSuccess: (data) => {
      toast({
        title: "Score Submitted!",
        description: `You earned ${data.reward} DOPE tokens!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/games/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/protected/games/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      setDailyStreak(data.streak);
    },
  });

  // Energy regeneration
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy((prev) => Math.min(100, prev + 1));
    }, 3000); // Regenerate 1 energy every 3 seconds

    return () => clearInterval(interval);
  }, []);

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
    
    if (type === "doge") {
      setDogeClicks((prev) => prev + 1);
    } else if (type === "pepe") {
      setPepeClicks((prev) => prev + 1);
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
            Play games, earn DOPE tokens, and climb the leaderboard!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Game Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Zap className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-yellow-500">{energy}</div>
                  <div className="text-xs text-muted-foreground">Energy</div>
                  <Progress value={energy} className="mt-2 h-2" />
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <Coins className="w-6 h-6 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold text-primary">
                    {gameStats?.totalEarned || 0}
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
                        {tapCount + (dogeClicks * 5) + (pepeClicks * 3)} Points
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
                        player.username === userProfile?.user?.username 
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
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {player.totalScore} pts
                      </span>
                    </div>
                  ))}
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
