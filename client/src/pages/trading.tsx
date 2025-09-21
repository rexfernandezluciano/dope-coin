import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import { Badge } from "../components/ui/badge.js";
import { Separator } from "../components/ui/separator.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form.js";
import { useToast } from "../hooks/use-toast.js";
import {
  TrendingUp,
  BarChart3,
  Droplets,
  Plus,
  Minus,
  Loader2,
} from "lucide-react";
import { queryClient, apiRequest } from "../lib/queryClient.js";
import {
  executeTradeSchema,
  addLiquiditySchema,
  removeLiquiditySchema,
} from "../../../shared/schema.js";
import type {
  ExecuteTradeRequest,
  AddLiquidityRequest,
  RemoveLiquidityRequest,
} from "../../../shared/schema.js";
import { z } from "zod";
import { TrustAssetModal } from "../components/trust-asset-modal.js";

interface TradingPair {
  baseAsset: any;
  quoteAsset: any;
  symbol: string;
}

interface LiquidityPool {
  poolId: string;
  balance: string;
  poolInfo: {
    id: string;
    assets: {
      assetA: string;
      assetB: string;
    };
    reserves: {
      assetA: string;
      assetB: string;
    };
    totalShares: string;
    fee: number;
  };
}

// Form schemas with validation
const tradeFormSchema = executeTradeSchema.extend({
  tradingPair: z.string().min(1, "Please select a trading pair"),
});

const liquidityFormSchema = addLiquiditySchema;

