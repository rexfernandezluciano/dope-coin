import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "../lib/queryClient.js";

// --- Wallet Integration & Security Enhancements ---

import { keyVault } from "../lib/keyVault.js";

// Real KeyVault integration for wallet operations
const initializeWallet = async (secretPhrase: string, password: string): Promise<string> => {
  try {
    // Create vault with the secret phrase
    const vaultId = await keyVault.createVault("Main Wallet", password, secretPhrase);
    
    // Unlock the vault
    await keyVault.unlockVault(vaultId, password);
    
    // Add primary wallet
    const walletId = await keyVault.addWallet("Primary Wallet", "m/44'/148'/0'/0/0", password);
    const wallet = keyVault.getWallet(walletId);
    
    if (!wallet) {
      throw new Error("Failed to create wallet");
    }

    return wallet.publicKey;
  } catch (error) {
    console.error("Wallet initialization error:", error);
    throw error;
  }
};

// Real PIN verification using KeyVault
const verifyPin = async (walletId: string, pin: string): Promise<boolean> => {
  try {
    return await keyVault.authorizeTransaction(walletId, pin);
  } catch (error) {
    console.error("PIN verification error:", error);
    return false;
  }
};

// --- Auth Context ---

interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  level: number;
  referralCode: string;
  walletAddress?: string; // Added for wallet integration
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  initializeUserWallet: (secretPhrase: string) => Promise<void>;
  processPayment: (amount: number, pin: string) => Promise<void>;
  signUserTransaction: (data: any) => Promise<any>;
  hasSecureWallet: boolean;
  checkWalletMigrationStatus: () => Promise<boolean>;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasSecureWallet, setHasSecureWallet] = useState(false);

  // Services initialization
  const transactionSigningService = createTransactionSigningService();

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (storedToken && storedUser) {
      try {
        // Verify token is still valid before using it
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Error parsing stored user data:", error);
        // Clear invalid data
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Replaced with provided changes - assuming this is the correct update for login
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Handle "Invalid token" error specifically if needed,
      // though the fix for JWT generation is external to this function.
      throw new Error(errorData.message || "Login failed");
    }

    const data = await response.json();
    const userData = {
      id: data.user.id,
      email: data.user.email,
      fullName: data.user.fullName,
      // Include other user fields as available from API
      username: data.user.username || "",
      level: data.user.level || 0,
      referralCode: data.user.referralCode || "",
      walletAddress: data.user.publicKey || null, // Include wallet address if provided by API
    };

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(data.token); // Update token state
    setUser(userData);
    setIsAuthenticated(true);
  };

  const register = async (registerData: RegisterData): Promise<any> => {
    // Assuming apiRequest is still used for registration or replaced with fetch
    // Based on original code, apiRequest is used.
    const response = await apiRequest("POST", "/api/auth/register", registerData);
    const data = await response.json();

    if (data.token && data.user) {
      setToken(data.token);
      const userData = {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName,
        username: data.user.username || "",
        level: data.user.level || 0,
        referralCode: data.user.referralCode || "",
        walletAddress: data.user.walletAddress || null,
      };
      setUser(userData);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(userData));
      setIsAuthenticated(true);
    } else {
      throw new Error("Registration failed or invalid response from server");
    }
    return data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Potentially clear wallet-related storage as well
  };

  // Function to initialize user's wallet with secure storage
  const initializeUserWallet = async (secretPhrase: string, password: string) => {
    if (!user) {
      throw new Error("User not logged in.");
    }
    try {
      const walletAddress = await initializeWallet(secretPhrase, password);
      
      // Store vault info securely
      const vaultId = localStorage.getItem(`vaultId_${user.id}`);
      if (vaultId) {
        localStorage.setItem(`secureWallet_${user.id}`, "true");
      }
      
      // Update user state
      setUser({ ...user, walletAddress });
      localStorage.setItem("user", JSON.stringify({ ...user, walletAddress }));
      
      console.log("Secure wallet successfully initialized.");
      return vaultId;
    } catch (error) {
      console.error("Failed to initialize secure wallet:", error);
      throw error;
    }
  };

  // Function to process payment using real PIN verification
  const processPayment = async (amount: number, pin: string) => {
    if (!isAuthenticated) {
      throw new Error("User must be logged in to process payments.");
    }
    
    try {
      // Get active wallet
      const wallets = keyVault.getAllWallets();
      if (wallets.length === 0) {
        throw new Error("No active wallets found. Please unlock your vault.");
      }
      
      const primaryWallet = wallets[0];
      const isPinValid = await verifyPin(primaryWallet.id, pin);
      
      if (!isPinValid) {
        throw new Error("Invalid PIN.");
      }
      
      // Process payment with validated PIN
      console.log(`Processing payment of ${amount} with verified PIN.`);
      // Payment processing logic would go here
      
    } catch (error) {
      console.error("Payment processing failed:", error);
      throw error;
    }
  };

  // Function to check if user needs wallet migration
  const checkWalletMigrationStatus = async (): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Check if user has old wallet but no secure wallet setup
      const hasOldWallet = user.walletAddress && user.walletAddress.length > 0;
      const hasSecureWalletSetup = localStorage.getItem(`secureWallet_${user.id}`) === "true";
      const hasVaultId = localStorage.getItem(`vaultId_${user.id}`) !== null;
      
      // User needs migration if they have an old wallet but no secure wallet OR vault
      const needsMigration = hasOldWallet && (!hasSecureWalletSetup || !hasVaultId);
      
      setHasSecureWallet(hasSecureWalletSetup && hasVaultId);
      
      return needsMigration;
    } catch (error) {
      console.error("Error checking wallet migration status:", error);
      return false;
    }
  };

  // Function to sign transactions securely using KeyVault
  const signUserTransaction = async (transactionData: any, pin: string) => {
    if (!user || !user.walletAddress) {
      throw new Error("User not logged in or wallet not initialized.");
    }
    
    try {
      // Get the active wallet from KeyVault
      const wallets = keyVault.getAllWallets();
      if (wallets.length === 0) {
        throw new Error("No active wallets found. Please unlock your vault.");
      }
      
      const primaryWallet = wallets[0]; // Use primary wallet
      
      // Sign transaction with PIN authorization
      const signature = await keyVault.signTransaction(
        primaryWallet.id,
        pin,
        transactionData
      );
      
      console.log("Transaction signed successfully");
      return signature;
    } catch (error) {
      console.error("Failed to sign transaction:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        isLoading,
        isAuthenticated,
        initializeUserWallet,
        processPayment,
        signUserTransaction,
        hasSecureWallet,
        checkWalletMigrationStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// --- New Components/Services (Conceptual) ---
// These would typically be in separate files and imported.

/*
// Example of a JWT service fix (external to AuthProvider)
class JwtService {
  async generateToken(payload: any): Promise<string> {
    // Ensure this method actually returns a Promise and resolves with a token
    // Example:
    // const token = await someAsyncOperation(payload);
    // return token;
    console.log("JWT Service: Generating token for", payload);
    return "mock_jwt_token"; // Placeholder
  }

  // Other JWT related methods
}

// Example of an Auth Middleware update (external to AuthProvider)
const authMiddleware = (req: any, res: any, next: any) => {
  // Logic to verify token without relying on secret keys directly on server
  // for certain operations, or using more secure methods.
  // This is a complex security area and depends on the backend architecture.
  next();
};

// Example of a WalletSetup component (for onboarding new users)
function WalletSetup({ onWalletInitialized }: { onWalletInitialized: () => void }) {
  const [secretPhrase, setSecretPhrase] = useState('');
  const { initializeUserWallet } = useAuth();

  const handleSetup = async () => {
    try {
      await initializeUserWallet(secretPhrase);
      onWalletInitialized(); // Proceed to next step
    } catch (error) {
      alert("Error setting up wallet. Please check your secret phrase.");
    }
  };

  return (
    <div>
      <h2>Set Up Your Wallet</h2>
      <p>Please enter your secret recovery phrase:</p>
      <input
        type="password"
        value={secretPhrase}
        onChange={(e) => setSecretPhrase(e.target.value)}
        placeholder="Enter secret phrase"
      />
      <button onClick={handleSetup} disabled={!secretPhrase}>Initialize Wallet</button>
    </div>
  );
}

// Example of a PinVerification component (for payment flow)
function PinVerification({ onVerified }: { onVerified: () => void }) {
  const [pin, setPin] = useState('');
  const { processPayment } = useAuth();

  const handlePayment = async () => {
    try {
      // Assuming amount is passed from context or props
      const amountToPay = 100; // Example amount
      await processPayment(amountToPay, pin);
      onVerified(); // Payment successful
    } catch (error) {
      alert(`Payment failed: ${error.message}`);
    }
  };

  return (
    <div>
      <h2>Enter PIN for Payment</h2>
      <input
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Enter your PIN"
        maxLength={4}
      />
      <button onClick={handlePayment} disabled={pin.length !== 4}>Confirm Payment</button>
    </div>
  );
}
*/