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

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

const validationApiBase = trimTrailingSlashes(environment.validationApiUrl);

export const protectedResources = {
  loginApi: {
    endpoint: environment.apiUrl,
    scopes: [environment.azureConfig.scopes]
  },
  /** MSAL v2: map value `null` = unprotected (interceptor passes through, no token). */
  validationApi: {
    baseUrl: validationApiBase,
    pathWildcard: `${validationApiBase}/Validation/*`,
  }
}

export const loginRequest = {
  scopes: [environment.azureConfig.scopes]
};
