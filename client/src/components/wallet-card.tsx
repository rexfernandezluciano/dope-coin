import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import {
  Wallet,
  Send,
  QrCode,
  Loader2,
  Fuel,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog.js";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast.js";
import { apiRequest, queryClient } from "../lib/queryClient.js";

export const WalletCard = () => {
  const { toast } = useToast();
  const [convertAmount, setConvertAmount] = useState("");

  const { data: wallet, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  }) as any;

  const gasBalance = parseFloat(wallet?.gasBalance || "0");
  const hasLowGas = gasBalance < 10; // Warning if less than 10 GAS

  // Conversion mutation
  const convertMutation = useMutation({
    mutationFn: async ({ xlmAmount }: { xlmAmount: string }) => {
      const response = await apiRequest(
        "POST",
        "/api/protected/wallet/convert-gas",
        { xlmAmount },
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Conversion Successful",
        description: "XLM has been converted to GAS tokens.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      setConvertAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Conversion Failed",
        description: error.message || "Failed to convert XLM to GAS",
        variant: "destructive",
      });
    },
  });

  const navigate = useLocation()[1];

  if (isLoading) {
    return (
      <Card data-testid="wallet-card-loading">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Wallet Balance</span>
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const dopeBalance = parseFloat(wallet?.dopeBalance || "0");
  const xlmBalance = parseFloat(wallet?.xlmBalance || "0");
  const usdValue = "$" + (xlmBalance * 0.402571).toFixed(2);

  return (
    <Card data-testid="wallet-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Wallet Balance</span>
          <Wallet className="h-5 w-5 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div
              className="text-3xl font-bold text-foreground"
              data-testid="dope-balance"
            >
              {dopeBalance.toFixed(4)}
            </div>
            <div className="text-sm text-muted-foreground">DOPE Coins</div>
          </div>

          <div className="pt-4 border-t border-border">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">XLM Balance</span>
              <span className="font-medium" data-testid="xlm-balance">
                {xlmBalance.toFixed(4)} XLM
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">USD Value</span>
              <span className="font-medium" data-testid="usd-value">
                {usdValue}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 bg-primary/10 rounded-lg">
              <div className="text-xl font-bold text-primary">
                {parseFloat(wallet?.xlmBalance || "0").toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">XLM</div>
            </div>
            <div className="text-center p-3 bg-secondary/10 rounded-lg">
              <div className="text-xl font-bold text-secondary">
                {parseFloat(wallet?.usdcBalance || "0").toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">USDC</div>
            </div>
            <div className="text-center p-3 bg-accent/10 rounded-lg">
              <div className="text-xl font-bold text-accent">
                {parseFloat(wallet?.gasBalance || "0").toFixed(0)}
              </div>
              <div className="text-xs text-muted-foreground">GAS</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4">
            <Button
              className="bg-primary hover:bg-secondary/90 text-secondary-foreground"
              size="sm"
              data-testid="button-send"
              onClick={() => navigate("/send")}
            >
              <Send className="w-4 h-4 mr-1" />
              Send
            </Button>
            <Button
              variant="outline"
              className="hover:bg-primary/10 hover:text-primary"
              size="sm"
              data-testid="button-receive"
              onClick={() => navigate("/receive")}
            >
              <QrCode className="w-4 h-4 mr-1" />
              Receive
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant={hasLowGas ? "default" : "outline"}
                size="sm"
                className="w-full hover:bg-primary/10 hover:text-primary"
              >
                <Fuel className="w-4 h-4 mr-2" />
                Get GAS
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full h-full md:h-auto">
              <DialogHeader>
                <DialogTitle>Convert XLM to GAS</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  GAS is required to mine DOPE tokens.
                </p>
                <p className="text-sm text-muted-foreground">
                  Rate: 1 XLM = 100 GAS
                </p>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="convert-amount">
                    Enter Amount
                  </Label>
                  <Input
                    className="mt-4"
                    id="convert-amount"
                    type="number"
                    placeholder="Min. 1.0"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    step="0.1"
                    min="0.1"
                  />
                  {convertAmount && (
                    <p className="text-sm text-muted-foreground mt-1">
                      You will receive:{" "}
                      {(parseFloat(convertAmount || "0") * 100).toFixed(0)} GAS
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConvertAmount("1")}
                  >
                    1 XLM
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConvertAmount("5")}
                  >
                    5 XLM
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConvertAmount("10")}
                  >
                    10 XLM
                  </Button>
                </div>

                <Button
                  onClick={() =>
                    convertMutation.mutate({ xlmAmount: convertAmount })
                  }
                  disabled={
                    !convertAmount ||
                    convertMutation.isPending ||
                    parseFloat(convertAmount) > parseFloat(wallet.xlmBalance)
                  }
                  className="w-full"
                >
                  {convertMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {convertMutation.isPending
                    ? "Converting..."
                    : "Convert"}
                </Button>

                {parseFloat(convertAmount || "0") >
                  parseFloat(wallet.xlmBalance) && (
                  <p className="text-sm text-red-500">
                    Insufficient XLM balance
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};
