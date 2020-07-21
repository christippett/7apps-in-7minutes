var firebaseConfig = {
  apiKey: "AIzaSyByOwFS8nM7GQ_FBWvT0Pcuj778HlEn85g",
  authDomain: "servian-labs-7apps.firebaseapp.com",
  databaseURL: "https://servian-labs-7apps.firebaseio.com",
  projectId: "servian-labs-7apps",
  storageBucket: "servian-labs-7apps.appspot.com",
  messagingSenderId: "110249693859",
  appId: "1:110249693859:web:494d7e1e6ae0a74941e516",
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

var db = firebase.firestore();

function startLogListener(buildId, callback) {
  var unsubscribe = db
    .collection("logs")
    .where("resource.labels.build_id", "==", buildId)
    .onSnapshot(function (querySnapshot) {
      querySnapshot.forEach(callback);
    });
  return unsubscribe;
}

async function triggerBuild() {
  resp = fetch("/", {
    method: "POST",
  });
}
