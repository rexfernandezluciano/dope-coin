import {
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownLeft,
  UserPlus,
  Shield,
  Repeat,
  Gift,
  Settings,
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Database,
  Hash,
  Coins,
  Lock,
  Unlock,
  Merge,
  Banknote,
} from "lucide-react";

export const getActivityIcon = (type: string) => {
  switch (type) {
    // Original types
    case "mining_reward":
      return <Plus className="text-green-500 text-sm" />;
    case "send":
      return <ArrowUpRight className="text-red-500 text-sm" />;
    case "receive":
      return <ArrowDownLeft className="text-blue-500 text-sm" />;
    case "referral_bonus":
      return <Gift className="text-purple-500 text-sm" />;
    case "trade":
      return <Repeat className="text-yellow-500 text-sm" />;
    case "add_liquidity":
      return <Plus className="text-green-500 text-sm" />;
    case "remove_liquidity":
      return <Minus className="text-red-500 text-sm" />;
    case "gas_conversion":
      return <Repeat className="text-yellow-500 text-sm" />;
    case "trustline":
      return <Shield className="text-orange-500 text-sm" />;

    // Stellar operation types
    case "account_creation":
      return <UserPlus className="text-blue-500 text-sm" />;
    case "payment_sent":
      return <ArrowUpRight className="text-red-500 text-sm" />;
    case "payment_received":
      return <ArrowDownLeft className="text-green-500 text-sm" />;
    case "path_payment_sent":
      return <ArrowUpRight className="text-orange-500 text-sm" />;
    case "path_payment_received":
      return <ArrowDownLeft className="text-orange-500 text-sm" />;
    case "trustline_created":
      return <Shield className="text-blue-500 text-sm" />;
    case "trustline_removed":
      return <Shield className="text-red-500 text-sm" />;
    case "sell_offer":
      return <TrendingDown className="text-red-500 text-sm" />;
    case "buy_offer":
      return <TrendingUp className="text-green-500 text-sm" />;
    case "passive_offer":
      return <Repeat className="text-yellow-500 text-sm" />;
    case "account_options":
      return <Settings className="text-gray-500 text-sm" />;
    case "trust_authorized":
      return <Unlock className="text-green-500 text-sm" />;
    case "trust_revoked":
      return <Lock className="text-red-500 text-sm" />;
    case "account_merge":
      return <Merge className="text-purple-500 text-sm" />;
    case "inflation":
      return <Plus className="text-green-500 text-sm" />;
    case "data_entry":
      return <Database className="text-gray-500 text-sm" />;
    case "sequence_bump":
      return <Hash className="text-gray-500 text-sm" />;
    case "claimable_balance_created":
      return <Gift className="text-blue-500 text-sm" />;
    case "claimable_balance_claimed":
      return <Gift className="text-green-500 text-sm" />;
    case "claimable_balance_clawed_back":
      return <Gift className="text-red-500 text-sm" />;
    case "clawback":
      return <ArrowDownLeft className="text-red-500 text-sm" />;
    case "trustline_flags_set":
      return <Settings className="text-orange-500 text-sm" />;
    case "liquidity_pool_deposit":
      return <Plus className="text-blue-500 text-sm" />;
    case "liquidity_pool_withdraw":
      return <Minus className="text-orange-500 text-sm" />;

    default:
      return <Coins className="text-gray-500 text-sm" />;
  }
};

