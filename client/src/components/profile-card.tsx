
import { useAuth } from "../hooks/use-auth.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Shield, Edit, User } from "lucide-react";
import { Link } from "wouter";

export function ProfileCard() {
  const { user } = useAuth();

  if (!user) return null;

  const initials = user.fullName.split(' ').map(n => n[0]).join('').toUpperCase();
  const joinDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short' 
  });

  return (
    <Card data-testid="profile-card" className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4 mb-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/70 p-0.5">
              <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
                {user.profilePicture ? (
                  <img 
                    src={user.profilePicture} 
                    alt={user.fullName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <span className="text-lg font-bold text-primary" data-testid="user-initials">
                      {initials}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {user.isVerified && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Shield className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate" data-testid="user-name">
              {user.fullName}
            </h3>
            <p className="text-sm text-muted-foreground truncate" data-testid="user-email">
              {user.email}
            </p>
            <div className="flex items-center mt-1">
              <Shield className={`w-3 h-3 mr-1 ${user.isVerified ? 'text-green-500' : 'text-gray-400'}`} />
              <span className={`text-xs ${user.isVerified ? 'text-green-500' : 'text-gray-400'}`} data-testid="verification-status">
                {user.isVerified ? 'Verified' : 'Not Verified'}
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
            <span className="font-medium text-primary" data-testid="user-level">
              Level {user.level}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Referral Code</span>
            <span className="font-medium font-mono text-xs bg-muted px-2 py-1 rounded" data-testid="referral-code">
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
