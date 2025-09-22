import { useState } from "react";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.js";
import { Alert, AlertDescription } from "./ui/alert.js";
import { Wallet, Shield, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { Label } from "../components/ui/label.js";
import { keyVault } from "../lib/keyVault.js";
import { useAuth } from "../hooks/use-auth.js";

interface WalletSetupProps {
  onComplete: (vaultId: string) => void;
}

export function WalletSetup({ onComplete }: WalletSetupProps) {
  const { user, migrateWallet, prepareWalletMigration } = useAuth();
  const [activeTab, setActiveTab] = useState("create");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(1);
  const [walletName, setWalletName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [isLocked, setIsLocked] = useState(true);

  // Create new wallet states
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [generatedMnemonic, setGeneratedMnemonic] = useState("");
  const [mnemonicConfirmed, setMnemonicConfirmed] = useState(false);

  // Import wallet states
  const [importMnemonic, setImportMnemonic] = useState("");
  const [importPassword, setImportPassword] = useState("");

  // Migration states
  const [oldSecretKey, setOldSecretKey] = useState("");
  const [migrationPassword, setMigrationPassword] = useState("");
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStep, setMigrationStep] = useState(1);

  const generateMnemonic = () => {
    const generated = keyVault.generateMnemonic(256); // 24 words
    setGeneratedMnemonic(generated);
    setStep(2);
  };

  const copyMnemonic = async () => {
    await navigator.clipboard.writeText(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateWallet = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    setIsCreating(true);
    setError('');
    
    try {
      console.log('Creating secure vault with wallet...');

      // Step 1: Create vault with generated mnemonic
      const mnemonic = keyVault.generateMnemonic(128); // 12 words for faster generation
      const vaultId = await keyVault.createVault(walletName || 'Main Vault', password, mnemonic);
      
      console.log('Vault created, unlocking...');
      // Step 2: Unlock the vault
      await keyVault.unlockVault(vaultId, password);
      
      console.log('Adding primary wallet to vault...');
      // Step 3: Add wallet to the vault (this saves to both memory and vault storage)
      const walletId = await keyVault.addWallet('Primary Wallet', "m/44'/148'/0'/0/0", password);
      
      // Step 4: Verify wallet was created
      const wallets = keyVault.getAllWallets();
      console.log('Wallets in memory:', wallets.length);
      
      if (wallets.length === 0) {
        throw new Error('Wallet was not properly created in vault');
      }

      const primaryWallet = wallets[0];
      const secretKey = primaryWallet.keypair.secret();

      console.log('Establishing secure session with backend...');
      // Step 5: Store PIN and establish session
      await keyVault.authorizeTransaction(walletId, pin);
      
      // Step 6: Sync with backend
      const response = await fetch('/api/protected/wallet/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          secretKey,
          pin
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to establish secure wallet session');
      }

      // Step 7: Store vault ID and completion
      localStorage.setItem(`vaultId_${user?.id}`, vaultId);
      localStorage.setItem(`walletPin_${user?.id}`, pin);
      
      setSuccess('Secure wallet created successfully!');
      setTimeout(() => onComplete(vaultId), 1500);

    } catch (error: any) {
      console.error('Wallet creation failed:', error);
      setError(`Failed to create wallet: ${error.message}`);
      
      // Clean up on failure
      try {
        await keyVault.lockVault();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportWallet = async () => {
    if (!importMnemonic || !importPassword || !pin) {
      setError("Please fill in all fields including PIN");
      return;
    }

    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      // Validate mnemonic first
      const normalizedMnemonic = importMnemonic.trim();
      if (!keyVault.validateMnemonic(normalizedMnemonic)) {
        throw new Error("Invalid mnemonic phrase. Please check your seed phrase.");
      }

      console.log('Creating vault with imported mnemonic...');
      // Create vault with imported mnemonic
      const vaultId = await keyVault.createVault("Imported Wallet", importPassword, normalizedMnemonic);

      console.log('Unlocking imported vault...');
      // Unlock vault
      await keyVault.unlockVault(vaultId, importPassword);

      console.log('Adding wallet to imported vault...');
      // Add primary wallet to new vault (this saves to vault storage)
      const walletId = await keyVault.addWallet("Primary Wallet", "m/44'/148'/0'/0/0", importPassword);

      // Verify wallet was created
      const wallets = keyVault.getAllWallets();
      console.log('Imported wallets in memory:', wallets.length);
      
      if (wallets.length === 0) {
        throw new Error('Imported wallet was not properly created in vault');
      }

      // Set up PIN and session
      const primaryWallet = wallets[0];
      await keyVault.authorizeTransaction(walletId, pin);
      
      // Store references
      localStorage.setItem(`vaultId_${user?.id}`, vaultId);
      localStorage.setItem(`walletPin_${user?.id}`, pin);

      // Try to establish backend session
      try {
        const secretKey = primaryWallet.keypair.secret();
        const response = await fetch('/api/protected/wallet/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            secretKey,
            pin
          })
        });

        if (!response.ok) {
          console.warn('Failed to establish backend session, but wallet imported locally');
        }
      } catch (sessionError) {
        console.warn('Backend session setup failed:', sessionError);
      }

      setSuccess("Wallet imported successfully with PIN protection!");
      setTimeout(() => onComplete(vaultId), 1500);

    } catch (error) {
      console.error("Import wallet error:", error);
      setError(error instanceof Error ? error.message : "Failed to import wallet");
    } finally {
      setIsCreating(false);
    }
  };

  const handleMigrateWallet = async () => {
    if (!oldSecretKey || !migrationPassword) {
      setError("Please enter both your old secret key and new password");
      return;
    }

    setIsMigrating(true);
    setError("");

    try {
      // Step 1: Create new secure vault
      setMigrationStep(1);
      const newMnemonic = keyVault.generateMnemonic(128);
      const vaultId = await keyVault.createVault("Migrated Wallet", migrationPassword, newMnemonic);

      // Unlock new vault
      await keyVault.unlockVault(vaultId, migrationPassword);

      // Add primary wallet to new vault
      await keyVault.addWallet("Primary Wallet", "m/44'/148'/0'/0/0", migrationPassword);

      // Get new wallet public key
      const wallets = keyVault.getAllWallets();
      if (wallets.length === 0) {
        throw new Error("Failed to create new wallet");
      }
      const newPublicKey = wallets[0].publicKey;

      console.log("New wallet public key:", newPublicKey);

      if (!newPublicKey) {
        throw new Error("Failed to retrieve new wallet public key");
      }

      // Step 2: Prepare old account for migration
      setMigrationStep(2);
      await prepareWalletMigration(oldSecretKey);

      // Step 3: Perform account merge
      setMigrationStep(3);
      const migrationResult = await migrateWallet(oldSecretKey, newPublicKey);

      setSuccess(`Migration completed! Transferred ${migrationResult.balancesTransferred.length} assets to new secure wallet.`);
      setTimeout(() => onComplete(vaultId), 2000);

    } catch (error) {
      console.error("Migration error:", error);
      setError(error instanceof Error ? error.message : "Failed to migrate wallet");
    } finally {
      setIsMigrating(false);
      setMigrationStep(1);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Create New
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Import Existing
          </TabsTrigger>
          <TabsTrigger value="migrate" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Migrate Wallet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-6">
          <CardHeader className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Create Your Secure Wallet</CardTitle>
            <p className="text-sm text-muted-foreground">
              Set up a secure wallet with PIN protection for DOPE transactions
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="walletName">Wallet Name</Label>
              <Input
                id="walletName"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="Enter wallet name"
              />
            </div>

            <div>
              <Label htmlFor="password">Master Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
              />
            </div>

            <div>
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(value);
                }}
                placeholder="Create 4-6 digit PIN"
                maxLength={6}
              />
            </div>

            <div>
              <Label htmlFor="confirmPin">Confirm PIN</Label>
              <Input
                id="confirmPin"
                type="password"
                value={confirmPin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setConfirmPin(value);
                }}
                placeholder="Confirm your PIN"
                maxLength={6}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button
              onClick={handleCreateWallet}
              className="w-full"
              disabled={!walletName || !password || !confirmPassword || !pin || !confirmPin}
            >
              Generate Seed Phrase
            </Button>
          </CardContent>
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <CardHeader className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Import Your Existing Wallet</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter your existing seed phrase and password to access your wallet
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="importMnemonic">Seed Phrase</Label>
              <Input
                id="importMnemonic"
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
                placeholder="Enter your 12 or 24 word seed phrase"
              />
            </div>
            <div>
              <Label htmlFor="importPassword">Wallet Password</Label>
              <Input
                id="importPassword"
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Enter your wallet password"
              />
            </div>
            <div>
              <Label htmlFor="importPin">Set PIN (4-6 digits)</Label>
              <Input
                id="importPin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter a PIN for transactions"
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This PIN will be used to authorize transactions
              </p>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            {success && <p className="text-green-500 text-sm">{success}</p>}
            <Button onClick={handleImportWallet} className="w-full" disabled={isCreating}>
              {isCreating ? 'Importing...' : 'Import Wallet'}
            </Button>
          </CardContent>
        </TabsContent>

        <TabsContent value="migrate" className="space-y-6 p-4">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 text-blue-500 mx-auto" />
            <h3 className="text-lg font-semibold">Migrate Your Wallet</h3>
            <p className="text-sm text-muted-foreground">
              Upgrade your existing wallet to our new secure system with PIN protection
            </p>
          </div>

          {user?.walletAddress && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Current wallet:</strong> {user.walletAddress.substring(0, 10)}...
                <br />
                All assets will be transferred to your new secure wallet.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="oldSecretKey">Current Wallet Secret Key</Label>
              <Input
                id="oldSecretKey"
                type="password"
                value={oldSecretKey}
                onChange={(e) => setOldSecretKey(e.target.value)}
                placeholder="Enter your current wallet secret key"
                disabled={isMigrating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is needed to transfer your assets to the new secure wallet
              </p>
            </div>

            <div>
              <Label htmlFor="migrationPassword">New Secure Wallet Password</Label>
              <Input
                id="migrationPassword"
                type="password"
                value={migrationPassword}
                onChange={(e) => setMigrationPassword(e.target.value)}
                placeholder="Create a strong password for your new secure wallet"
                disabled={isMigrating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use a strong password - you'll need this to unlock your wallet
              </p>
            </div>

            {isMigrating && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {migrationStep === 1 && "Creating new secure wallet..."}
                  {migrationStep === 2 && "Preparing old account for migration..."}
                  {migrationStep === 3 && "Transferring assets to new wallet..."}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(migrationStep / 3) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            <Button
              onClick={handleMigrateWallet}
              disabled={!oldSecretKey || !migrationPassword || isMigrating}
              className="w-full"
              size="lg"
            >
              {isMigrating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Migrating Wallet...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Migrate to Secure Wallet
                </>
              )}
            </Button>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Make sure to save your new wallet password securely.
                After migration, your old secret key will no longer be valid.
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}