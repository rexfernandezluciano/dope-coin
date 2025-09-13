
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownLeft, ArrowLeft, Copy, QrCode, Share } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function ReceivePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["/api/protected/profile"],
    refetchInterval: 30000,
  }) as any;

  const stellarAddress = profileData?.user?.stellarPublicKey || "";

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copied!",
        description: `${label} has been copied to clipboard.`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const shareAddress = async () => {
    const shareData = {
      title: "My DOPE Coin Wallet Address",
      text: `Send DOPE coins or XLM to my Stellar address: ${stellarAddress}`,
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast({
          title: "Shared successfully",
          description: "Your wallet address has been shared.",
        });
      } catch (err) {
        // User cancelled sharing
      }
    } else {
      // Fallback to clipboard
      copyToClipboard(`${shareData.text}`, "Wallet address");
    }
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
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="receive-page">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">Receive Tokens</h1>
        </div>

        {/* Wallet Address Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <ArrowDownLeft className="w-5 h-5 mr-2 text-success" />
              Your Stellar Wallet Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Stellar Public Key</Label>
              <div className="flex space-x-2">
                <Input
                  value={stellarAddress}
                  readOnly
                  className="font-mono text-xs bg-muted"
                  data-testid="stellar-address"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(stellarAddress, "Stellar address")}
                  data-testid="button-copy-address"
                >
                  <Copy className={`w-4 h-4 ${copied ? "text-success" : ""}`} />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Share this address to receive DOPE coins or XLM tokens
              </p>
            </div>

            <div className="flex space-x-2 pt-2">
              <Button
                onClick={shareAddress}
                className="flex-1"
                data-testid="button-share"
              >
                <Share className="w-4 h-4 mr-2" />
                Share Address
              </Button>
              
              <Button
                variant="outline"
                onClick={() => copyToClipboard(stellarAddress, "Wallet address")}
                data-testid="button-copy"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QR Code Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <QrCode className="w-5 h-5 mr-2" />
              QR Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center space-y-2">
                  <QrCode className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">QR Code</p>
                  <p className="text-xs text-muted-foreground">Coming Soon</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Scan this QR code to send tokens to your wallet
              </p>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Username:</span>
                <span className="text-sm font-medium">{user?.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Email:</span>
                <span className="text-sm font-medium">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Level:</span>
                <span className="text-sm font-medium">Level {user?.level}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-900">
          <CardContent className="p-4">
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-2">How to receive tokens:</p>
              <ul className="space-y-1 text-sm">
                <li>• Share your Stellar address with the sender</li>
                <li>• Or have them scan your QR code (coming soon)</li>
                <li>• Both DOPE coins and XLM can be sent to this address</li>
                <li>• Transactions usually confirm within 5 seconds</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