export const getActivityLabel = (type: string) => {
  switch (type) {
    // Original types
    case "mining_reward":
      return "Reward";
    case "send":
      return "Sent";
    case "receive":
      return "Received";
    case "referral_bonus":
      return "Bonus";
    case "trade":
      return "Trade";
    case "add_liquidity":
      return "Liquidity Added";
    case "remove_liquidity":
      return "Liquidity Removed";
    case "gas_conversion":
      return "GAS Conversion";
    case "trustline":
      return "Authorize Asset";

    // Stellar operation types
    case "account_creation":
      return "Account Created";
    case "payment_sent":
      return "Payment Sent";
    case "payment_received":
      return "Payment Received";
    case "path_payment_sent":
      return "Path Payment Sent";
    case "path_payment_received":
      return "Path Payment Received";
    case "trustline_created":
      return "Asset Authorized";
    case "trustline_removed":
      return "Asset Removed";
    case "sell_offer":
      return "Sell Order";
    case "buy_offer":
      return "Buy Order";
    case "passive_offer":
      return "Passive Order";
    case "account_options":
      return "Account Settings";
    case "trust_authorized":
      return "Trust Authorized";
    case "trust_revoked":
      return "Trust Revoked";
    case "account_merge":
      return "Account Merged";
    case "inflation":
      return "Inflation Reward";
    case "data_entry":
      return "Data Entry";
    case "sequence_bump":
      return "Sequence Bump";
    case "claimable_balance_created":
      return "Gift Created";
    case "claimable_balance_claimed":
      return "Gift Claimed";
    case "claimable_balance_clawed_back":
      return "Gift Revoked";
    case "clawback":
      return "Asset Clawed Back";
    case "trustline_flags_set":
      return "Asset Flags Set";
    case "liquidity_pool_deposit":
      return "Pool Deposit";
    case "liquidity_pool_withdraw":
      return "Pool Withdrawal";

    default:
      return "Transaction";
  }
};

export const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
    case "success":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
    case "error":
      return "destructive";
    default:
      return "outline";
  }
};

// Helper function to get activity color for amounts
export const getAmountColor = (type: string, amount: string) => {
  const isPositive = parseFloat(amount) > 0;

  switch (type) {
    case "payment_received":
    case "path_payment_received":
    case "claimable_balance_claimed":
    case "mining_reward":
    case "referral_bonus":
    case "inflation":
      return "text-green-500";

    case "payment_sent":
    case "path_payment_sent":
    case "clawback":
    case "claimable_balance_clawed_back":
      return "text-red-500";

    case "buy_offer":
    case "sell_offer":
    case "passive_offer":
    case "gas_conversion":
      return "text-yellow-500";

    case "liquidity_pool_deposit":
    case "liquidity_pool_withdraw":
      return "text-blue-500";

    default:
      return isPositive ? "text-green-500" : "text-red-500";
  }
};

// Helper function to determine if operation affects balance
export const isBalanceAffecting = (type: string) => {
  const balanceAffectingTypes = [
    "payment_sent",
    "payment_received",
    "path_payment_sent", 
    "path_payment_received",
    "claimable_balance_claimed",
    "clawback",
    "account_creation",
    "inflation",
    "liquidity_pool_deposit",
    "liquidity_pool_withdraw",
    "mining_reward",
    "referral_bonus",
    "gas_conversion"
  ];

  return balanceAffectingTypes.includes(type);
};

// Helper function to get operation category
export const getOperationCategory = (type: string) => {
  if ([
    "payment_sent", "payment_received", 
    "path_payment_sent", "path_payment_received",
    "send", "receive"
  ].includes(type)) {
    return "payments";
  }

  if ([
    "trustline_created", "trustline_removed", 
    "trust_authorized", "trust_revoked",
    "trustline_flags_set", "trustline"
  ].includes(type)) {
    return "trustlines";
  }

  if ([
    "sell_offer", "buy_offer", "passive_offer", "trade"
  ].includes(type)) {
    return "trading";
  }

  if ([
    "claimable_balance_created", "claimable_balance_claimed",
    "claimable_balance_clawed_back", "clawback"
  ].includes(type)) {
    return "claimable_balances";
  }

  if ([
    "liquidity_pool_deposit", "liquidity_pool_withdraw",
    "add_liquidity", "remove_liquidity"
  ].includes(type)) {
    return "liquidity";
  }

  if ([
    "account_creation", "account_options", "account_merge"
  ].includes(type)) {
    return "account_management";
  }

  return "other";
};