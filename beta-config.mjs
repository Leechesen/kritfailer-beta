// Local testing is ready without a cloud account. For online testing, use a NEW
// Firebase project with beta/test/dev in its ID. Never paste production config.
export const betaConfig = {
  environment: "beta",
  mode: "online",
  expectedProjectId: "kritfail-5ab0a",
  firebase: {
    apiKey: "AIzaSyDjDSkZJr5sJoJrtUM-zJu-bd9WzXyDnao",
    projectId: "kritfail-5ab0a",
    authDomain: "kritfail-5ab0a.firebaseapp.com",
    databaseURL: "https://kritfail-5ab0a-default-rtdb.europe-west1.firebasedatabase.app",
  },
  emulators: { authPort: 9099, databasePort: 9001 },
};
