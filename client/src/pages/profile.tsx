
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AuthService } from "@/lib/auth";
import { User, Mail, Shield, Copy, CheckCircle, AlertCircle } from "lucide-react";

export default function ProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    fullName: "",
    profilePicture: "",
  });
  const [verificationCode, setVerificationCode] = useState("");

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["/api/protected/profile"],
  }) as any;

  const updateProfile = useMutation({
    mutationFn: (data: typeof formData) =>
      AuthService.authenticatedRequest("PUT", "/api/protected/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/profile"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendVerification = useMutation({
    mutationFn: () =>
      AuthService.authenticatedRequest("POST", "/api/protected/send-verification"),
    onSuccess: () => {
      toast({
        title: "Verification email sent",
        description: "Check your email for the verification code.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to send verification",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyEmail = useMutation({
    mutationFn: (code: string) =>
      AuthService.authenticatedRequest("POST", "/api/protected/verify-email", { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/profile"] });
      setVerificationCode("");
      toast({
        title: "Email verified!",
        description: "Your email has been verified successfully. You earned 5 DOPE coins!",
      });
    },
    onError: (error) => {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(formData);
  };

  const copyAddress = () => {
    if (profileData?.user?.stellarPublicKey) {
      navigator.clipboard.writeText(profileData.user.stellarPublicKey);
      toast({
        title: "Address copied!",
        description: "Your Stellar address has been copied to clipboard.",
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
    <div className="max-w-4xl mx-auto px-4 py-8" data-testid="profile-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={formData.fullName || profileData?.user?.fullName || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder={profileData?.user?.fullName || "Enter your full name"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profilePicture">Profile Picture URL</Label>
                <Input
                  id="profilePicture"
                  value={formData.profilePicture || profileData?.user?.profilePicture || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, profilePicture: e.target.value }))}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? "Updating..." : "Update Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Username</span>
                <span className="text-sm text-muted-foreground">{profileData?.user?.username}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Email</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">{profileData?.user?.email}</span>
                  {profileData?.user?.isVerified ? (
                    <Badge variant="default" className="text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Unverified
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Level</span>
                <Badge variant="outline">{profileData?.user?.level}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Referral Code</span>
                <span className="text-sm font-mono">{profileData?.user?.referralCode}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Member Since</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(profileData?.user?.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Verification */}
        {!profileData?.user?.isVerified && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="w-5 h-5 mr-2" />
                Email Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Verify your email to unlock all features and earn 5 DOPE coins!
              </p>
              
              <Button 
                onClick={() => sendVerification.mutate()}
                disabled={sendVerification.isPending}
                className="w-full"
              >
                {sendVerification.isPending ? "Sending..." : "Send Verification Email"}
              </Button>
              
              <div className="space-y-2">
                <Label htmlFor="verificationCode">Verification Code</Label>
                <div className="flex space-x-2">
                  <Input
                    id="verificationCode"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                  />
                  <Button 
                    onClick={() => verifyEmail.mutate(verificationCode)}
                    disabled={verifyEmail.isPending || verificationCode.length !== 6}
                  >
                    Verify
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stellar Address */}
        <Card>
          <CardHeader>
            <CardTitle>Stellar Wallet Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your unique Stellar address for receiving DOPE coins and XLM
            </p>
            
            <div className="flex space-x-2">
              <Input
                value={profileData?.user?.stellarPublicKey || ""}
                readOnly
                className="font-mono text-xs"
              />
              <Button onClick={copyAddress} variant="outline" size="icon">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Share this address with others to receive DOPE coins directly
            </div>
          </CardContent>
        </Card>

        {/* Account Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Account Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg">
                <div className="text-lg font-bold text-secondary">
                  {profileData?.stats?.totalSessions || 0}
                </div>
                <div className="text-sm text-muted-foreground">Mining Sessions</div>
              </div>
              
              <div className="text-center p-3 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <div className="text-lg font-bold text-accent">
                  {parseFloat(profileData?.stats?.totalEarned || "0").toFixed(4)}
                </div>
                <div className="text-sm text-muted-foreground">DOPE Earned</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
