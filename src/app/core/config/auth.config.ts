import { BrowserCacheLocation, Configuration, LogLevel } from "@azure/msal-browser";
import { environment } from "src/environments/environment";

const isIE = window.navigator.userAgent.indexOf('MSIE') > -1 || window.navigator.userAgent.indexOf("Trident/") > -1;
export const msalConfig: Configuration = {
  auth: {
    clientId: environment.azureConfig.clientId,
    authority: environment.azureConfig.authority,
    redirectUri: environment.azureConfig.redirectURL,
    postLogoutRedirectUri: environment.azureConfig.redirectURL,
    navigateToLoginRequestUrl: false
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: isIE
  },
  system: {
    loggerOptions: {
      loggerCallback(logLevel: LogLevel, message: string) {
      },
      logLevel: LogLevel.Verbose,
      piiLoggingEnabled: false
    }
  }
}

export const protectedResources = {
  loginApi: {
    endpoint: environment.apiUrl,
    scopes: [environment.azureConfig.scopes]
  }
}

export const loginRequest = {
  scopes: [environment.azureConfig.scopes]
};
