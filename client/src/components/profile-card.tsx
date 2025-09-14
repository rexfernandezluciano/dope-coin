import { useAuth } from "../hooks/use-auth.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Shield, Edit } from "lucide-react";
import { Link } from "wouter";

export function ProfileCard() {
  const { user } = useAuth();

  if (!user) return null;

  const initials = user.fullName.split(' ').map(n => n[0]).join('');
  const joinDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short' 
  });

  return (
    <Card data-testid="profile-card">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary to-accent p-1">
            <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
              <span className="text-xl font-semibold text-secondary" data-testid="user-initials">
                {initials}
              </span>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-foreground" data-testid="user-name">
              {user.fullName}
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="user-email">
              {user.email}
            </p>
            <div className="flex items-center mt-1">
              <Shield className="w-3 h-3 text-success mr-1" />
              <span className="text-xs text-success" data-testid="verification-status">
                Verified
              </span>
            </div>
          </div>
        </div>
        
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium" data-testid="join-date">{joinDate}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mining Level</span>
            <span className="font-medium text-secondary" data-testid="user-level">
              Level {user.level}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Referral Code</span>
            <span className="font-medium font-mono" data-testid="referral-code">
              {user.referralCode}
            </span>
          </div>
        </div>
        
        <Link href="/profile">
          <Button 
            variant="outline" 
            className="w-full mt-4"
            data-testid="button-edit-profile"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
