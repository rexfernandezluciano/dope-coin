
import { useState } from 'react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { keyVault } from '../lib/keyVault.js';

interface PinVerificationProps {
  walletId: string;
  onVerified: (pin: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export function PinVerification({ 
  walletId, 
  onVerified, 
  onCancel, 
  title = "Enter PIN",
  description = "Please enter your PIN to authorize this transaction"
}: PinVerificationProps) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Check if vault is unlocked first
      if (!keyVault.isVaultUnlocked()) {
        setError('Wallet vault is locked. Please unlock your wallet first.');
        return;
      }

      // For PIN verification, we can either authorize the transaction or just validate the PIN
      // Since we're dealing with wallet sessions, let's verify the PIN is correct
      const isAuthorized = await keyVault.authorizeTransaction(walletId, pin);
      if (isAuthorized) {
        onVerified(pin);
      } else {
        setError('Invalid PIN');
      }
    } catch (error: any) {
      setError(error.message || 'PIN verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card className="w-full border-0 max-w-md shadow-none rounded-0 mx-auto">
      <CardHeader className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPin(value);
                setError('');
              }}
              placeholder="Enter PIN"
              className="pr-10 text-center text-lg tracking-widest"
              autoComplete="off"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={pin.length < 4 || isVerifying}
            >
              {isVerifying ? 'Verifying...' : 'Confirm'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
