
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Copy, Users, Gift, Clock } from "lucide-react";
import { useToast } from "../hooks/use-toast.js";
import { useAuth } from "../hooks/use-auth.js";

export default function ReferralsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: referralData, isLoading } = useQuery({
    queryKey: ["/api/protected/referrals"],
  }) as any;

  const copyReferralCode = () => {
    if (user?.referralCode) {
      const referralLink = `${window.location.origin}/register?ref=${user.referralCode}`;
      navigator.clipboard.writeText(referralLink);
      toast({
        title: "Referral link copied!",
        description: "Share this link with friends to earn DOPE coins.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="h-8 bg-muted rounded animate-pulse mb-4" />
              <div className="h-24 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" data-testid="referrals-page">
      <div className="space-y-6">
        
        {/* Referral Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Gift className="w-5 h-5 mr-2" />
              Referral Program
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Invite friends to join DOPE Coin and earn rewards! You'll receive 1 DOPE coin for each successful referral.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg">
                <Users className="w-8 h-8 text-secondary mx-auto mb-2" />
                <div className="text-2xl font-bold text-secondary">
                  {referralData?.totalReferrals || 0}
                </div>
                <div className="text-sm text-muted-foreground">Total Referrals</div>
              </div>
              
              <div className="text-center p-4 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <Clock className="w-8 h-8 text-accent mx-auto mb-2" />
                <div className="text-2xl font-bold text-accent">
                  {referralData?.activeReferrals || 0}
                </div>
                <div className="text-sm text-muted-foreground">Active Referrals</div>
              </div>
              
              <div className="text-center p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg">
                <Gift className="w-8 h-8 text-primary mx-auto mb-2" />
                <div className="text-2xl font-bold text-primary">
                  {(referralData?.totalReferrals || 0) * 1}
                </div>
                <div className="text-sm text-muted-foreground">DOPE Earned</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Share Referral Link */}
        <Card>
          <CardHeader>
            <CardTitle>Your Referral Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="referralCode">Referral Code</Label>
              <div className="flex space-x-2">
                <Input
                  id="referralCode"
                  value={user?.referralCode || ""}
                  readOnly
                  className="font-mono"
                />
                <Button onClick={copyReferralCode} variant="outline" size="icon">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="referralLink">Full Referral Link</Label>
              <div className="flex space-x-2">
                <Input
                  id="referralLink"
                  value={user?.referralCode ? `${window.location.origin}/register?ref=${user.referralCode}` : ""}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button onClick={copyReferralCode} variant="outline" size="icon">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Share this link with friends. When they register and verify their account, you'll both receive bonus DOPE coins!
            </div>
          </CardContent>
        </Card>

        {/* Referral List */}
        {referralData?.referrals && referralData.referrals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {referralData.referrals.map((referral: any) => (
                  <div key={referral.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center">
                        <span className="text-sm font-semibold text-white">
                          {referral.fullName.split(' ').map((n: string) => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">{referral.fullName}</div>
                        <div className="text-sm text-muted-foreground">@{referral.username}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">Level {referral.level}</div>
                      <div className="text-xs text-muted-foreground">
                        Joined {new Date(referral.joinedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
