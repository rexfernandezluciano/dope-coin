import { Plus, ArrowUpRight, ArrowDownLeft, UserPlus } from "lucide-react";

export const getActivityIcon = (type: string) => {
  switch (type) {
    case "mining_reward":
      return <Plus className="text-green-500 text-sm" />;
    case "send":
      return <ArrowUpRight className="text-red-500 text-sm" />;
    case "receive":
      return <ArrowDownLeft className="text-blue-500 text-sm" />;
    case "referral_bonus":
      return <UserPlus className="text-purple-500 text-sm" />;
    default:
      return <Plus className="text-green-500 text-sm" />;
  }
};

export const getActivityLabel = (type: string) => {
  switch (type) {
    case "mining_reward":
      return "Mining Reward";
    case "send":
      return "Sent Tokens";
    case "receive":
      return "Received Tokens";
    case "referral_bonus":
      return "Referral Bonus";
    default:
      return "Transaction";
  }
};