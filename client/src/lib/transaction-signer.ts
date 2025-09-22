
import { keyVault } from './keyVault.js';
import * as StellarSDK from 'stellar-sdk';

export class TransactionSigner {
  static async signTransaction(
    walletId: string,
    pin: string,
    transactionXDR: string,
    networkPassphrase: string = StellarSDK.Networks.TESTNET
  ): Promise<string> {
    try {
      // Verify PIN and get authorization
      const isAuthorized = await keyVault.authorizeTransaction(walletId, pin);
      if (!isAuthorized) {
        throw new Error('PIN verification failed');
      }

      // Sign the transaction using the secure vault
      const signedXDR = await keyVault.signTransaction(walletId, pin, transactionXDR);
      
      return signedXDR;
    } catch (error) {
      console.error('Transaction signing failed:', error);
      throw error;
    }
  }

  static async prepareTransaction(
    sourceAccount: string,
    operations: any[],
    networkPassphrase: string = StellarSDK.Networks.TESTNET
  ): Promise<string> {
    try {
      const server = new StellarSDK.Server('https://horizon-testnet.stellar.org');
      const account = await server.loadAccount(sourceAccount);
      
      const transaction = new StellarSDK.TransactionBuilder(account, {
        fee: StellarSDK.BASE_FEE,
        networkPassphrase
      });

      // Add operations
      operations.forEach(op => transaction.addOperation(op));
      
      const builtTransaction = transaction.setTimeout(300).build();
      return builtTransaction.toXDR();
    } catch (error) {
      console.error('Transaction preparation failed:', error);
      throw error;
    }
  }
}
