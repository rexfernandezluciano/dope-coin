import { Home, Pickaxe, Wallet, User } from "lucide-react";
import { Link, useLocation } from "wouter";

export function MobileNav() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Dashboard" },
    { href: "/mining", icon: Pickaxe, label: "Mining" },
    { href: "/wallet", icon: Wallet, label: "Wallet" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50 shadow-lg" data-testid="mobile-nav">
        <div className="grid grid-cols-4 py-1 px-2 max-w-md mx-auto">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}>
              <div 
                className={`flex flex-col items-center py-2 px-1 rounded-lg transition-all duration-200 ${
                  location === href 
                    ? 'text-primary bg-accent/20' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
                }`}
                data-testid={`nav-${label.toLowerCase()}`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium truncate max-w-full">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </nav>
      {/* Add padding for mobile navigation */}
      <div className="h-20 md:hidden" />
    </>
  );
}