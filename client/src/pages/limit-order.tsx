import { useState, useEffect } from "react";
import {
  Loader2,
  Target,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient.js";
import { useToast } from "../hooks/use-toast.js";

interface TradingPair {
  baseAsset: any;
  quoteAsset: any;
  symbol: string;
}

export default function LimitOrderCreator() {
  const [selectedPair, setSelectedPair] = useState("DOPE/XLM");
  const [orderType, setOrderType] = useState("buy");
  const [sellAmount, setSellAmount] = useState("");
  const [price, setPrice] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { toast } = useToast();

  const { data: tradingPairs, isLoading: tradingPairsLoading } = useQuery({
    queryKey: ["/api/protected/trade/pairs"],
  }) as { data: TradingPair[]; isLoading: boolean };
  const { data: walletBalance } = useQuery({
    queryKey: ["/api/protected/wallet"],
  }) as {
    data: { xlmBalance: string; dopeBalance: string; gasBalance: string };
  };

  // Get asset issuers
  const dopeIssuer =
    tradingPairs?.find((pair) => pair.baseAsset.issuer)?.baseAsset.issuer || "";
  const usdcIssuer =
    tradingPairs?.find((pair) => pair.quoteAsset.issuer)?.quoteAsset.issuer ||
    "";

  // Form data state
  const [formData, setFormData] = useState({
    sellAsset: { type: "credit_alphanum4", code: "DOPE", issuer: dopeIssuer },
    buyAsset: { type: "native", code: "XLM", issuer: "" },
  });

  // Update form when trading pair or order type changes
  useEffect(() => {
    if (selectedPair === "DOPE/XLM") {
      setFormData({
        sellAsset: {
          type: "credit_alphanum4",
          code: "DOPE",
          issuer: dopeIssuer,
        },
        buyAsset: { type: "native", code: "XLM", issuer: "" },
      });
    } else if (selectedPair === "XLM/DOPE") {
      setFormData({
        sellAsset: { type: "native", code: "XLM", issuer: "" },
        buyAsset: {
          type: "credit_alphanum4",
          code: "DOPE",
          issuer: dopeIssuer,
        },
      });
    } else if (selectedPair === "DOPE/USDC") {
      setFormData({
        sellAsset: {
          type: "credit_alphanum4",
          code: "DOPE",
          issuer: dopeIssuer,
        },
        buyAsset: {
          type: "credit_alphanum4",
          code: "USDC",
          issuer: usdcIssuer,
        },
      });
    } else if (selectedPair === "USDC/DOPE") {
      setFormData({
        sellAsset: {
          type: "credit_alphanum4",
          code: "USDC",
          issuer: usdcIssuer,
        },
        buyAsset: {
          type: "credit_alphanum4",
          code: "DOPE",
          issuer: dopeIssuer,
        },
      });
    } else if (selectedPair === "EURC/DOPE") {
      setFormData({
        sellAsset: {
          type: "credit_alphanum4",
          code: "EURC",
          issuer: usdcIssuer,
        },
        buyAsset: {
          type: "credit_alphanum4",
          code: "DOPE",
          issuer: dopeIssuer,
        },
      });
    } else if (selectedPair === "DOPE/EURC") {
      setFormData({
        sellAsset: {
          type: "credit_alphanum4",
          code: "DOPE",
          issuer: dopeIssuer,
        },
        buyAsset: { type: "credit_alphanum4", code: "EURC", issuer: usdcIssuer },
      });
    }
  }, [selectedPair, orderType, dopeIssuer, usdcIssuer]);

  const executeOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        "/api/protected/trade/limit-orders",
        data,
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Order Successful",
        description: `Your order has been placed`,
      });
      // Invalidate the orderbook query to refresh the data
      queryClient.invalidateQueries({ 
        queryKey: ["/api/protected/trade/orderbook"] 
      });
    },
    onError: (error: any, variables) => {
      let errorMessage = "Failed to place order";

      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast({
        title: "Order Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const orderData = {
        sellAsset: formData.sellAsset,
        amount: sellAmount,
        buyAsset: formData.buyAsset,
        price: price,
        orderType: orderType,
      };

      executeOrderMutation.mutate(orderData);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const executeCancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/protected/trade/limit-orders/${orderId}`,
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Order Cancelled",
        description: `Your order has been cancelled`,
      });
      // Invalidate the orderbook query to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/protected/trade/orderbook"] });
    },
  });

  const handleCancelOrder = async (orderId: string) => {
    executeCancelOrderMutation.mutate(orderId);
  };

  const calculateTotal = () => {
    const sellAmountNum = parseFloat(sellAmount || "0");
    const priceNum = parseFloat(price || "0");
    if (sellAmountNum && priceNum) {
      if (orderType === "buy") {
        // For buy orders, we're spending sellAmount to get sellAmount * price
        return (sellAmountNum * priceNum).toFixed(6);
      } else {
        // For sell orders, we're selling sellAmount to get sellAmount * price
        return (sellAmountNum * priceNum).toFixed(6);
      }
    }
    return "0.00";
  };

  const getSellAssetCode = () => {
    return formData.sellAsset?.code || "XLM";
  };

  const getBuyAssetCode = () => {
    return formData.buyAsset?.code || "XLM";
  };

  // Create a stable query key using primitive values instead of objects
  const orderbookQueryKey = [
    "/api/protected/trade/orderbook",
    selectedPair,
    formData.sellAsset?.type,
    formData.sellAsset?.code, 
    formData.sellAsset?.issuer,
    formData.buyAsset?.type,
    formData.buyAsset?.code,
    formData.buyAsset?.issuer
  ];

  // Fixed orderbook query with stable primitive values in key
  const { data: limitOrdersData, isLoading: limitOrdersLoading } = useQuery({
    queryKey: orderbookQueryKey,
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/protected/trade/orderbook", {
        selling: formData.sellAsset,
        buying: formData.buyAsset,
      });
      return response.json();
    },
    enabled: !!formData.sellAsset && !!formData.buyAsset, // Only run when formData is ready
    staleTime: 0, // Ensure fresh data when switching pairs
  }) as any;

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Target className="h-8 w-8 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Offers</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Limit Order Form */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold">Create Order</h3>
            </div>
            <div className="text-sm text-gray-500">
              Available: {parseFloat(walletBalance?.xlmBalance || "0").toFixed(2)} XLM
              • {parseFloat(walletBalance?.dopeBalance || "0").toFixed(2)} DOPE
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {/* Trading Pair Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trading Pair
                </label>
                <select
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {tradingPairs?.map((pair) => (
                    <option key={pair.symbol} value={pair.symbol}>
                      {pair.symbol}
                    </option>
                  ))}
                </select>
              </div>

              {/* Order Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Order Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType("buy")}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                      orderType === "buy"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <TrendingUp className="h-4 w-4 inline mr-2" />
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType("sell")}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                      orderType === "sell"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <TrendingDown className="h-4 w-4 inline mr-2" />
                    Sell
                  </button>
                </div>
              </div>

              {/* Sell Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount to {orderType === "buy" ? "Pay" : "Sell"} (
                  {getSellAssetCode()})
                </label>
                <input
                  type="number"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price ({getBuyAssetCode()} per {getSellAssetCode()})
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  step="0.0001"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Order Summary */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Order Type:</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      orderType === "buy"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {orderType.toUpperCase()} {selectedPair}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    You {orderType === "buy" ? "pay" : "sell"}:
                  </span>
                  <span className="font-medium">
                    {sellAmount || "0.00"} {getSellAssetCode()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    You {orderType === "buy" ? "receive" : "get"}:
                  </span>
                  <span className="font-medium">
                    {calculateTotal()} {getBuyAssetCode()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Price:</span>
                  <span className="font-medium">
                    {price || "0.00"} {getBuyAssetCode()}/{getSellAssetCode()}
                  </span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isCreating || !sellAmount || !price}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {executeOrderMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {executeOrderMutation.isPending
                  ? "Creating Order..."
                  : `Create ${orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order`}
              </button>
            </div>
          </div>
        </div>

        {/* Active Limit Orders */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Orders/Offers</h3>
          </div>

          <div className="p-6">
            {limitOrdersLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500">Loading orders...</p>
              </div>
            ) : limitOrdersData && limitOrdersData?.length > 0 ? (
              <div className="space-y-3">
                {limitOrdersData?.map((order: any, index: number) => (
                  <div
                    key={index}
                    className="p-4 border border-gray-200 rounded-lg space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm">
                          {order.selling?.code || "XLM"} →{" "}
                          {order.buying?.code || "XLM"}
                        </div>
                        <div className="text-xs text-gray-500">
                          Order ID: {order?.id?.slice(0, 8) || index + 1}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          order?.type === "sell"
                            ? "bg-red-100 text-red-800"
                            : order?.type === "buy"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {(order?.type || "Unknown").toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Amount:</span>
                        <div className="font-medium">
                          {parseFloat(order?.amount || "0").toFixed(2)}{" "}
                          {order.selling?.code || "XLM"}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Price:</span>
                        <div className="font-medium">
                          {parseFloat(order?.price || "0").toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {order?.createdAt && (
                      <div className="text-xs text-gray-500">
                        Created:{" "}
                        {new Date(order.createdAt).toLocaleDateString()}{" "}
                        {new Date(order.createdAt).toLocaleTimeString()}
                      </div>
                    )}

                    {order?.status === "active" && order?.id && (
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={executeCancelOrderMutation.isPending}
                        className="w-full px-3 py-2 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                      >
                        {executeCancelOrderMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        {executeCancelOrderMutation.isPending
                          ? "Cancelling..."
                          : "Cancel Order"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No active limit orders</p>
                <p className="text-sm">
                  Create your first limit order to get started
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          How Limit Orders Work
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <h4 className="font-medium mb-1">Buy Orders</h4>
            <p>
              Your buy order will execute when the market price drops to or
              below your specified price.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Sell Orders</h4>
            <p>
              Your sell order will execute when the market price rises to or
              above your specified price.
            </p>
          </div>
        </div>
        <div className="mt-3 text-sm text-blue-700">
          <strong>Note:</strong> Limit orders may take time to fill and are not
          guaranteed to execute if market conditions don't meet your specified
          price.
        </div>
      </div>
    </div>
  );
}