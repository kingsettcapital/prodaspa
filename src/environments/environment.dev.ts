export const environment = {
  // apiUrl : "http://localhost:5005/api",
  apiUrl: "https://prodagatewaydev.kingsettcapital.com/api",
  validationApiUrl: "https://prodagatewaydev.kingsettcapital.com/api",
  apiKey: "118dab24-8387-40e6-865d-04f55d4aaaa9",
  production: false,
  appVersion: require('../../package.json').version,
  SSO: true,
  azureConfig: {
    clientId: '1ca558e3-5dea-49ba-8080-f490ff880c00',
    authority: 'https://login.microsoftonline.com/f6d94abc-5472-43af-ab66-95726e5ab0cc',
    redirectURL: 'https://prodadev.kingsettcapital.com/',
    scopes: "api://7faad414-e5b5-46f8-b2fa-9eb7272f8fea/Read",
  },
};

// export const environment = {
//   production: false,
//   apiKey: "118dab24-8387-40e6-865d-04f55d4aaaa9"
// };