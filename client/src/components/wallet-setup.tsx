
import { useState } from 'react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Label } from './ui/label.js';
import { Wallet, Shield, Key, Copy, Check } from 'lucide-react';
import { useWallet } from '../hooks/use-wallet.js';
import { keyVault } from '../lib/keyVault.js';

interface WalletSetupProps {
  onComplete: (vaultId: string) => void;
}

export function WalletSetup({ onComplete }: WalletSetupProps) {
  const [step, setStep] = useState(1);
  const [walletName, setWalletName] = useState('My DOPE Wallet');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { createWallet } = useWallet();

  const generateMnemonic = () => {
    const generated = keyVault.generateMnemonic(256); // 24 words
    setMnemonic(generated);
    setStep(2);
  };

  const copyMnemonic = async () => {
    await navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateWallet = async () => {
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    if (pin !== confirmPin) {
      alert('PINs do not match');
      return;
    }
    if (pin.length < 4) {
      alert('PIN must be at least 4 digits');
      return;
    }

    setIsCreating(true);
    try {
      const vaultId = await createWallet(walletName, password);
      onComplete(vaultId);
    } catch (error: any) {
      console.error('Wallet creation failed:', error);
      alert('Failed to create wallet. Please try again: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {step === 1 && (
        <Card>
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

            <Button 
              onClick={generateMnemonic} 
              className="w-full"
              disabled={!walletName || !password || !confirmPassword || !pin || !confirmPin}
            >
              Generate Seed Phrase
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
              <Key className="w-6 h-6 text-yellow-600" />
            </div>
            <CardTitle>Your Seed Phrase</CardTitle>
            <p className="text-sm text-muted-foreground">
              Write down these words in order and store them safely. This is the only way to recover your wallet.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-lg">
              {mnemonic.split(' ').map((word, index) => (
                <div key={index} className="text-sm text-center p-2 bg-background rounded">
                  <span className="text-xs text-muted-foreground">{index + 1}.</span>
                  <div className="font-medium">{word}</div>
                </div>
              ))}
            </div>

            <Button onClick={copyMnemonic} variant="outline" className="w-full">
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Seed Phrase
                </>
              )}
            </Button>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start">
                <Shield className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <strong>Important:</strong> Anyone with access to this seed phrase can control your wallet. Never share it online or with anyone.
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={handleCreateWallet} 
                className="flex-1"
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Wallet'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
