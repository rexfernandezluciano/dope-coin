import {
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownLeft,
  UserPlus,
  Shield,
  Repeat,
  Gift,
} from "lucide-react";

export const getActivityIcon = (type: string) => {
  switch (type) {
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
      return <Shield className="text-orange-500 text-sm" />; // Add this line
    default:
      return <Plus className="text-green-500 text-sm" />;
  }
};

export const getActivityLabel = (type: string) => {
  switch (type) {
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
