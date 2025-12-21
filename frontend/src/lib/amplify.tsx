"use client";

import { useEffect, useState, ReactNode } from "react";
import { Amplify, ResourcesConfig } from "aws-amplify";

// Cognito configuration with hardcoded dev values
const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: "ap-northeast-1_I3NE9dKT6",
      userPoolClientId: "3kv8dje13pfu1am91ck2bma0n0",
      loginWith: {
        email: true,
      },
      signUpVerificationMethod: "code",
      userAttributes: {
        email: {
          required: true,
        },
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true,
      },
    },
  },
};

export function AmplifyProvider({ children }: { children: ReactNode }) {
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    // Configure Amplify only on client side
    try {
      Amplify.configure(amplifyConfig);
      setIsConfigured(true);
    } catch (error) {
      console.error("Failed to configure Amplify:", error);
      setIsConfigured(true); // Still render children
    }
  }, []);

  // Show nothing while configuring to prevent hydration mismatch
  if (!isConfigured) {
    return null;
  }

  return <>{children}</>;
}
