export const environment = {
  apiUrl: "https://prodagatewayuat.kingsettcapital.com/api",
  validationApiUrl: "https://prodagatewayuat.kingsettcapital.com/api",
  apiKey: "118dab24-8387-40e6-865d-04f55d4aaaa9",
  production: false,
  appVersion: require('../../package.json').version,
  azureConfig: {
    clientId: '1ca558e3-5dea-49ba-8080-f490ff880c00',
    authority: 'https://login.microsoftonline.com/f6d94abc-5472-43af-ab66-95726e5ab0cc',
    redirectURL: 'http://localhost:4200',
    scopes: "api://7faad414-e5b5-46f8-b2fa-9eb7272f8fea",
  }
};
