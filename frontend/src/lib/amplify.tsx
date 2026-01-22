"use client";

import { useEffect, useState, ReactNode } from "react";
import { Amplify, ResourcesConfig } from "aws-amplify";

// Cognito configuration from environment variables
const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
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
      // eslint-disable-next-line
      setIsConfigured(true);
    } catch (error) {
      console.error("Failed to configure Amplify:", error);
      // eslint-disable-next-line
      setIsConfigured(true); // Still render children
    }
  }, []);

  // Show nothing while configuring to prevent hydration mismatch
  if (!isConfigured) {
    return null;
  }

  return <>{children}</>;
}