export default function TradingPage() {
  const { toast } = useToast();
  const [selectedPair, setSelectedPair] = useState<string>("DOPE/XLM");

  const [trustModalOpen, setTrustModalOpen] = useState(false);
  const [pendingTrustAsset, setPendingTrustAsset] = useState<{
    code: string;
    issuer: string;
    domain?: string;
  } | null>(null);
  const [pendingTradeData, setPendingTradeData] =
    useState<ExecuteTradeRequest | null>(null);
  const [currentSellAmount, setCurrentSellAmount] = useState<number>(0);
  const [, navigate] = useLocation();

  // Fetch trading pairs
  const { data: tradingPairs, isLoading: tradingPairsLoading } = useQuery({
    queryKey: ["/api/protected/trade/pairs"],
  }) as { data: TradingPair[]; isLoading: boolean };

  // Use the exchange rate hook at the top level

  // Get DOPE issuer from trading pairs
  const dopeIssuer =
    tradingPairs?.find((pair) => pair.baseAsset.issuer)?.baseAsset.issuer || "";
  const issuer =
    tradingPairs?.find((pair) => pair.quoteAsset.issuer)?.quoteAsset.issuer ||
    "";

  // Helper function to extract asset info from trading pairs and error messages
  const getAssetFromError = (errorMessage: string, tradingPair: string) => {
    // Find the quote asset from trading pairs that needs trust
    const selectedPairData = tradingPairs?.find(
      (pair) => pair.symbol === tradingPair,
    );

    if (selectedPairData) {
      // Check if it's the quote asset (usually the one that needs trust)
      const quoteAsset = selectedPairData.quoteAsset;

      // If quote asset has an issuer, it's likely the one needing trust
      if (quoteAsset.issuer && quoteAsset.code) {
        return {
          code: quoteAsset.code,
          issuer: quoteAsset.issuer,
          domain: quoteAsset.domain,
        };
      }

      // Check base asset as fallback
      const baseAsset = selectedPairData.baseAsset;
      if (baseAsset.issuer && baseAsset.code) {
        return {
          code: baseAsset.code,
          issuer: baseAsset.issuer,
          domain: baseAsset.domain,
        };
      }
    }

    return null;
  };

  // Trade form
  const tradeForm = useForm<z.infer<typeof tradeFormSchema>>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: {
      tradingPair: selectedPair,
      sellAsset:
        selectedPair === "XLM/DOPE"
          ? { type: "native" }
          : { code: "DOPE", issuer: dopeIssuer },
      buyAsset:
        selectedPair === "XLM/DOPE"
          ? { code: "DOPE", issuer: dopeIssuer }
          : { type: "native", code: "XLM" },
      sellAmount: "",
      minBuyAmount: "",
    },
  });

  // Liquidity form
  const liquidityForm = useForm<AddLiquidityRequest>({
    resolver: zodResolver(liquidityFormSchema),
    defaultValues: {
      assetA: { type: "native" },
      assetB: { code: "DOPE", issuer: dopeIssuer },
      amountA: "",
      amountB: "",
      minPrice: "",
      maxPrice: "",
    },
  });

  // Fetch user's liquidity pools
  const {
    data: liquidityPools,
    refetch: refetchPools,
    isLoading: poolsLoading,
  } = useQuery({
    queryKey: ["/api/protected/liquidity/pools"],
  }) as { data: LiquidityPool[]; refetch: () => void; isLoading: boolean };

  // Fetch wallet balance for validation
  const { data: walletBalance } = useQuery({
    queryKey: ["/api/protected/wallet"],
  }) as {
    data: { xlmBalance: string; dopeBalance: string; gasBalance: string };
  };

  const { data: exchangeRate, isLoading: exchangeRateLoading } = useQuery({
    queryKey: [
      "/api/protected/trade/exchange-rate",
      tradeForm.getValues("sellAsset")?.code,
      tradeForm.getValues("buyAsset")?.code,
      currentSellAmount,
    ],
    queryFn: async () => {
      const buyingAsset = tradeForm.getValues("buyAsset")?.code;
      const sellingAsset = tradeForm.getValues("sellAsset")?.code;
      if (
        !selectedPair ||
        !sellingAsset ||
        !buyingAsset ||
        currentSellAmount <= 0
      )
        return null;
      const response = await apiRequest(
        "POST",
        "/api/protected/trade/exchange-rate",
        {
          sellingAsset: sellingAsset || "XLM",
          buyingAsset: buyingAsset || "DOPE",
          sellAmount: currentSellAmount || 0,
          issuerA: dopeIssuer,
          issuerB: issuer,
        },
      );
      return response.json();
    },
    enabled: !!selectedPair && currentSellAmount > 0,
  }) as any;

  // Execute trade mutation
  const executeTradeMutation = useMutation({
    mutationFn: async (data: ExecuteTradeRequest) => {
      const response = await apiRequest(
        "POST",
        "/api/protected/trade/execute",
        data,
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Trade Successful",
        description: `Swapped ${data.result?.sellAmount} ${data.result?.sellAsset} for ${data.result?.receivedAmount} ${data.result?.buyAsset}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/protected/transactions"],
      });
      tradeForm.reset();
      setPendingTradeData(null); // Clear pending trade data
    },
    onError: (error: any, variables) => {
      let errorMessage = "Failed to execute trade";

      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      // Only show trust modal if trustline is missing, NOT if it already exists
      const isMissingTrustline =
        (errorMessage.includes("Missing trustline") ||
          errorMessage.includes("opnotrust")) &&
        !errorMessage.includes("already exists");

      if (isMissingTrustline) {
        // Get the current trading pair from form
        const currentTradingPair = tradeForm.getValues("tradingPair");
        const assetToTrust = getAssetFromError(
          errorMessage,
          currentTradingPair,
        );

        if (assetToTrust) {
          // Store the trade data to retry after trusting
          setPendingTradeData(variables);
          setPendingTrustAsset(assetToTrust);
          setTrustModalOpen(true);
          return; // Don't show the error toast, show the trust modal instead
        }
      }

      toast({
        title: "Trade Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Add liquidity mutation
  const addLiquidityMutation = useMutation({
    mutationFn: async (data: AddLiquidityRequest) => {
      // Validate amounts before sending
      const xlmAmount = parseFloat(data.amountA);
      const dopeAmount = parseFloat(data.amountB);

      if (xlmAmount <= 0 || dopeAmount <= 0) {
        throw new Error("Both XLM and DOPE amounts must be greater than 0");
      }

      if (xlmAmount < 0.5) {
        throw new Error(
          "Minimum XLM amount is 0.5 XLM (to cover fees and reserves)",
        );
      }

      if (dopeAmount < 0.1) {
        throw new Error("Minimum DOPE amount is 0.1 DOPE");
      }

      // Check user balances
      if (walletBalance) {
        const userXlm = parseFloat(walletBalance.xlmBalance);
        const userDope = parseFloat(walletBalance.dopeBalance);

        if (userXlm < xlmAmount + 1.0) {
          throw new Error(
            `Insufficient XLM. You have ${userXlm.toFixed(2)} XLM but need ${(xlmAmount + 1.0).toFixed(2)} XLM (including fees)`,
          );
        }

        if (userDope < dopeAmount) {
          throw new Error(
            `Insufficient DOPE. You have ${userDope.toFixed(2)} DOPE but need ${dopeAmount} DOPE`,
          );
        }
      }

      const response = await apiRequest(
        "POST",
        "/api/protected/liquidity/add",
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Liquidity Added",
        description: "Your liquidity has been added successfully.",
      });
      refetchPools();
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      liquidityForm.reset();
    },
    onError: (error: any) => {
      let errorMessage = "Failed to add liquidity";

      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast({
        title: "Add Liquidity Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Remove liquidity mutation
  const removeLiquidityMutation = useMutation({
    mutationFn: async ({
      poolId,
      amount,
    }: {
      poolId: string;
      amount: string;
    }) => {
      const data: RemoveLiquidityRequest = {
        poolId,
        amount,
        minAmountA: "0.1",
        minAmountB: "0.1",
      };
      const response = await apiRequest(
        "POST",
        "/api/protected/liquidity/remove",
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Liquidity Removed",
        description: "Your liquidity has been removed successfully.",
      });
      refetchPools();
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
    },
    onError: (error: any) => {
      toast({
        title: "Remove Liquidity Failed",
        description: error.message || "Failed to remove liquidity",
        variant: "destructive",
      });
    },
  });

  const updatedDopeIssuer = (value: string = selectedPair) => {
    if (dopeIssuer) {
      if (selectedPair === "XLM/DOPE") {
        tradeForm.setValue("sellAsset", { type: "native", code: "XLM" });
        tradeForm.setValue("buyAsset", { code: "DOPE", issuer: dopeIssuer });
      } else if (selectedPair === "DOPE/XLM") {
        tradeForm.setValue("sellAsset", { code: "DOPE", issuer: dopeIssuer });
        tradeForm.setValue("buyAsset", { type: "native", code: "XLM" });
      } else if (selectedPair === "DOPE/USDC") {
        tradeForm.setValue("sellAsset", { code: "DOPE", issuer: dopeIssuer });
        tradeForm.setValue("buyAsset", { code: "USDC", issuer: dopeIssuer });
      } else if (selectedPair === "USDC/DOPE") {
        tradeForm.setValue("sellAsset", { code: "USDC", issuer: dopeIssuer });
        tradeForm.setValue("buyAsset", { code: "DOPE", issuer: dopeIssuer });
      } else if (selectedPair === "EURC/DOPE") {
        tradeForm.setValue("sellAsset", { code: "EURC", issuer: issuer });
        tradeForm.setValue("buyAsset", { code: "DOPE", issuer: dopeIssuer });
      } else if (selectedPair === "DOPE/EURC") {
        tradeForm.setValue("sellAsset", { code: "DOPE", issuer: dopeIssuer });
        tradeForm.setValue("buyAsset", { code: "EURC", issuer: issuer });
      }

      setSelectedPair(value);
      tradeForm.setValue("tradingPair", selectedPair);
      liquidityForm.setValue("assetB", { code: "DOPE", issuer: dopeIssuer });
    }
  };

  // Update forms when DOPE issuer is available or trading pair changes
  React.useEffect(() => {
    updatedDopeIssuer(selectedPair);
  }, [dopeIssuer, selectedPair, tradeForm, liquidityForm]);

  // Update minimum receive amount when exchange rate is available
  React.useEffect(() => {
    if (exchangeRate?.estimatedAmount) {
      // Set minimum receive amount with 2% slippage tolerance
      const minReceive = exchangeRate.estimatedAmount * 0.98;
      tradeForm.setValue("minBuyAmount", minReceive.toFixed(7));
    }
  }, [exchangeRate, tradeForm]);

  // Calculate liquidity amounts automatically
  const calculateLiquidityAmount = (amountA: string, selectedPair: string) => {
    if (!amountA || !selectedPair) return;

    try {
      // Convert string to number
      const depositAmount = parseFloat(amountA);
      if (isNaN(depositAmount)) return;

      // For your requirements: if deposit = 1, min = 0.1, max = 1
      // This suggests min = deposit * 0.1, max = deposit * 1.0
      const minPrice = 0.1;
      const maxPrice = (depositAmount * 1.0).toFixed(2);

      // Set amountB to the deposit amount (or whatever ratio you need)
      liquidityForm.setValue("amountB", (depositAmount * 10).toFixed(2));
      liquidityForm.setValue(
        "minPrice",
        parseFloat(minPrice.toString()).toString(),
      );
      liquidityForm.setValue("maxPrice", maxPrice);
    } catch (error) {
      console.error("Error calculating liquidity amount:", error);
    }
  };

  const onTradeSubmit = (data: z.infer<typeof tradeFormSchema>) => {
    const { tradingPair, ...tradeData } = data;
    executeTradeMutation.mutate(tradeData);
  };

  const onLiquiditySubmit = (data: AddLiquidityRequest) => {
    addLiquidityMutation.mutate(data);
  };

  if (tradingPairsLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading trading data...</p>
        </div>
      </div>
    );
  }

  const handleTrustModalClose = () => {
    setTrustModalOpen(false);
    setPendingTrustAsset(null);
    setPendingTradeData(null);
  };

  const handleTrustSuccess = () => {
    // Retry the original trade after successful trust
    if (pendingTradeData) {
      setTimeout(() => {
        executeTradeMutation.mutate(pendingTradeData);
      }, 1000); // Small delay to ensure trustline is established
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="trading-page">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Trading & Liquidity</h1>
      </div>

      <Tabs defaultValue="trading" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="trading" data-testid="tab-trading">
            Trading
          </TabsTrigger>
          <TabsTrigger value="liquidity" data-testid="tab-liquidity">
            Liquidity Pools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trading" className="space-y-6">
          {/* Desktop Layout: Trading form on left, Available pairs on right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Trading Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Swap Assets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...tradeForm}>
                  <form
                    onSubmit={tradeForm.handleSubmit(onTradeSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={tradeForm.control}
                      name="tradingPair"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trading Pair</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(value) => updatedDopeIssuer(value)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-trading-pair">
                                <SelectValue placeholder="Select trading pair" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {tradingPairs?.map((pair) => (
                                <SelectItem
                                  key={pair.symbol}
                                  value={pair.symbol}
                                >
                                  {pair.symbol}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={tradeForm.control}
                      name="sellAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount to Sell</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-trade-amount"
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                              onChange={(e) => {
                                field.onChange(e);
                                const amount = parseFloat(e.target.value);
                                if (!isNaN(amount) && amount > 0) {
                                  setCurrentSellAmount(amount);
                                } else {
                                  setCurrentSellAmount(0);
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={tradeForm.control}
                      name="minBuyAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum to Receive</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-min-receive"
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                              disabled
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-center p-4 border rounded-lg bg-muted/30">
                      {exchangeRateLoading && currentSellAmount > 0 ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading rate...
                        </div>
                      ) : exchangeRate?.rate && currentSellAmount > 0 ? (
                        <div className="text-center">
                          <div className="text-sm text-muted-foreground">
                            Exchange Rate
                          </div>
                          <div className="font-semibold text-lg">
                            {parseFloat(exchangeRate?.rate).toFixed(4)} per{" "}
                            {tradeForm.getValues("sellAsset")?.code}
                          </div>
                          {exchangeRate?.estimatedAmount && (
                            <div className="text-sm text-muted-foreground mt-1">
                              Est. receive: {parseFloat(exchangeRate?.estimatedAmount).toFixed(4) || 0}{" "}
                              {tradeForm.getValues("buyAsset")?.code}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Enter amount to see rate
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      className="w-full mb-3 hover:bg-muted-foreground hover:text-white"
                      onClick={() => navigate("/orders/create")}
                    >
                      Create Order
                    </Button>

                    <Button
                      type="submit"
                      disabled={executeTradeMutation.isPending}
                      className="w-full hover:bg-muted-foreground hover:text-white"
                      data-testid="button-execute-trade"
                    >
                      {executeTradeMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      {executeTradeMutation.isPending
                        ? "Executing..."
                        : "Execute Trade"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Right Column - Available Trading Pairs */}
            <Card>
              <CardHeader>
                <CardTitle>Available Trading Pairs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tradingPairs?.map((pair) => (
                    <div
                      key={pair.symbol}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedPair === pair.symbol
                          ? "bg-primary/10 border-primary"
                          : ""
                      }`}
                      data-testid={`pair-${pair.symbol}`}
                      onClick={() => {
                        setSelectedPair(pair.symbol);
                        updatedDopeIssuer(pair.symbol);
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-lg">
                            {pair.symbol}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {pair.baseAsset.code || "XLM"} →{" "}
                            {pair.quoteAsset.code || "XLM"}
                          </div>
                        </div>
                        {selectedPair === pair.symbol && (
                          <Badge variant="default" className="ml-2">
                            Selected
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="liquidity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                Add Liquidity
              </CardTitle>
              {walletBalance && (
                <div className="text-sm text-muted-foreground">
                  Available: {parseFloat(walletBalance.xlmBalance).toFixed(2)}{" "}
                  XLM • {parseFloat(walletBalance.dopeBalance).toFixed(2)} DOPE
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Form {...liquidityForm}>
                <form
                  onSubmit={liquidityForm.handleSubmit(onLiquiditySubmit)}
                  className="space-y-4"
                >
                  <div className="mb-4">
                    <Label>Liquidity Pool Pair</Label>
                    <Select defaultValue="XLM/DOPE">
                      <SelectTrigger>
                        <SelectValue placeholder="Select liquidity pair" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOPE/XLM">DOPE/XLM</SelectItem>
                        <SelectItem value="XLM/DOPE">XLM/DOPE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={liquidityForm.control}
                      name="amountA"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount to Deposit</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-liquidity-xlm"
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                              onChange={(e) => {
                                field.onChange(e);
                                calculateLiquidityAmount(
                                  e.target.value,
                                  "DOPE/XLM",
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={liquidityForm.control}
                      name="amountB"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount to Liquidity</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-liquidity-dope"
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={liquidityForm.control}
                      name="minPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Price</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-min-price"
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={liquidityForm.control}
                      name="maxPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Price</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-max-price"
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={addLiquidityMutation.isPending}
                    className="w-full"
                    data-testid="button-add-liquidity"
                  >
                    {addLiquidityMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    <Plus className="w-4 h-4 mr-2" />
                    {addLiquidityMutation.isPending
                      ? "Adding..."
                      : "Add Liquidity"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Liquidity Positions</CardTitle>
            </CardHeader>
            <CardContent>
              {poolsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Loading liquidity pools...
                  </p>
                </div>
              ) : liquidityPools && liquidityPools.length > 0 ? (
                <div className="space-y-4">
                  {liquidityPools.map((pool) => (
                    <div
                      key={pool.poolId}
                      className="p-4 border rounded-lg space-y-3"
                      data-testid={`pool-${pool.poolId}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold">
                            {pool.poolInfo.assets.assetA} /{" "}
                            {pool.poolInfo.assets.assetB}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Pool ID: {pool.poolId.slice(0, 8)}...
                          </div>
                        </div>
                        <Badge variant="outline">
                          {pool.poolInfo.fee / 100}% Fee
                        </Badge>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">
                            Your Balance
                          </div>
                          <div className="font-medium">
                            {parseFloat(pool.balance).toFixed(6)} LP
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Pool Size</div>
                          <div className="font-medium">
                            {parseFloat(pool.poolInfo.totalShares).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">
                            {pool.poolInfo.assets.assetA} Reserve
                          </div>
                          <div className="font-medium">
                            {parseFloat(pool.poolInfo.reserves.assetA).toFixed(
                              2,
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">
                            {pool.poolInfo.assets.assetB} Reserve
                          </div>
                          <div className="font-medium">
                            {parseFloat(pool.poolInfo.reserves.assetB).toFixed(
                              2,
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          removeLiquidityMutation.mutate({
                            poolId: pool.poolId,
                            amount: pool.balance,
                          })
                        }
                        disabled={removeLiquidityMutation.isPending}
                        className="w-full"
                        data-testid={`button-remove-liquidity-${pool.poolId}`}
                      >
                        {removeLiquidityMutation.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        <Minus className="w-4 h-4 mr-2" />
                        {removeLiquidityMutation.isPending
                          ? "Removing..."
                          : "Remove Liquidity"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="text-center py-8 text-muted-foreground"
                  data-testid="no-pools"
                >
                  <Droplets className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No liquidity positions found</p>
                  <p className="text-sm">Add liquidity to start earning fees</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {/* Trust Asset Modal */}
      <TrustAssetModal
        isOpen={trustModalOpen}
        onClose={handleTrustModalClose}
        onSuccess={handleTrustSuccess}
        asset={pendingTrustAsset}
      />
    </div>
  );
}
