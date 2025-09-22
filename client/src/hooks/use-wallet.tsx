
import { useState, useEffect } from 'react';
import { keyVault } from '../lib/keyVault.js';

interface WalletHook {
  isInitialized: boolean;
  currentWallet: any;
  createWallet: (name: string, password: string) => Promise<string>;
  unlockWallet: (vaultId: string, password: string) => Promise<void>;
  addWallet: (name: string, derivationPath?: string, password?: string) => Promise<string>;
  isLocked: boolean;
  lockWallet: () => void;
}

export function useWallet(): WalletHook {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentWallet, setCurrentWallet] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    initializeKeyVault();
    
    // Listen for wallet unlocked event from registration
    const handleWalletUnlocked = () => {
      setIsLocked(false);
    };
    
    window.addEventListener("wallet:unlocked", handleWalletUnlocked);
    
    return () => {
      window.removeEventListener("wallet:unlocked", handleWalletUnlocked);
    };
  }, []);

  const initializeKeyVault = async () => {
    try {
      await keyVault.initialize();
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize KeyVault:', error);
    }
  };

  const createWallet = async (name: string, password: string): Promise<string> => {
    const mnemonic = keyVault.generateMnemonic(256); // 24 words
    const vaultId = await keyVault.createVault(name, password, mnemonic);
    await keyVault.unlockVault(vaultId, password);
    const walletId = await keyVault.addWallet('Main Wallet', "m/44'/148'/0'/0/0", password);
    const wallet = keyVault.getWallet(walletId);
    setCurrentWallet(wallet);
    setIsLocked(false);
    return vaultId;
  };

  const unlockWallet = async (vaultId: string, password: string): Promise<void> => {
    await keyVault.unlockVault(vaultId, password);
    setIsLocked(false);
  };

  const addWallet = async (name: string, derivationPath?: string, password?: string): Promise<string> => {
    const walletId = await keyVault.addWallet(name, derivationPath, password);
    const wallet = keyVault.getWallet(walletId);
    setCurrentWallet(wallet);
    return walletId;
  };

  const lockWallet = () => {
    keyVault.lockVault();
    setCurrentWallet(null);
    setIsLocked(true);
  };

  return {
    isInitialized,
    currentWallet,
    createWallet,
    unlockWallet,
    addWallet,
    isLocked,
    lockWallet
  };
}
