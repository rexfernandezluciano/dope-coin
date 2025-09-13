import { Bell, Coins } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth.js";
import { Button } from "@/components/ui/button.js";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header
      className="sticky top-0 z-50 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-b border-border shadow-sm"
      data-testid="header-navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="flex items-center space-x-2"
              data-testid="link-home"
            >
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center">
                <Coins className="text-white text-sm" />
              </div>
              <span className="text-xl font-bold text-primary">DOPE Coin</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard">
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Dashboard
              </span>
            </Link>
            <Link href="/wallet">
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Wallet
              </span>
            </Link>
            <Link href="/mining">
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Mining
              </span>
            </Link>
            <Link href="/transactions">
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                History
              </span>
            </Link>
            <Link href="/referrals">
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Referrals
              </span>
            </Link>
            <Link href="/profile">
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Profile
              </span>
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            <button
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              data-testid="button-notifications"
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
            </button>
            {user && (
              <Link className="flex items-center space-x-3" href="/profile">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center">
                  <span
                    className="text-sm font-semibold text-white"
                    data-testid="user-initials"
                  >
                    {user.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
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
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
