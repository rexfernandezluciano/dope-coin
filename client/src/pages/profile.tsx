import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { AuthService } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { User, Copy, Check } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user?.fullName || "",
    profilePicture: "",
  });

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["/api/protected/profile"],
  });

  const updateProfile = useMutation({
    mutationFn: (data: typeof formData) => 
      AuthService.authenticatedRequest("PUT", "/api/protected/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protected/profile"] });
      setIsEditing(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(formData);
  };

  const copyReferralCode = async () => {
    if (user?.referralCode) {
      await navigator.clipboard.writeText(user.referralCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Referral code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded animate-pulse" />
              <div className="h-32 bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = user?.fullName.split(' ').map(n => n[0]).join('') || "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="profile-page">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="w-5 h-5 mr-2" />
            Profile Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Profile Picture Section */}
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary to-accent p-1">
              <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
                <span className="text-2xl font-semibold text-secondary" data-testid="profile-initials">
                  {initials}
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold">{user?.fullName}</h3>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                disabled={!isEditing}
                data-testid="input-fullname"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user?.email || ""}
                disabled
                className="bg-muted"
                data-testid="input-email"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={user?.username || ""}
                disabled
                className="bg-muted"
                data-testid="input-username"
              />
              <p className="text-xs text-muted-foreground">Username cannot be changed</p>
            </div>

            <div className="flex gap-3">
              {!isEditing ? (
                <Button 
                  type="button" 
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit"
                >
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button 
                    type="submit" 
                    disabled={updateProfile.isPending}
                    data-testid="button-save"
                  >
                    {updateProfile.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        fullName: user?.fullName || "",
                        profilePicture: "",
                      });
                    }}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </form>

          {/* Account Stats */}
          <div className="pt-6 border-t border-border">
            <h4 className="text-sm font-medium mb-3">Account Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Mining Level</div>
                <div className="text-lg font-semibold text-secondary" data-testid="user-level">
                  Level {user?.level}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground">Total Earnings</div>
                <div className="text-lg font-semibold text-success" data-testid="total-earnings">
                  {parseFloat(profileData?.wallet?.dopeBalance || "0").toFixed(4)} DOPE
                </div>
              </div>
            </div>
          </div>

          {/* Referral Section */}
          <div className="pt-6 border-t border-border">
            <h4 className="text-sm font-medium mb-3">Referral Program</h4>
            <div className="flex items-center space-x-3">
              <div className="flex-1">
                <Label htmlFor="referralCode">Your Referral Code</Label>
                <Input
                  id="referralCode"
                  value={user?.referralCode || ""}
                  readOnly
                  className="font-mono"
                  data-testid="referral-code-input"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyReferralCode}
                className="mt-6"
                data-testid="button-copy-referral"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share your referral code to earn bonus DOPE tokens when friends join!
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
