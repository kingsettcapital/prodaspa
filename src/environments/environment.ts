// src/environments/environment.ts
export const environment = {
  production: false,
  apiKey: "118dab24-8387-40e6-865d-04f55d4aaaa9",
  apiUrl: 'https://localhost:7030/api',
  validationApiUrl: 'http:/localhost:7030/api',
  appName: 'KS DSP SPA',
  version: '1.0.0',
  azureConfig: {
    clientId: '1ca558e3-5dea-49ba-8080-f490ff880c00',
    authority: 'https://login.microsoftonline.com/f6d94abc-5472-43af-ab66-95726e5ab0cc',
    redirectURL: 'http://localhost:4200',
    scopes: "api://72f4a3ee-d31a-49a9-81d7-22ceaa896746/Read",
  }
};

// export const environment = {
//   apiUrl: "http://localhost:5005/api",
//   x_api_key: "3e2aaa46-1b28-4b4c-b363-7915a4d66dc0",
//   production: false,
//   appVersion: require('../../package.json').version,
//   azureConfig: {
//     // Application/client ID of registered SPA app
//     clientId: 'f8982f4d-6af7-4dee-ae33-6d2455bdd246',
//     // https://login.microsoft.com/{Tenant ID of registered SPA app}
//     authority: 'https://login.microsoftonline.com/201f8a10-22eb-42e9-ad2c-8d16feabf5ec',
//     // Scope set for registered API app
//     scopes: 'api://30a6d94d-df81-40ac-8cb8-af77fec0ce38/read'
//   },
// };