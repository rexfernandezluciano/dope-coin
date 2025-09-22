import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import React from "react";
import { Badge } from "../components/ui/badge.js";

const HelpPage: React.FC = () => {
  const { category, page } = useParams<{ category: string; page: string }>();

  const renderHelpContent = () => {
    switch (category) {
      case "default":
        switch (page) {
          case "home":
            return (
              <p>
                Welcome to the help section! Here you can find information about
                how to use DOPE Chain.
              </p>
            );
          case "getting-started":
            return <p>Getting started with DOPE Chain.</p>;
          case "mining":
            return <p>Learn how to mine DOPE Coin.</p>;
          case "trading":
            return <p>Learn how to trade DOPE Coin.</p>;
          case "referrals":
            return <p>Learn how to earn DOPE Coin through referrals.</p>;
          case "history":
            return <p>Learn how to view your transaction history.</p>;
          case "contact":
            return <p>Contact us for support.</p>;
          default:
            return <p>Page not found.</p>;
        }
      case "activations":
        switch (page) {
          case "accounts": {
            return (
              <div className="space-y-3">
                <h2 className="font-bold">Activating your account</h2>
                <p>
                  To activate your account, you need to complete the following
                  steps:</p>
                <ol className="list-decimal list-inside">
                  <li>Verify your email address.</li>
                  <li>Complete your profile.</li>
                  <li>Deposit funds to your wallet.</li>
                  <li>Start mining DOPE Coin.</li>
                </ol>
                <p>After all of that, you can now use your wallet.</p>
              </div>);
          }
          default:
            return <p>Page not found.</p>;
        }
      default:
        return <p>Category not found.</p>;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Help Center</h1>
      {category && page && (
      <div className="flex space-x-1">
        <Badge>{category.toUpperCase()}</Badge>
        <span>{"->"}</span>
        <Badge>{page.toUpperCase()}</Badge>
      </div>
      )}
      {/* Help content based on the category and page */}
      <div className="py-3">{renderHelpContent()}
        <div className="bg-gray-100 p-3 rounded-lg border mt-3">
          <p>If you have any questions, please contact us at <a href="mailto:support@dopechain.com">support@dopechain.com</a>.</p>
          <div className="text-center space-y-2 mt-4">
            <p>How was your experience?</p>
            <div className="flex justify-center space-x-2">
              <Badge className="bg-success hover:bg-green-500" onClick={() => {}}>Good</Badge>
              <Badge className="bg-red-200 text-primary hover:bg-red-500" onClick={() => {}}>Bad</Badge>
              <Badge className="bg-gray-200 text-primary hover:bg-gray-500" onClick={() => {}}>Neutral</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
