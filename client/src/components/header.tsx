import { Bell, Coins } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-card border-b border-border shadow-sm" data-testid="header-navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <a className="flex items-center space-x-2" data-testid="link-home">
                <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center">
                  <Coins className="text-white text-sm" />
                </div>
                <span className="text-xl font-bold text-primary">DOPE Coin</span>
              </a>
            </Link>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            <Link href="/">
              <a className="text-muted-foreground hover:text-primary font-medium" data-testid="nav-dashboard">
                Dashboard
              </a>
            </Link>
            <Link href="/profile">
              <a className="text-muted-foreground hover:text-primary font-medium" data-testid="nav-profile">
                Profile
              </a>
            </Link>
          </nav>
          
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-lg hover:bg-muted transition-colors" data-testid="button-notifications">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </button>
            {user && (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center">
                  <span className="text-sm font-semibold text-white" data-testid="user-initials">
                    {user.fullName.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={logout}
                  data-testid="button-logout"
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
