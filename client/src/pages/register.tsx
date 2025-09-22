import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { useAuth } from "../hooks/use-auth.js";
import { useToast } from "../hooks/use-toast.js";
import { Coins, ArrowLeft, ArrowRight, Check } from "lucide-react";

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDone, setIsDone] = useState(false);
  const [response, setResponse] = useState<any>(null);

  const totalSteps = 4;

  // Check for referral code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get("ref");
    if (refCode) {
      setFormData((prev) => ({ ...prev, referralCode: refCode }));
    }
  }, []);

  const handleChange = (e: any) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const saveWallet = async (blob: any) => {
    const a = document.createElement("a");
    a.download = `wallet-${formData.username}.json`;
    a.href = URL.createObjectURL(blob);
    a.addEventListener("click", (e) => {
      setTimeout(() => URL.revokeObjectURL(a.href), 30 * 1000);
    });
    a.click();
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1:
        return (
          formData.fullName.trim() !== "" && formData.username.trim() !== ""
        );
      case 2:
        return formData.email.trim() !== "" && formData.email.includes("@");
      case 3:
        return (
          formData.password.length >= 6 &&
          formData.password === formData.confirmPassword
        );
      case 4:
        return true; // Referral code is optional
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    } else {
      toast({
        title: "Please complete this step",
        description: getValidationMessage(currentStep),
        variant: "destructive",
      });
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const getValidationMessage = (step: number) => {
    switch (step) {
      case 1:
        return "Please enter your full name and choose a username";
      case 2:
        return "Please enter a valid email address";
      case 3:
        if (formData.password.length < 6)
          return "Password must be at least 6 characters";
        if (formData.password !== formData.confirmPassword)
          return "Passwords don't match";
        return "Please complete the password fields";
      default:
        return "Please complete the required fields";
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);

    try {
      const data = await register(formData);
      toast({
        title: "Registration successful",
        description:
          "Welcome to DOPE Chain! Your Wallet has been created. Activate it now to get started.",
      });
      setResponse(data);
      setIsDone(true);
    } catch (error) {
      toast({
        title: "Registration failed",
        description:
          error instanceof Error ? error.message : "Registration failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStepTitle = (step: number) => {
    switch (step) {
      case 1:
        return "Personal Information";
      case 2:
        return "Email Address";
      case 3:
        return "Create Password";
      case 4:
        return "Referral Code";
      default:
        return "Create Account";
    }
  };

  const getStepDescription = (step: number) => {
    switch (step) {
      case 1:
        return "Tell us your name and choose a username";
      case 2:
        return "We'll use this to verify your account";
      case 3:
        return "Choose a secure password for your account";
      case 4:
        return "Have a referral code? Enter it here to earn bonus coins!";
      default:
        return "Join the DOPE Coin network";
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step < currentStep
                ? "bg-green-500 text-white"
                : step === currentStep
                  ? "bg-primary text-white"
                  : "bg-gray-200 text-gray-600"
            }`}
          >
            {step < currentStep ? <Check className="w-4 h-4" /> : step}
          </div>
          {step < totalSteps && (
            <div
              className={`w-12 h-0.5 mx-2 ${
                step < currentStep ? "bg-green-500" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Enter your full name"
                data-testid="input-fullname"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                placeholder="Choose a username"
                data-testid="input-username"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email address"
                data-testid="input-email"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                We'll send you a verification email after registration
              </p>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Create a secure password"
                minLength={6}
                data-testid="input-password"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 6 characters long
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                data-testid="input-confirm-password"
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="referralCode">Referral Code (Optional)</Label>
              <Input
                id="referralCode"
                name="referralCode"
                type="text"
                value={formData.referralCode}
                onChange={handleChange}
                placeholder="Enter referral code if you have one"
                data-testid="input-referral-code"
                autoFocus
              />
              {formData.referralCode ? (
                <p className="text-xs text-green-600">
                  Great! You and your referrer will both receive bonus DOPE
                  coins!
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Skip this step if you don't have a referral code
                </p>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleKeyPress = (e: any) => {
    if (e.key === "Enter") {
      if (currentStep < totalSteps) {
        nextStep();
      } else {
        handleSubmit();
      }
    }
  };

  return (
    <div className="min-h-screen bg-white md:bg-background flex items-center justify-center md:p-4">
      {!isDone ? (
        <Card className="w-full max-w-md rounded-none border-none md:rounded-lg shadow-none md:border-1">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-primary">
                DOPE Chain
              </span>
            </div>
            <CardTitle data-testid="title-register">
              {getStepTitle(currentStep)}
            </CardTitle>
            <CardDescription>{getStepDescription(currentStep)}</CardDescription>
          </CardHeader>
          <CardContent>
            {renderStepIndicator()}

            <div onKeyPress={handleKeyPress}>
              {renderStepContent()}

              <div className="flex justify-between mt-6 space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className="flex items-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>

                {currentStep < totalSteps ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    className="flex items-center space-x-2 gradient-bg hover:opacity-90"
                  >
                    <span>Next</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    className="flex items-center space-x-2 gradient-bg hover:opacity-90"
                    disabled={isLoading}
                    data-testid="button-register"
                  >
                    {isLoading ? (
                      <span>Creating account...</span>
                    ) : (
                      <>
                        <span>Create Account</span>
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">
                Already have an account?{" "}
              </span>
              <Link href="/login">
                <a
                  className="text-primary hover:underline font-medium"
                  data-testid="link-login"
                >
                  Sign in
                </a>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md rounded-none border-none md:rounded-lg shadow-none md:border-1">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-primary">
                DOPE Chain
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary mb-2">
                  Account Created Successfully!
                </h1>
                <p className="text-muted-foreground">
                  Your secure wallet has been set up. You can now access your dashboard to start using DOPE Chain.
                </p>
              </div>
            </div>

            <div className="space-y-4 my-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">🔐 Your Wallet is Secure</h3>
                <p className="text-sm text-blue-800">
                  Your wallet keys are encrypted and stored securely. You can access your wallet using your login credentials and PIN.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-semibold text-amber-900 mb-2">⚡ Next Steps</h3>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Set up your wallet PIN for transactions</li>
                  <li>• Add funds to start trading</li>
                  <li>• Explore DOPE coin features</li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2">🎉 Welcome Bonus</h3>
                <p className="text-sm text-green-800">
                  Your account is ready to receive DOPE coins and start mining!
                </p>
              </div>
            </div>

            <div className="flex flex-col space-y-3">
              <Button
                className="gradient-bg hover:opacity-90"
                onClick={() => setLocation("/wallet")}
                data-testid="button-go-to-wallet"
              >
                Access My Wallet
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
