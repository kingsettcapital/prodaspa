export const environment = {
  // apiUrl : "http://localhost:5005/api",
  apiUrl: "https://prodagatewaydev.kingsettcapital.com/api",
  apiKey: "118dab24-8387-40e6-865d-04f55d4aaaa9",
  production: false,
  appVersion: require('../../package.json').version,
  azureConfig: {
    clientId: '297477b6-8858-4fd3-b3af-a94ca8417383',
    authority: 'https://login.microsoftonline.com/f6d94abc-5472-43af-ab66-95726e5ab0cc',
    redirectURL: 'http://localhost:4200',
    scopes: "api://72f4a3ee-d31a-49a9-81d7-22ceaa896746/Read",
  },
};

// export const environment = {
//   production: false,
//   apiKey: "118dab24-8387-40e6-865d-04f55d4aaaa9"
// };