
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import { useToast } from "../hooks/use-toast.js";
import { AuthService } from "../lib/auth.js";
import { ArrowLeft, CreditCard, Smartphone, Building, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "../components/ui/alert.js";
import { PinVerification } from "../components/pin-verification.js";
import { useAuth } from "../hooks/use-auth.js";

export default function WithdrawPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [showPinVerification, setShowPinVerification] = useState(false);
  
  const [withdrawForm, setWithdrawForm] = useState({
    amount: "",
    method: "" as "bank" | "paypal" | "venmo" | "cashapp" | "crypto",
    destination: "",
    accountDetails: {
      bankName: "",
      accountNumber: "",
      routingNumber: "",
      accountHolder: "",
      email: "",
      phone: "",
      cryptoAddress: "",
    }
  });

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["/api/protected/wallet"],
    refetchInterval: 30000,
  }) as any;

  const { data: withdrawalMethods } = useQuery({
    queryKey: ["/api/protected/withdrawal/methods"],
  }) as any;

  const submitWithdrawal = useMutation({
    mutationFn: (data: typeof withdrawForm & { pin: string }) =>
      AuthService.authenticatedRequest(
        "POST",
        "/api/protected/withdrawal/submit",
        data,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/wallet"] });
      setWithdrawForm({
        amount: "",
        method: "" as any,
        destination: "",
        accountDetails: {
          bankName: "",
          accountNumber: "",
          routingNumber: "",
          accountHolder: "",
          email: "",
          phone: "",
          cryptoAddress: "",
        }
      });
      setShowPinVerification(false);
      toast({
        title: "Withdrawal Submitted",
        description: `Your withdrawal of ${data.amount} DOPE has been submitted. Processing time: ${data.processingTime}`,
      });
      navigate("/wallet");
    },
    onError: (error) => {
      setShowPinVerification(false);
      toast({
        title: "Withdrawal Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!withdrawForm.amount || !withdrawForm.method) {
      toast({
        title: "Invalid input",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(withdrawForm.amount);
    const dopeBalance = parseFloat(walletData?.dopeBalance || "0");
    
    if (amount < 10) {
      toast({
        title: "Minimum withdrawal",
        description: "Minimum withdrawal amount is 10 DOPE.",
        variant: "destructive",
      });
      return;
    }

    if (amount > dopeBalance) {
      toast({
        title: "Insufficient balance",
        description: "You don't have enough DOPE tokens.",
        variant: "destructive",
      });
      return;
    }

    // Validate method-specific fields
    if (withdrawForm.method === "bank" && 
        (!withdrawForm.accountDetails.bankName || 
         !withdrawForm.accountDetails.accountNumber || 
         !withdrawForm.accountDetails.routingNumber ||
         !withdrawForm.accountDetails.accountHolder)) {
      toast({
        title: "Missing bank details",
        description: "Please fill in all bank account details.",
        variant: "destructive",
      });
      return;
    }

    if ((withdrawForm.method === "paypal" || withdrawForm.method === "venmo" || withdrawForm.method === "cashapp") && 
        !withdrawForm.accountDetails.email) {
      toast({
        title: "Missing account details",
        description: "Please provide your account email or username.",
        variant: "destructive",
      });
      return;
    }

    if (withdrawForm.method === "crypto" && !withdrawForm.accountDetails.cryptoAddress) {
      toast({
        title: "Missing crypto address",
        description: "Please provide a valid cryptocurrency address.",
        variant: "destructive",
      });
      return;
    }

    setShowPinVerification(true);
  };

  const handlePinVerified = (pin: string) => {
    submitWithdrawal.mutate({ ...withdrawForm, pin });
  };

  const handlePinCancel = () => {
    setShowPinVerification(false);
  };

  const setMaxAmount = () => {
    const maxWithdraw = Math.max(0, parseFloat(walletData?.dopeBalance || "0") - 1); // Keep 1 DOPE for fees
    setWithdrawForm(prev => ({
      ...prev,
      amount: maxWithdraw.toFixed(4)
    }));
  };

  const getProcessingInfo = (method: string) => {
    const info = {
      bank: { time: "3-5 business days", fee: "2.5%" },
      paypal: { time: "1-2 business days", fee: "3.0%" },
      venmo: { time: "1-2 business days", fee: "2.0%" },
      cashapp: { time: "1-2 business days", fee: "2.0%" },
      crypto: { time: "10-30 minutes", fee: "1.0%" },
    };
    return info[method as keyof typeof info] || { time: "Unknown", fee: "0%" };
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <div className="h-8 bg-muted rounded animate-pulse mb-4" />
            <div className="h-64 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="withdraw-page">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/wallet")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">Withdraw Funds</h1>
        </div>

        {/* Balance Display */}
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Available Balance</div>
              <div className="text-3xl font-bold text-primary">
                {parseFloat(walletData?.dopeBalance || "0").toFixed(4)} DOPE
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ ${(parseFloat(walletData?.dopeBalance || "0") * 0.25).toFixed(2)} USD
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal Form */}
        <Card>
          <CardHeader>
            <CardTitle>Withdrawal Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount">Withdrawal Amount (DOPE)</Label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={setMaxAmount}
                    className="h-auto p-0 text-xs"
                  >
                    Max: {Math.max(0, parseFloat(walletData?.dopeBalance || "0") - 1).toFixed(4)}
                  </Button>
                </div>
                <Input
                  id="amount"
                  type="number"
                  step="0.0001"
                  min="10"
                  placeholder="10.0000"
                  value={withdrawForm.amount}
                  onChange={(e) =>
                    setWithdrawForm(prev => ({ ...prev, amount: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Minimum withdrawal: 10 DOPE
                </p>
              </div>

              {/* Withdrawal Method */}
              <div className="space-y-2">
                <Label>Withdrawal Method</Label>
                <Select
                  value={withdrawForm.method}
                  onValueChange={(value: "bank" | "paypal" | "venmo" | "cashapp" | "crypto") =>
                    setWithdrawForm(prev => ({ ...prev, method: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select withdrawal method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        Bank Transfer (ACH)
                      </div>
                    </SelectItem>
                    <SelectItem value="paypal">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        PayPal
                      </div>
                    </SelectItem>
                    <SelectItem value="venmo">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        Venmo
                      </div>
                    </SelectItem>
                    <SelectItem value="cashapp">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        Cash App
                      </div>
                    </SelectItem>
                    <SelectItem value="crypto">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Cryptocurrency (USDC)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {withdrawForm.method && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span>Processing Time:</span>
                      <span className="font-medium">{getProcessingInfo(withdrawForm.method).time}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Processing Fee:</span>
                      <span className="font-medium">{getProcessingInfo(withdrawForm.method).fee}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Method-specific fields */}
              {withdrawForm.method === "bank" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="bankName">Bank Name</Label>
                      <Input
                        id="bankName"
                        placeholder="Chase, Bank of America, etc."
                        value={withdrawForm.accountDetails.bankName}
                        onChange={(e) =>
                          setWithdrawForm(prev => ({
                            ...prev,
                            accountDetails: { ...prev.accountDetails, bankName: e.target.value }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="accountHolder">Account Holder Name</Label>
                      <Input
                        id="accountHolder"
                        placeholder="John Doe"
                        value={withdrawForm.accountDetails.accountHolder}
                        onChange={(e) =>
                          setWithdrawForm(prev => ({
                            ...prev,
                            accountDetails: { ...prev.accountDetails, accountHolder: e.target.value }
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <Input
                        id="accountNumber"
                        placeholder="1234567890"
                        value={withdrawForm.accountDetails.accountNumber}
                        onChange={(e) =>
                          setWithdrawForm(prev => ({
                            ...prev,
                            accountDetails: { ...prev.accountDetails, accountNumber: e.target.value }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="routingNumber">Routing Number</Label>
                      <Input
                        id="routingNumber"
                        placeholder="021000021"
                        value={withdrawForm.accountDetails.routingNumber}
                        onChange={(e) =>
                          setWithdrawForm(prev => ({
                            ...prev,
                            accountDetails: { ...prev.accountDetails, routingNumber: e.target.value }
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {(withdrawForm.method === "paypal" || withdrawForm.method === "venmo" || withdrawForm.method === "cashapp") && (
                <div>
                  <Label htmlFor="email">
                    {withdrawForm.method === "paypal" ? "PayPal Email" : 
                     withdrawForm.method === "venmo" ? "Venmo Username/Email" :
                     "Cash App Username/Email"}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={
                      withdrawForm.method === "paypal" ? "user@paypal.com" :
                      withdrawForm.method === "venmo" ? "@username or email" :
                      "$username or email"
                    }
                    value={withdrawForm.accountDetails.email}
                    onChange={(e) =>
                      setWithdrawForm(prev => ({
                        ...prev,
                        accountDetails: { ...prev.accountDetails, email: e.target.value }
                      }))
                    }
                  />
                </div>
              )}

              {withdrawForm.method === "crypto" && (
                <div>
                  <Label htmlFor="cryptoAddress">USDC Address (Stellar Network)</Label>
                  <Input
                    id="cryptoAddress"
                    placeholder="GA... (Stellar address)"
                    value={withdrawForm.accountDetails.cryptoAddress}
                    onChange={(e) =>
                      setWithdrawForm(prev => ({
                        ...prev,
                        accountDetails: { ...prev.accountDetails, cryptoAddress: e.target.value }
                      }))
                    }
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    DOPE will be converted to USDC and sent to your Stellar address
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitWithdrawal.isPending || !withdrawForm.amount || !withdrawForm.method}
              >
                {submitWithdrawal.isPending
                  ? "Processing..."
                  : `Withdraw ${withdrawForm.amount || "0"} DOPE`}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Withdrawals are processed manually and may take up to the stated processing time. 
            Please ensure all account details are correct as incorrect information may delay your withdrawal.
            A processing fee will be deducted from your withdrawal amount.
          </AlertDescription>
        </Alert>

        {/* PIN Verification Modal */}
        {showPinVerification && user && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <PinVerification
                walletId={localStorage.getItem(`walletId_${user.id}`) || ""}
                onVerified={handlePinVerified}
                onCancel={handlePinCancel}
                title="Authorize Withdrawal"
                description={`Enter your PIN to withdraw ${withdrawForm.amount} DOPE via ${withdrawForm.method}.`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
